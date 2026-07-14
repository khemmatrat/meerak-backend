"""
Grok Video Generation API — text-to-video / image-to-video

เส้นทางสองแบบ (สลับด้วย env ไม่ทับกัน):
  • REST (ค่าเริ่มต้น): POST /v1/videos/generations → poll GET /v1/videos/{request_id} (urllib)
  • SDK: xai_sdk.Client().video.generate (gRPC ไป api.x.ai) เมื่อ GROK_VIDEO_USE_XAI_SDK=1

สถานะ poll (REST): pending, done, failed, expired (+ alias)
โมเดล: grok-imagine-video — duration 1–15s, resolution 480p|720p

ถ้า SDK ล้มเหลวและ GROK_VIDEO_SDK_FALLBACK_REST=1 (ค่าเริ่มต้น) จะลอง REST ต่อ
"""

from __future__ import annotations

import base64
import json
import logging
import re
import subprocess
import tempfile
import time
import uuid
from collections.abc import Callable
from datetime import timedelta
from pathlib import Path
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

from factory.prompt_expander import GROK_PROMPT_MAX_CHARS, clean_prompt_structure

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent
ENV_FILE = AQOND_BRAIN / ".env"


def _env_truthy(raw: str | None) -> bool:
    return str(raw or "").strip().lower() in {"1", "true", "yes", "on"}


def _load_env() -> dict[str, str]:
    out = {}
    if not ENV_FILE.exists():
        return out
    for line in open(ENV_FILE, "r", encoding="utf-8"):
        line = line.split("#")[0].strip()
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        if v:
            out[k.strip()] = v
    return out


def prepare_reference_image_for_api(src: Path, logger: logging.Logger) -> Path:
    """
    ย่อรูป ref ถ้าใหญ่เกิน (ลดขนาด JSON / timeout) — คืน path ที่ใช้จริง (อาจเป็นไฟล์ชั่วคราว .jpg)
    """
    log = logger
    env = _load_env()
    try:
        max_edge = int((env.get("GROK_REF_IMAGE_MAX_EDGE") or "1280").strip() or "1280")
    except ValueError:
        max_edge = 1280
    max_edge = max(512, min(max_edge, 2048))

    try:
        from PIL import Image  # type: ignore

        with Image.open(src) as im:
            im = im.convert("RGB")
            w, h = im.size
            if max(w, h) <= max_edge:
                return src
            scale = max_edge / float(max(w, h))
            nw, nh = int(w * scale), int(h * scale)
            try:
                resample = Image.Resampling.LANCZOS  # Pillow >= 9.1
            except AttributeError:
                resample = Image.LANCZOS
            im = im.resize((nw, nh), resample)
            fd, tmp_path = tempfile.mkstemp(suffix="_grok_ref.jpg", prefix="aqond_")
            import os

            os.close(fd)
            outp = Path(tmp_path)
            im.save(outp, format="JPEG", quality=88, optimize=True)
            log.info(
                "[Grok Video] Resized ref %s → %dx%d (max edge %d)",
                src.name,
                nw,
                nh,
                max_edge,
            )
            return outp
    except Exception as e:
        log.warning("[Grok Video] PIL resize skipped (%s) — using original file", e)
        return src


def _url_looks_like_low_res_stub(url: str) -> bool:
    """Deprioritize CDN paths that often point to tiny preview stubs (e.g. scene_00.mp4)."""
    u = (url or "").lower()
    if "scene_" in u and u.endswith(".mp4"):
        return True
    if "/scene_" in u and ".mp4" in u:
        return True
    return False


def _sort_video_url_candidates(candidates: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Prefer HD-ish URLs; push scene_NN.mp4-style stubs to the end."""

    def key(item: tuple[str, str]) -> tuple[int, int, str]:
        label, url = item
        u = url.lower()
        stub = 1 if _url_looks_like_low_res_stub(url) else 0
        hd = 0 if ("_hd" in u or "/hd" in u or "high" in u) else 1
        return (stub, hd, label)

    return sorted(candidates, key=key)


def _video_urls_from_poll_payload(video_obj: dict) -> list[tuple[str, str]]:
    """
    ลำดับ URL สำหรับดาวน์โหลด — บาง response มีหลายฟิลด์; ชื่อ _hd มักเป็นต้นฉบับใหญ่กว่า
    """
    if not isinstance(video_obj, dict):
        return []
    keys_priority = (
        "url_hd",
        "hd_url",
        "high_res_url",
        "high_resolution_url",
        "download_url",
        "url",
    )
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for k in keys_priority:
        u = video_obj.get(k)
        if isinstance(u, str) and u.startswith("http") and u not in seen:
            seen.add(u)
            out.append((k, u))
    for k, u in video_obj.items():
        if (
            isinstance(k, str)
            and isinstance(u, str)
            and u.startswith("http")
            and "url" in k.lower()
            and u not in seen
        ):
            seen.add(u)
            out.append((k, u))
    return _sort_video_url_candidates(out)


def _looks_like_mp4_header(data: bytes) -> bool:
    if len(data) < 12:
        return False
    if data[4:8] == b"ftyp":
        return True
    # บางไฟล์มี box นำหน้า
    return b"ftyp" in data[:32]


def _print_console(msg: str) -> None:
    """แสดงใน console/terminal โดยตรง (นอก logger) — ดีบักข้อความจาก xAI"""
    try:
        print(f"[Grok Video] {msg}", flush=True)
    except OSError:
        pass


def _log_tiny_body_full(data: bytes, log: logging.Logger, *, context: str) -> None:
    """ถ้าได้ body เล็กๆ (มักเป็น error JSON/HTML) โหลดออกมาให้หมดใน log + print"""
    if not data:
        return
    preview = 16384
    chunk = data[:preview]
    text = chunk.decode("utf-8", errors="replace")
    safe = text if len(text) < 8000 else text[:8000] + f"\n… (+{len(text) - 8000} chars truncated)"
    msg = f"{context} ({len(data)} bytes) — body preview:\n{safe}"
    log.error("[Grok Video] %s", msg)
    _print_console(msg)


def _format_xai_error_body(data: bytes, max_len: int = 600) -> str:
    text = data.decode("utf-8", errors="replace").strip()
    if not text:
        return f"(empty body, {len(data)} bytes)"
    if data[:1] == b"{":
        try:
            j = json.loads(text)
            if isinstance(j, dict):
                code = j.get("code") or j.get("error_code") or j.get("type")
                msg = j.get("error") or j.get("message") or j.get("detail")
                if isinstance(msg, dict):
                    msg = json.dumps(msg, ensure_ascii=False)[:max_len]
                parts = [p for p in (code, msg) if p]
                if parts:
                    return " | ".join(str(p)[:max_len // 2] for p in parts)[:max_len]
            return text[:max_len]
        except json.JSONDecodeError:
            return text[:max_len]
    if text.startswith("<"):
        return f"HTML/error page ({len(data)} B): {text[:200]}…"
    return text[:max_len]


# สถานะจาก poll xAI — ต้องพร้อมจริงก่อนดาวน์โหลด CDN (กันดึงเร็วเกินได้ 0 B / error)
_STATUS_READY = frozenset(
    {"done", "completed", "complete", "succeeded", "success", "ready", "finished", "ok"}
)
_STATUS_PENDING = frozenset(
    {
        "processing",
        "pending",
        "queued",
        "in_progress",
        "running",
        "starting",
        "submitted",
        "waiting",
        "generating",
        "working",
    }
)
_STATUS_FAILED = frozenset({"failed", "error"})
_STATUS_EXPIRED = frozenset({"expired"})
_STATUS_CANCELLED = frozenset({"cancelled", "canceled"})


def _normalize_poll_status(result: dict) -> str:
    return str(result.get("status") or result.get("state") or "").strip().lower()


def _poll_top_level_error(result: dict) -> str | None:
    """ข้อความ error จาก body poll (ก่อน/คู่กับ status failed) — ตามแพตเทิร์น xAI JSON error"""
    if not isinstance(result, dict):
        return None
    err = result.get("error")
    if isinstance(err, str) and err.strip():
        return err.strip()[:900]
    if isinstance(err, dict):
        code = err.get("code") or err.get("type") or ""
        msg = err.get("message") or err.get("detail") or err
        if not isinstance(msg, str):
            msg = json.dumps(msg, ensure_ascii=False)
        parts = [str(p) for p in (code, msg) if p]
        if parts:
            return " | ".join(parts)[:900]
    return None


def _poll_status_ready_for_download(result: dict) -> bool:
    return _normalize_poll_status(result) in _STATUS_READY


def _nested_video_blocks_download(video_obj: dict) -> bool:
    """True = ยังไม่ควรโหลดจาก CDN (เช่น video.status ยัง processing)"""
    if not isinstance(video_obj, dict):
        return True
    st = video_obj.get("status") or video_obj.get("state")
    if st is None or st == "":
        return False
    sl = str(st).strip().lower()
    if sl in _STATUS_PENDING:
        return True
    if sl in _STATUS_FAILED or sl in _STATUS_EXPIRED or sl in _STATUS_CANCELLED:
        return False
    if sl in _STATUS_READY:
        return False
    return False


def _nested_video_terminal_error(video_obj: dict) -> str | None:
    if not isinstance(video_obj, dict):
        return None
    st = str(video_obj.get("status") or video_obj.get("state") or "").strip().lower()
    if st in _STATUS_FAILED or st in _STATUS_EXPIRED or st in _STATUS_CANCELLED:
        return json.dumps(video_obj, ensure_ascii=False)[:900]
    return None


def _download_cdn_video_with_bearer(
    video_url: str,
    api_key: str,
    log: logging.Logger,
) -> tuple[bytes | None, str | None]:
    """
    ดาวน์โหลดจาก CDN xAI ด้วย urllib (เทียบเท่า requests.get + Bearer)
    xAI ไม่อนุญาตให้ดึงวิดีโอด้วย URL เปล่า — ต้องมี Authorization: Bearer ทุกครั้ง
    """
    if not api_key:
        err = "Download Failed: ไม่มี XAI_API_KEY — ใส่ Bearer ไม่ได้"
        log.error("[Grok Video] %s", err)
        _print_console(err)
        return None, err
    headers: dict[str, str] = {
        "User-Agent": "aqond-brain/grok_video_api",
        "Accept": "*/*",
        "Authorization": f"Bearer {api_key}",
    }
    req = Request(video_url, headers=headers, method="GET")
    try:
        with urlopen(req, timeout=300) as vresp:
            cl = vresp.headers.get("Content-Length")
            ct = (vresp.headers.get("Content-Type") or "").split(";")[0].strip()
            if cl:
                log.info("[Grok Video] ดาวน์โหลด: Content-Length=%s type=%s", cl, ct or "?")
            data = vresp.read()
    except HTTPError as e:
        body = e.read()[:8000] if e.fp else b""
        detail = _format_xai_error_body(body)
        err = f"Download Failed: HTTP {e.code} from xAI CDN — {detail}"
        log.error("[Grok Video] %s", err)
        _log_tiny_body_full(body, log, context=f"CDN error body HTTP {e.code}")
        _print_console(err)
        return None, err
    except Exception as e:
        err = f"Download Failed: network/IO — {e!s}"
        log.error("[Grok Video] %s", err)
        _print_console(err)
        return None, err

    if len(data) < 64:
        err = f"Download Failed: body too short ({len(data)} bytes)"
        log.error("[Grok Video] %s", err)
        _log_tiny_body_full(data, log, context="CDN body too short")
        return None, err

    if data[:1] == b"{" or data[:9].strip().startswith(b"<"):
        err = f"Download Failed: JSON/HTML แทน MP4 ({len(data)} B) — {_format_xai_error_body(data)}"
        log.error("[Grok Video] %s", err)
        _log_tiny_body_full(data, log, context="CDN returned JSON/HTML แทน MP4")
        return None, err

    suspicious_small = len(data) < 100_000
    if suspicious_small and not _looks_like_mp4_header(data):
        err = (
            f"Download Failed: {len(data)} bytes ไม่มี MP4 ftyp — "
            f"อาจเป็น error page — {_format_xai_error_body(data)}"
        )
        log.error("[Grok Video] %s", err)
        _log_tiny_body_full(data, log, context="CDN body ไม่ใช่ MP4 header")
        return None, err

    if not _looks_like_mp4_header(data):
        log.warning(
            "[Grok Video] ไบต์ต้นไฟล์ไม่เหมือน MP4 ทั่วไป (ได้ %d bytes) — ยังยอมรับถ้าผ่านขนาดขั้นต่ำภายหลัง",
            len(data),
        )
    return data, None


def _download_best_video_variant(
    video_obj: dict,
    api_key: str,
    log: logging.Logger,
    env: dict[str, str],
) -> tuple[bytes | None, str | None, str | None]:
    """
    ลองดาวน์โหลดตามลำดับ URL — ทุกครั้งใช้ Authorization: Bearer {XAI_API_KEY} เท่านั้น
    (ไม่มีโหมดดาวน์โหลด CDN แบบไม่ใส่ header — xAI ไม่อนุญาต)
    """
    if env.get("GROK_VIDEO_DOWNLOAD_USE_AUTH", "1").strip() == "0":
        log.warning(
            "[Grok Video] GROK_VIDEO_DOWNLOAD_USE_AUTH=0 ถูกละเว้น — CDN ยังบังคับ Bearer อยู่ดี"
        )
    try:
        min_bytes = int((env.get("GROK_VIDEO_MIN_BYTES") or "120000").strip())
    except ValueError:
        min_bytes = 120_000
    min_bytes = max(40_000, min(min_bytes, 80_000_000))

    candidates = _video_urls_from_poll_payload(video_obj)
    if not candidates:
        err = "Download Failed: ไม่มี video URL ใน payload จาก poll"
        log.error("[Grok Video] %s; keys=%s", err, list(video_obj.keys()))
        return None, None, err

    last_err: str | None = None
    for label, url in candidates:
        log.info("[Grok Video] ดาวน์โหลด CDN (%s) พร้อม Bearer …", label)
        data, derr = _download_cdn_video_with_bearer(url, api_key, log)
        if data is None:
            last_err = derr
            continue
        if len(data) < min_bytes:
            last_err = (
                f"Download Failed: {label} ได้แค่ {len(data)} B (< GROK_VIDEO_MIN_BYTES={min_bytes}) "
                f"— มักเป็น stub/error ไม่ใช่คลิปเต็ม"
            )
            log.error("[Grok Video] %s", last_err)
            _log_tiny_body_full(data, log, context=f"ไฟล์จิ๋วจาก CDN ({label})")
            _print_console(last_err)
            continue
        return data, url, None
    tail = (
        f"ไม่มี URL ใดได้ไฟล์ใหญ่พอ (ขั้นต่ำ {min_bytes} bytes); keys ใน video: {list(video_obj.keys())}"
    )
    log.error("[Grok Video] Download Failed: %s | last=%s", tail, last_err or "?")
    return None, None, last_err or tail


def _log_saved_clip_probe(path: Path, log: logging.Logger) -> None:
    """แค่ log ข้อมูล ffprobe — ไม่ตัดทิ้งไฟล์จาก Grok"""
    try:
        r = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration,size",
                "-show_entries",
                "stream=width,height,codec_name",
                "-select_streams",
                "v:0",
                "-of",
                "default=noprint_wrappers=1",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if r.returncode == 0 and (r.stdout or "").strip():
            log.info("[Grok Video] ffprobe: %s", " | ".join(r.stdout.splitlines()[:6]))
    except (OSError, subprocess.SubprocessError):
        pass


def _path_to_data_uri(path: Path) -> str:
    raw = path.read_bytes()
    ext = path.suffix.lower()
    mime = (
        "image/jpeg"
        if ext in (".jpg", ".jpeg")
        else "image/png"
        if ext == ".png"
        else "image/webp"
        if ext == ".webp"
        else "application/octet-stream"
    )
    b64 = base64.standard_b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _env_truthy(raw: str | None, default: bool = False) -> bool:
    if raw is None:
        return default
    s = str(raw).strip().lower()
    if not s:
        return default
    return s in ("1", "true", "yes", "on")


def _use_xai_sdk_enabled(env: dict[str, str]) -> bool:
    """GROK_VIDEO_USE_XAI_SDK หรือ alias GROK_VIDEO_USE_SDK"""
    for key in ("GROK_VIDEO_USE_XAI_SDK", "GROK_VIDEO_USE_SDK"):
        if _env_truthy(env.get(key)):
            return True
    return False


def _sdk_fallback_rest_enabled(env: dict[str, str]) -> bool:
    return _env_truthy(env.get("GROK_VIDEO_SDK_FALLBACK_REST"), True)


def _persist_grok_downloaded_bytes(
    video_bytes: bytes,
    video_url: str,
    *,
    request_id: str,
    project_id: str | None,
    scene_index: int | None,
    log: logging.Logger,
    progress_callback: Callable[[dict], None] | None,
    elapsed_sec: int,
    transport: str,
) -> str:
    """บันทึกไบต์จาก CDN ลงดิสก์ — ใช้ร่วม REST + xAI SDK"""
    if project_id is not None and scene_index is not None:
        from factory.clip_storage import grok_imagine_save_path

        tmp = grok_imagine_save_path(
            request_id,
            video_url,
            project_id=project_id,
            scene_index=int(scene_index),
            env_map=_load_env(),
        )
        try:
            tmp.parent.mkdir(parents=True, exist_ok=True)
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
        tmp.write_bytes(video_bytes)
        try:
            rel = tmp.relative_to(AQOND_BRAIN)
        except ValueError:
            rel = tmp
        log.info(
            "[Grok Video] บันทึกเต็มจาก CDN (%s) → grokVideo: %s (%.1f KB)",
            transport,
            rel,
            len(video_bytes) / 1024,
        )
    else:
        tmp = Path(tempfile.mkdtemp(prefix="grok_video_")) / "clip.mp4"
        try:
            tmp.parent.mkdir(parents=True, exist_ok=True)
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
        tmp.write_bytes(video_bytes)
        log.info(
            "[Grok Video] บันทึกชั่วคราว (%s) %.1f KB",
            transport,
            len(video_bytes) / 1024,
        )

    _log_saved_clip_probe(tmp, log)

    if progress_callback:
        try:
            progress_callback(
                {
                    "phase": "grok_done",
                    "message": "ดาวน์โหลดคลิปจาก Grok สำเร็จ",
                    "elapsed_sec": elapsed_sec,
                    "transport": transport,
                }
            )
        except Exception:
            pass
    return str(tmp)


def _generate_video_clip_via_xai_sdk(
    *,
    enhanced_prompt: str,
    dur: int,
    res: str,
    ref_for_api: Path | None,
    api_key: str,
    log: logging.Logger,
    env: dict[str, str],
    poll_max: int,
    poll_interval: float,
    progress_callback: Callable[[dict], None] | None,
    project_id: str | None,
    scene_index: int | None,
    aspect_ratio: str = "16:9",
) -> str | None:
    """
    เส้นทาง xai_sdk.Client().video.generate — poll อยู่ใน SDK
    image_url ใช้ data URI เหมือน REST (ImageUrlContent)
    """
    try:
        import xai_sdk
        from xai_sdk.video import VideoGenerationError
    except ImportError as e:
        log.warning("[Grok Video] ติดตั้ง xai-sdk เพื่อใช้ SDK — pip install xai-sdk (%s)", e)
        return None

    if progress_callback:
        try:
            progress_callback(
                {
                    "phase": "grok_sdk_start",
                    "message": "Grok Video ผ่าน xAI SDK (generate+poll)…",
                }
            )
        except Exception:
            pass

    kwargs: dict = {
        "prompt": enhanced_prompt,
        "model": "grok-imagine-video",
        "duration": dur,
        "aspect_ratio": aspect_ratio,
        "resolution": res,
        "timeout": timedelta(seconds=poll_max),
        "interval": timedelta(seconds=poll_interval),
    }
    if ref_for_api is not None:
        try:
            kwargs["image_url"] = _path_to_data_uri(ref_for_api)
        except OSError as e:
            log.warning("[Grok Video] SDK: อ่านรูป ref ไม่ได้ — %s", e)
            return None

    t_gen = time.time()
    try:
        client = xai_sdk.Client(api_key=api_key)
        response = client.video.generate(**kwargs)
    except VideoGenerationError as e:
        msg = f"SDK VideoGenerationError [{e.code}]: {e.message}"
        log.error("[Grok Video] %s", msg)
        _print_console(msg)
        return None
    except TimeoutError as e:
        log.error("[Grok Video] SDK TimeoutError: %s", e)
        _print_console(f"SDK timeout — {e}")
        return None
    except Exception as e:
        log.exception("[Grok Video] SDK generate ล้มเหลว: %s", e)
        return None

    if not response.respect_moderation:
        log.warning(
            "[Grok Video] SDK respect_moderation=false — วิดีโออาจถูกกรอง/ไม่ผ่านนโยบาย"
        )

    try:
        video_url = response.url
    except ValueError as e:
        log.error("[Grok Video] SDK ไม่คืน video URL: %s", e)
        return None

    log.info(
        "[Grok Video] SDK เสร็จใน ~%.1fs — model=%s duration=%s",
        time.time() - t_gen,
        getattr(response, "model", "?"),
        getattr(response, "duration", "?"),
    )

    try:
        min_bytes = int((env.get("GROK_VIDEO_MIN_BYTES") or "120000").strip())
    except ValueError:
        min_bytes = 120_000
    min_bytes = max(40_000, min(min_bytes, 80_000_000))

    t_dl = time.time()
    video_bytes, derr = _download_cdn_video_with_bearer(video_url, api_key, log)
    if video_bytes is None:
        log.error("[Grok Video] SDK path ดาวน์โหลดล้มเหลว — %s", derr)
        return None
    if len(video_bytes) < min_bytes:
        _log_tiny_body_full(
            video_bytes[:16384],
            log,
            context=f"SDK path ไฟล์เล็กกว่า GROK_VIDEO_MIN_BYTES={min_bytes}",
        )
        log.error(
            "[Grok Video] SDK: ได้แค่ %d B (< %d) — มักเป็น stub",
            len(video_bytes),
            min_bytes,
        )
        return None

    rid = f"sdk_{uuid.uuid4().hex[:20]}"
    return _persist_grok_downloaded_bytes(
        video_bytes,
        video_url,
        request_id=rid,
        project_id=project_id,
        scene_index=scene_index,
        log=log,
        progress_callback=progress_callback,
        elapsed_sec=int(time.time() - t_gen),
        transport="sdk",
    )


def generate_video_clip(
    prompt: str,
    duration: int = 10,
    creativity_level: str = "medium",
    logger: logging.Logger | None = None,
    *,
    reference_image_path: str | None = None,
    progress_callback: Callable[[dict], None] | None = None,
    project_id: str | None = None,
    scene_index: int | None = None,
    aspect_ratio: str | None = None,
) -> str | None:
    """
    เรียก Grok Video API → คืน path ของ .mp4 ที่ดาวน์โหลดแล้ว

    Global Style: Fantasy + Cinematic + Human-centric

    Args:
        prompt: Scene description (will be enhanced with fantasy style)
        duration: Video length in seconds (xAI อนุญาต 1–15)
        creativity_level: "low" | "medium" | "high" | "extreme" (affects visual richness)
        logger: Logger instance

    Returns:
        Path to downloaded .mp4 file or None if failed
    """
    # Note: Prompt is already expanded by prompt_expander.py
    log = logger or logging.getLogger("grok_video")
    env = _load_env()

    ar = (aspect_ratio or env.get("GROK_VIDEO_ASPECT_RATIO") or "16:9").strip()
    if ar not in ("16:9", "9:16", "1:1"):
        ar = "16:9"

    if reference_image_path and Path(reference_image_path).is_file():
        GLOBAL_REQUIREMENTS = (
            "Image-to-video: preserve the subject identity from the source frame; "
            f"natural motion and cinematic camera; {ar} professional quality."
        )
    else:
        GLOBAL_REQUIREMENTS = f"{ar} aspect ratio, professional video quality."

    enhanced_raw = f"{prompt.strip()} {GLOBAL_REQUIREMENTS}"
    enhanced_prompt = clean_prompt_structure(enhanced_raw, GROK_PROMPT_MAX_CHARS)
    api_key = env.get("XAI_API_KEY", "").strip()
    
    if not api_key:
        log.warning("[Grok Video] ไม่มี XAI_API_KEY")
        return None

    try:
        poll_max = int((env.get("GROK_VIDEO_POLL_MAX_SEC") or "600").strip())
    except ValueError:
        poll_max = 600
    poll_max = max(60, min(poll_max, 3600))

    try:
        poll_interval = float((env.get("GROK_VIDEO_POLL_INTERVAL_SEC") or "5").strip())
    except ValueError:
        poll_interval = 5.0
    poll_interval = max(2.0, min(poll_interval, 60.0))

    res = (env.get("GROK_VIDEO_RESOLUTION") or "720p").strip().lower()
    if res not in ("480p", "720p"):
        log.warning("[Grok Video] GROK_VIDEO_RESOLUTION=%r ไม่รู้จัก — ใช้ 720p", res)
        res = "720p"

    # xAI: duration 1–15 วินาที (เอกสาร SDK/REST)
    dur = max(1, min(15, int(duration)))

    # Step 1: Start generation (prompt บีบ whitespace + ไม่เกิน GROK_PROMPT_MAX_CHARS)
    body: dict = {
        "model": "grok-imagine-video",
        "prompt": enhanced_prompt,
        "duration": dur,
        "aspect_ratio": ar,
        "resolution": res,
    }
    ref_path = Path(reference_image_path) if reference_image_path else None
    ref_for_api: Path | None = None
    if ref_path and ref_path.is_file():
        try:
            ref_for_api = prepare_reference_image_for_api(ref_path, log)
            body["image"] = _path_to_data_uri(ref_for_api)
            log.info("[Grok Video] Using reference image → image-to-video (%s)", ref_for_api.name)
        except OSError as e:
            log.warning("[Grok Video] Could not read reference image: %s", e)

    if _use_xai_sdk_enabled(env):
        sdk_path = _generate_video_clip_via_xai_sdk(
            enhanced_prompt=enhanced_prompt,
            dur=dur,
            res=res,
            ref_for_api=ref_for_api,
            api_key=api_key,
            log=log,
            env=env,
            poll_max=poll_max,
            poll_interval=poll_interval,
            progress_callback=progress_callback,
            project_id=project_id,
            scene_index=scene_index,
            aspect_ratio=ar,
        )
        if sdk_path:
            return sdk_path
        if not _sdk_fallback_rest_enabled(env):
            log.error("[Grok Video] SDK ล้มเหลวและ GROK_VIDEO_SDK_FALLBACK_REST=0 — หยุด")
            return None
        log.info("[Grok Video] SDK ล้มเหลว — fallback เส้นทาง REST")

    payload = json.dumps(body).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    try:
        req = Request("https://api.x.ai/v1/videos/generations", data=payload, headers=headers, method="POST")
        with urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        start_err = _poll_top_level_error(data)
        if start_err and not data.get("request_id"):
            log.error("[Grok Video] Start request failed — %s | body=%s", start_err, data)
            _print_console(f"Start failed — {start_err}")
            return None

        request_id = data.get("request_id")
        if not request_id:
            log.error("[Grok Video] ไม่ได้ request_id: %s", data)
            return None

        log.info(
            "[Grok Video] Request ID: %s (poll ≤%ds, every %.1fs, res=%s, dur=%ds)",
            str(request_id)[:16],
            poll_max,
            poll_interval,
            res,
            dur,
        )

        # Step 2: Poll for result (เทียบ SDK: poll จน done / failed / expired)
        poll_url = f"https://api.x.ai/v1/videos/{request_id}"
        max_wait = poll_max
        start = time.time()

        while time.time() - start < max_wait:
            req = Request(poll_url, headers={"Authorization": headers["Authorization"]})
            with urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read().decode("utf-8"))

            st = _normalize_poll_status(result)
            tl_err = _poll_top_level_error(result)
            if tl_err and st in _STATUS_FAILED:
                log.error("[Grok Video] Generation failed — %s | %s", tl_err, result)
                _print_console(f"Generation failed — {tl_err}")
                return None

            if st in _STATUS_FAILED:
                detail = json.dumps(result, ensure_ascii=False)[:800]
                log.error("[Grok Video] Generation failed — %s", detail)
                _print_console(f"Generation failed — {detail}")
                return None

            if st in _STATUS_EXPIRED:
                detail = json.dumps(result, ensure_ascii=False)[:500]
                log.error("[Grok Video] Request expired — %s", detail)
                _print_console(f"Request expired — {detail}")
                return None

            if st in _STATUS_CANCELLED:
                detail = json.dumps(result, ensure_ascii=False)[:500]
                log.error("[Grok Video] Cancelled — %s", detail)
                _print_console(f"Cancelled — {detail}")
                return None

            if not _poll_status_ready_for_download(result):
                log.info(
                    "[Grok Video] Poll status=%r — ยังไม่ completed (รอ ~%.1fs)",
                    st or "(empty)",
                    poll_interval,
                )
                time.sleep(poll_interval)
                continue

            video_obj = result.get("video") or {}
            if not isinstance(video_obj, dict):
                log.error("[Grok Video] video ใน response ไม่ใช่ object: %s", result.get("video"))
                return None

            # บางครั้ง status=done แต่ URL ยังไม่มา — อย่าโหลด CDN เร็วเกิน (กัน 0 B / JSON)
            if not _video_urls_from_poll_payload(video_obj):
                log.info("[Grok Video] status พร้อมแล้วแต่ยังไม่มี video.url — poll ต่อ")
                time.sleep(min(3.0, poll_interval))
                continue

            mod_ok = video_obj.get("respect_moderation")
            if mod_ok is False:
                log.warning(
                    "[Grok Video] respect_moderation=false — วิดีโออาจถูกกรอง/ไม่ผ่านนโยบาย"
                )

            nv_err = _nested_video_terminal_error(video_obj)
            if nv_err:
                log.error("[Grok Video] nested video ล้มเหลว — %s", nv_err)
                _print_console(nv_err)
                return None

            if _nested_video_blocks_download(video_obj):
                log.info(
                    "[Grok Video] video object ยังไม่พร้อม (nested status=%r) — รอก่อน",
                    video_obj.get("status") or video_obj.get("state"),
                )
                time.sleep(min(3.0, poll_interval))
                continue

            try:
                retry_max = int((env.get("GROK_VIDEO_DOWNLOAD_RETRIES") or "5").strip())
            except ValueError:
                retry_max = 5
            retry_max = max(1, min(retry_max, 12))
            try:
                retry_delay = float((env.get("GROK_VIDEO_RETRY_DELAY_SEC") or "2").strip())
            except ValueError:
                retry_delay = 2.0
            retry_delay = max(0.5, min(retry_delay, 30.0))

            video_bytes: bytes | None = None
            video_url: str | None = None
            last_dl_err: str | None = None

            for attempt in range(retry_max):
                if attempt > 0:
                    log.info(
                        "[Grok Video] Re-poll ขอ URL ใหม่หลังดาวน์โหลดล้มเหลว (%d/%d)…",
                        attempt + 1,
                        retry_max,
                    )
                    if progress_callback:
                        try:
                            progress_callback(
                                {
                                    "phase": "grok_retry_download",
                                    "message": (
                                        f"ดาวน์โหลดไม่สำเร็จ — ขอ signed URL ใหม่ ({attempt + 1}/{retry_max})"
                                    ),
                                    "attempt": attempt + 1,
                                    "total_attempts": retry_max,
                                }
                            )
                        except Exception:
                            pass
                    time.sleep(retry_delay)
                    req_rp = Request(
                        poll_url, headers={"Authorization": headers["Authorization"]}
                    )
                    with urlopen(req_rp, timeout=20) as resp:
                        result = json.loads(resp.read().decode("utf-8"))
                    if not _poll_status_ready_for_download(result):
                        snap = json.dumps(result, ensure_ascii=False)[:700]
                        last_dl_err = (
                            f"Download Failed: re-poll status={_normalize_poll_status(result)!r} — {snap}"
                        )
                        log.error("[Grok Video] %s", last_dl_err)
                        continue
                    video_obj = result.get("video") or {}
                    if not isinstance(video_obj, dict):
                        last_dl_err = "Download Failed: video object หายหลัง re-poll"
                        log.error("[Grok Video] %s", last_dl_err)
                        continue
                    nv_err2 = _nested_video_terminal_error(video_obj)
                    if nv_err2:
                        last_dl_err = nv_err2
                        log.error("[Grok Video] %s", last_dl_err)
                        continue
                    if _nested_video_blocks_download(video_obj):
                        last_dl_err = "Download Failed: re-poll แล้ว nested video ยังไม่พร้อม"
                        log.info("[Grok Video] %s", last_dl_err)
                        continue

                video_bytes, video_url, last_dl_err = _download_best_video_variant(
                    video_obj, api_key, log, env
                )
                if video_bytes and video_url:
                    break
                log.error(
                    "[Grok Video] Download Failed (attempt %d/%d): %s",
                    attempt + 1,
                    retry_max,
                    last_dl_err or "unknown",
                )

            if not video_bytes or not video_url:
                log.error(
                    "[Grok Video] Download Failed หลังลอง %d รอบ — %s (จะ poll ต่อจนกว่า timeout)",
                    retry_max,
                    last_dl_err or "no bytes",
                )
                _print_console(last_dl_err or "Download failed after retries — polling again")
                time.sleep(retry_delay)
                continue

            if video_obj.get("duration") is not None:
                log.info(
                    "[Grok Video] xAI รายงานความยาวคลิป ~%s วิ",
                    video_obj.get("duration"),
                )

            log.info(
                "[Grok Video] ได้ไฟล์จาก CDN ขนาด %.2f MB",
                len(video_bytes) / (1024 * 1024),
            )

            return _persist_grok_downloaded_bytes(
                video_bytes,
                video_url,
                request_id=str(request_id),
                project_id=project_id,
                scene_index=scene_index,
                log=log,
                progress_callback=progress_callback,
                elapsed_sec=int(time.time() - start),
                transport="rest",
            )
        
        log.error("[Grok Video] Timeout after %ds", max_wait)
        return None

    except HTTPError as e:
        body_b = e.read()[:8000] if e.fp else b""
        detail = _format_xai_error_body(body_b)
        log.error("[Grok Video] xAI API HTTP %d — %s", e.code, detail)
        _log_tiny_body_full(body_b, log, context=f"xAI API HTTP {e.code}")
        _print_console(f"xAI API HTTP {e.code} — {detail}")
        return None
    except Exception as e:
        log.error("[Grok Video] %s", e)
        return None


def segment_script_for_generation(script_md: str) -> list[dict]:
    """Break a long script into shot specs ([0-3s] / [FRAME:...] aware)."""
    from factory.script_segmentation import segment_script_to_shots

    return segment_script_to_shots(script_md)
