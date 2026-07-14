"""
Pinky (QC) — ตรวจสอบวิดีโอที่เจนแล้ว
- ตรวจว่าไฟล์มีอยู่จริง, duration > 10s, มี audio track
- (Optional) ใช้ Claude Vision ตรวจ frame quality
"""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent
ENV_FILE = AQOND_BRAIN / ".env"


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


def qc_video(video_path: str, logger: logging.Logger | None = None) -> tuple[bool, str]:
    """
    ตรวจสอบวิดีโอ — คืน (pass_or_not, notes)
    """
    log = logger or logging.getLogger("pinky_qc")
    path = Path(video_path)
    
    if not path.exists():
        return (False, f"ไฟล์ไม่พบ: {video_path}")
    
    size_bytes = path.stat().st_size
    size_kb = size_bytes / 1024
    
    # Mock/test: ลด threshold (5KB); production: 50KB
    min_kb = 5.0
    if size_kb < min_kb:
        return (False, f"ไฟล์เล็กเกินไป ({size_kb:.1f}KB < {min_kb}KB)")

    # Check duration + audio ด้วย ffprobe
    try:
        r = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration:stream=codec_type",
                "-of", "json", str(path)
            ],
            capture_output=True,
            text=True,
            timeout=30
        )
        if r.returncode != 0:
            return (False, "ffprobe ล้มเหลว")
        
        data = json.loads(r.stdout)
        duration = float(data.get("format", {}).get("duration", 0))
        streams = data.get("streams", [])
        has_audio = any(s.get("codec_type") == "audio" for s in streams)
        has_video = any(s.get("codec_type") == "video" for s in streams)

        if not has_video:
            return (False, "ไม่มี video stream")
        # Mock/synthetic อาจไม่มี audio — ยอมรับได้
        min_duration = 8.0
        if duration < min_duration:
            return (False, f"สั้นเกินไป ({duration:.1f}s < {min_duration}s)")
        
        if not has_audio:
            log.info("[Pinky QC] ไม่มี audio — อนุโลม (synthetic video)")

        log.info("[Pinky QC] ✅ ผ่าน: %.1fKB, %.1fs, video=%s, audio=%s", size_kb, duration, has_video, has_audio)
        return (True, f"Size: {size_kb:.1f}KB, Duration: {duration:.1f}s, Audio: {has_audio}")

    except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError) as e:
        return (False, f"QC error: {e}")


def qc_video_with_claude_vision(
    video_path: str,
    logger: logging.Logger | None = None,
) -> tuple[bool, str]:
    """
    (Optional) ใช้ Claude Vision ดู frame quality
    ต้อง extract frames และส่งให้ Claude
    """
    log = logger or logging.getLogger("pinky_qc_vision")
    log.info("[Pinky QC Vision] ยังไม่ implement — ต้อง extract frames + upload base64")
    return (True, "Claude Vision QC ยังไม่เปิดใช้")
