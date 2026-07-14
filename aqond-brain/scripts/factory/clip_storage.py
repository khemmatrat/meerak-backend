"""
เก็บคลิปฉาก — Grok Imagine ลง grokVideo/ ตามไฟล์จริงจาก CDN;
fallback / synthetic ใช้ output/clips/
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import time
from pathlib import Path
from urllib.parse import unquote, urlparse

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent
CLIP_ROOT = AQOND_BRAIN / "output" / "clips"
# ค่าเริ่มต้นเดียวกับที่เก็บคลิปจาก Grok Imagine บนเครื่อง (ดู aqond-brain/grokVideo/)
DEFAULT_GROK_VIDEO_DIR = AQOND_BRAIN / "grokVideo"


def safe_project_segment(project_id: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9._-]+", "_", (project_id or "").strip())
    return (s[:120] if s else "unknown")


def scene_clip_file(project_id: str, scene_index: int) -> Path:
    """Path ปลายทางสำหรับฉากหนึ่งฉาก — สร้างโฟลเดอร์แม่ให้แล้ว"""
    d = CLIP_ROOT / safe_project_segment(project_id)
    d.mkdir(parents=True, exist_ok=True)
    return d / f"scene_{int(scene_index):02d}.mp4"


def grok_video_root(env_map: dict[str, str] | None) -> Path:
    """โฟลเดอร์เก็บไฟล์ดาวน์โหลดจาก Grok Video API — ตั้ง GROK_VIDEO_DIR ใน .env ได้"""
    m = env_map or {}
    raw = (m.get("GROK_VIDEO_DIR") or "").strip()
    if raw:
        p = Path(raw)
        return p.resolve() if p.is_absolute() else (AQOND_BRAIN / raw).resolve()
    return DEFAULT_GROK_VIDEO_DIR.resolve()


def grok_imagine_save_path(
    request_id: str,
    video_url: str,
    *,
    project_id: str | None,
    scene_index: int,
    env_map: dict[str, str] | None = None,
) -> Path:
    """
    ปลายทางบันทึกคลิปจาก Imagine/CDN — ชื่อไฟล์มี project + scene + timestamp ทุกครั้ง
    เพื่อบังคับเบราว์เซอร์ไม่ใช้แคช และไม่ทับชื่อเดิมแบบเงียบๆ
    """
    root = grok_video_root(env_map)
    root.mkdir(parents=True, exist_ok=True)
    safe_rid = re.sub(r"[^a-zA-Z0-9._-]+", "_", (request_id or "clip").strip())[:120] or "clip"
    proj_seg = safe_project_segment(project_id or "proj")
    ts = int(time.time())
    tail_stem = ""
    try:
        tail = Path(unquote(urlparse(video_url).path or "")).name
        if tail.lower().endswith((".mp4", ".webm", ".mov")):
            tail_stem = re.sub(r"[^a-zA-Z0-9._-]+", "_", Path(tail).stem)[:36]
    except Exception:
        pass
    hint = f"_{tail_stem}" if tail_stem else ""
    return root / f"{proj_seg}_sc{int(scene_index):02d}_{ts}{hint}_{safe_rid[:12]}.mp4"


def persist_scene_clip(
    source_path: str | Path,
    project_id: str,
    scene_index: int,
    logger: logging.Logger | None = None,
) -> str:
    """
    คัดลอกจากไฟล์ชั่วคราว → output/clips/... แล้วลบต้นทางถ้าคนละไฟล์
    """
    log = logger or logging.getLogger("clip_storage")
    src = Path(source_path)
    if not src.is_file():
        return str(src)
    dest = scene_clip_file(project_id, scene_index)
    try:
        shutil.copy2(src, dest)
        try:
            if src.resolve() != dest.resolve():
                src.unlink(missing_ok=True)  # type: ignore[arg-type]
        except OSError:
            pass
        try:
            rel = dest.relative_to(AQOND_BRAIN)
        except ValueError:
            rel = dest
        log.info("[Clips] scene_%02d → %s", scene_index, rel)
        return str(dest.resolve())
    except OSError as e:
        log.warning("[Clips] persist failed (%s) — keep %s", e, src)
        return str(src.resolve())


def remove_tiny_clip_garbage(
    project_id: str,
    *,
    raw_clip_paths: list[str] | None = None,
    logger: logging.Logger | None = None,
) -> int:
    """
    ลบ .mp4 จิ๋ว (error body จาก xAI ~16–30KB) ใน output/clips/<project>/ และ grokVideo/
    และ path ที่อยู่ใน raw_clips — เรียกตอน Regen เพื่อไม่ให้ชี้ไฟล์ขยะเดิมวนซ้ำ
    """
    log = logger or logging.getLogger("clip_storage")
    try:
        from factory.grok_video_api import _load_env as _grok_env

        _env = _grok_env()
    except Exception:
        _env = {}
    try:
        mb = int(
            (_env.get("GROK_JUNK_MAX_BYTES") or os.environ.get("GROK_JUNK_MAX_BYTES") or "65536").strip()
        )
    except ValueError:
        mb = 65536
    mb = max(4096, min(mb, 524288))

    env_map: dict[str, str] = {}
    gd = (_env.get("GROK_VIDEO_DIR") or os.environ.get("GROK_VIDEO_DIR") or "").strip()
    if gd:
        env_map["GROK_VIDEO_DIR"] = gd

    safe = safe_project_segment(project_id)
    removed = 0

    clip_dir = CLIP_ROOT / safe
    if clip_dir.is_dir():
        for p in clip_dir.glob("*.mp4"):
            try:
                if p.is_file() and p.stat().st_size < mb:
                    p.unlink(missing_ok=True)  # type: ignore[arg-type]
                    removed += 1
                    log.warning("[Clips] ลบไฟล์จิ๋ว <%d B: %s", mb, p.name)
            except OSError as ex:
                log.debug("[Clips] skip %s: %s", p, ex)

    grok_root = grok_video_root(env_map)
    if grok_root.is_dir():
        for p in grok_root.glob("*.mp4"):
            try:
                if p.is_file() and p.stat().st_size < mb:
                    p.unlink(missing_ok=True)  # type: ignore[arg-type]
                    removed += 1
                    log.warning("[GrokVideo] ลบไฟล์จิ๋ว <%d B: %s", mb, p.name)
            except OSError as ex:
                log.debug("[GrokVideo] skip %s: %s", p, ex)

    for rel in raw_clip_paths or []:
        raw = (rel or "").strip()
        if not raw:
            continue
        cp = Path(raw)
        if not cp.is_absolute():
            cp = (AQOND_BRAIN / raw.replace("\\", "/").lstrip("/")).resolve()
        else:
            cp = cp.resolve()
        try:
            if cp.is_file() and cp.suffix.lower() == ".mp4" and cp.stat().st_size < mb:
                cp.unlink(missing_ok=True)  # type: ignore[arg-type]
                removed += 1
                log.warning("[raw_clips] ลบไฟล์จิ๋ว <%d B: %s", mb, cp.name)
        except OSError as ex:
            log.debug("[raw_clips] skip %s: %s", cp, ex)

    if removed:
        log.info("[Clips] ลบไฟล์ขยะรวม %d ไฟล์ (threshold %d B, project=%s)", removed, mb, safe)
    return removed
