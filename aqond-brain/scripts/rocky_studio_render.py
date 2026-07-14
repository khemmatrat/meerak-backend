"""
Rocky Studio — หลัง video_brief ผ่าน Pinky:
1) (ถ้ามี XAI_API_KEY) เรียก Grok สรุปเป็นบรรทัดคำบรรยายหน้าจอ
2) FFmpeg: ถ้ามีวิดีโอใน raw_assets ที่จับคู่ได้ → เผา subtitle; ไม่มี → สร้าง slate .mp4
ผลลัพธ์: output/final_videos/*.mp4 + manifest.json
ต้องติดตั้ง FFmpeg ใน PATH (ไม่ใช้ CapCut API — ไม่มี public API มาตรฐาน)
"""

from __future__ import annotations

import json
import logging
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent
FINAL_VIDEOS_DIR = AQOND_BRAIN / "output" / "final_videos"
MANIFEST_PATH = FINAL_VIDEOS_DIR / "manifest.json"
RAW_ASSETS = AQOND_BRAIN / "pipeline" / "rocky" / "raw_assets"
VIDEO_EXT = (".mp4", ".mov", ".webm", ".avi")

# Grok
import sys

sys.path.insert(0, str(AQOND_BRAIN / "scripts"))
try:
    from grok_connect import load_env, CHAT_COMPLETIONS, _make_opener
except Exception:
    load_env = None  # type: ignore
    CHAT_COMPLETIONS = "https://api.x.ai/v1/chat/completions"
    _make_opener = None  # type: ignore

from urllib.request import Request, urlopen


def _ffmpeg_exists() -> bool:
    return shutil.which("ffmpeg") is not None


def _extract_ts(name: str) -> str | None:
    m = re.search(r"(\d{8}_\d{6})", name)
    return m.group(1) if m else None


def _find_raw_video_for_brief(brief_stem: str) -> Path | None:
    if not RAW_ASSETS.is_dir():
        return None
    ts = _extract_ts(brief_stem)
    candidates = []
    for p in RAW_ASSETS.iterdir():
        if not p.is_file() or p.suffix.lower() not in VIDEO_EXT:
            continue
        if ts and ts in p.name:
            candidates.append(p)
    if candidates:
        return max(candidates, key=lambda x: x.stat().st_mtime)
    # fallback: latest video in raw_assets
    all_v = [p for p in RAW_ASSETS.iterdir() if p.is_file() and p.suffix.lower() in VIDEO_EXT]
    if not all_v:
        return None
    return max(all_v, key=lambda x: x.stat().st_mtime)


def grok_brief_to_caption_lines(brief_text: str, logger: logging.Logger) -> list[str]:
    """เรียก xAI Grok ให้คืน JSON { \"lines\": [...] }; ถ้าไม่มี key หรือล้มเหลว ใช้บรรทัดจาก brief."""
    text = (brief_text or "").strip()
    if not text:
        return ["(empty brief)"]

    env = load_env() if load_env else {}
    api_key = (env.get("XAI_API_KEY") or "").strip()
    model = (env.get("GROK_MODEL") or "grok-4-1-fast").strip()
    if not api_key:
        logger.info("[Rocky Studio] ไม่มี XAI_API_KEY — ใช้ข้อความจาก brief โดยตรง")
        return _lines_from_brief_fallback(text)

    system = (
        "You output ONLY valid JSON, no markdown. "
        'Schema: {"lines": ["line1", "line2", ...]}. '
        "6-12 short lines, each max 52 characters, Thai or English as in brief. "
        "On-screen video captions summarizing the creative brief."
    )
    user = "Brief:\n---\n" + text[:12000] + "\n---"
    payload = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
            "temperature": 0.4,
            "max_tokens": 600,
        }
    ).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "aqond-brain/rocky-studio",
    }
    req = Request(CHAT_COMPLETIONS, data=payload, headers=headers, method="POST")
    opener = _make_opener(env) if callable(_make_opener) else None
    open_fn = opener.open if opener else urlopen
    try:
        with open_fn(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
        content = content.strip()
        if content.startswith("```"):
            content = re.sub(r"^```\w*\n?", "", content)
            content = re.sub(r"\n?```$", "", content)
        parsed = json.loads(content)
        lines = parsed.get("lines")
        if isinstance(lines, list) and lines:
            out = [str(x).strip() for x in lines if str(x).strip()][:14]
            if out:
                logger.info("[Rocky Studio] Grok สรุปได้ %d บรรทัด", len(out))
                return out
    except Exception as e:
        logger.warning("[Rocky Studio] Grok ล้มเหลว — ใช้ brief ตรงๆ: %s", e)

    return _lines_from_brief_fallback(text)


def _lines_from_brief_fallback(text: str) -> list[str]:
    lines = []
    for block in text.replace("\r\n", "\n").split("\n\n"):
        for line in block.split("\n"):
            s = line.strip().lstrip("#-* ").strip()
            if len(s) < 3:
                continue
            if len(s) > 90:
                s = s[:87] + "..."
            lines.append(s)
            if len(lines) >= 12:
                return lines
    if not lines:
        lines = [text[:80] + ("..." if len(text) > 80 else "")]
    return lines


def _srt_from_lines(lines: list[str], seconds_per_line: float = 2.8) -> str:
    def tc(sec: float) -> str:
        h = int(sec // 3600)
        m = int((sec % 3600) // 60)
        s = sec % 60
        return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")

    parts = []
    t = 0.0
    for i, line in enumerate(lines):
        if not line:
            continue
        end = t + seconds_per_line
        safe = line.replace("\r", " ").strip()
        parts.append(f"{i + 1}\n{tc(t)} --> {tc(end)}\n{safe}\n")
        t = end
    return "\n".join(parts)


def _run_ffmpeg(args: list[str], logger: logging.Logger, cwd: str | None = None) -> bool:
    try:
        r = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=600,
            cwd=cwd or str(AQOND_BRAIN),
        )
        if r.returncode != 0:
            logger.error("[Rocky Studio] ffmpeg: %s", (r.stderr or r.stdout)[:2000])
            return False
        return True
    except FileNotFoundError:
        logger.error("[Rocky Studio] ไม่พบ ffmpeg — ติดตั้ง FFmpeg แล้วใส่ใน PATH")
        return False
    except subprocess.TimeoutExpired:
        logger.error("[Rocky Studio] ffmpeg timeout")
        return False


def _append_manifest(entry: dict, logger: logging.Logger) -> None:
    FINAL_VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    data = {"videos": []}
    if MANIFEST_PATH.exists():
        try:
            data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    if not isinstance(data.get("videos"), list):
        data["videos"] = []
    data["videos"].append(entry)
    MANIFEST_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("[Rocky Studio] อัปเดต manifest: %s", entry.get("file"))


def render_video_from_brief(brief_path: Path, logger: logging.Logger | None = None) -> Path | None:
    """
    สร้างไฟล์ .mp4 ใน output/final_videos/ จาก video_brief ที่ผ่านการตรวจแล้ว
    คืนค่า path ของไฟล์ mp4 หรือ None
    """
    log = logger or logging.getLogger("rocky_studio")
    if not brief_path.is_file():
        log.warning("[Rocky Studio] ไม่พบไฟล์: %s", brief_path)
        return None
    if not _ffmpeg_exists():
        log.error("[Rocky Studio] ต้องติดตั้ง FFmpeg — https://ffmpeg.org")
        return None

    brief_text = brief_path.read_text(encoding="utf-8", errors="replace")
    lines = grok_brief_to_caption_lines(brief_text, log)
    duration = max(12.0, len(lines) * 2.8 + 2.0)

    stem = brief_path.stem
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_mp4 = FINAL_VIDEOS_DIR / f"{stem}_{ts}.mp4"
    FINAL_VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="rocky_studio_") as tmp:
        tmp = Path(tmp)
        (tmp / "captions.srt").write_text(_srt_from_lines(lines), encoding="utf-8")
        tmp_str = str(tmp)

        raw = _find_raw_video_for_brief(stem)
        source = "ffmpeg_slate"

        if raw and raw.exists():
            vf = "subtitles=captions.srt:force_style='FontSize=26,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=24'"
            args = [
                "ffmpeg",
                "-y",
                "-i",
                str(raw.resolve()),
                "-vf",
                vf,
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-crf",
                "22",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-movflags",
                "+faststart",
                str(out_mp4.resolve()),
            ]
            source = "ffmpeg_overlay"
            ok = _run_ffmpeg(args, log, cwd=tmp_str)
        else:
            vf = (
                "subtitles=captions.srt:force_style="
                "'FontSize=28,PrimaryColour=&H00E8E8FF,OutlineColour=&H00101010,Outline=2,Alignment=2,MarginV=36'"
            )
            args = [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                f"color=c=0x1a1a2e:s=1920x1080:r=30:d={duration:.2f}",
                "-vf",
                vf,
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-crf",
                "20",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                str(out_mp4.resolve()),
            ]
            ok = _run_ffmpeg(args, log, cwd=tmp_str)

        if not ok or not out_mp4.exists():
            return None

    _append_manifest(
        {
            "file": out_mp4.name,
            "brief": brief_path.name,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source": source,
            "raw_asset": raw.name if raw else None,
        },
        log,
    )
    log.info("[Rocky Studio] เจนแล้ว: %s", out_mp4)
    return out_mp4


def main():
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="Render one video_brief to output/final_videos")
    p.add_argument("brief", type=Path, help="Path to video_brief_*.md")
    args = p.parse_args()
    path = args.brief if args.brief.is_absolute() else AQOND_BRAIN / args.brief
    out = render_video_from_brief(path)
    print(out or "FAILED")


if __name__ == "__main__":
    main()
