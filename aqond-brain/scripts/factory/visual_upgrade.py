"""
Visual Upgrade — Ken Burns effect, Grok image generation, dynamic subtitles
แก้ UTF-8 สำหรับ Thai text ใน FFmpeg
"""

from __future__ import annotations

import json
import logging
import re
import subprocess
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent
ENV_FILE = AQOND_BRAIN / ".env"
FONTS_DIR = AQOND_BRAIN / "config" / "fonts"


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


def generate_image_with_grok(prompt: str, logger: logging.Logger) -> str | None:
    """เรียก Grok Imagine Image API → คืน base64 หรือ URL"""
    env = _load_env()
    api_key = env.get("XAI_API_KEY", "").strip()
    if not api_key:
        logger.warning("[Grok Image] ไม่มี XAI_API_KEY")
        return None

    payload = json.dumps({
        "model": "grok-imagine-image",
        "prompt": prompt[:2000],
        "n": 1,
    }).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "aqond-brain/visual-upgrade",
    }

    try:
        req = Request("https://api.x.ai/v1/images/generations", data=payload, headers=headers, method="POST")
        with urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        
        images = data.get("data", [])
        if not images:
            return None
        
        # Grok คืน base64 หรือ URL
        img = images[0]
        b64 = img.get("b64_json")
        url = img.get("url")
        
        if b64:
            # Save to temp file
            import base64
            tmp = Path(tempfile.mkdtemp(prefix="grok_img_")) / "image.png"
            tmp.write_bytes(base64.b64decode(b64))
            logger.info("[Grok Image] เจนภาพแล้ว: %s", tmp)
            return str(tmp)
        elif url:
            # Download
            tmp = Path(tempfile.mkdtemp(prefix="grok_img_")) / "image.png"
            with urlopen(url, timeout=30) as r:
                tmp.write_bytes(r.read())
            logger.info("[Grok Image] ดาวน์โหลดภาพแล้ว: %s", tmp)
            return str(tmp)
        
        return None

    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        logger.error("[Grok Image] HTTP %d: %s", e.code, body[:500])
        return None
    except Exception as e:
        logger.error("[Grok Image] %s", e)
        return None


def create_ken_burns_clip(image_path: str, duration: float, output_path: str, logger: logging.Logger) -> bool:
    """Ken Burns effect: zoom + pan ภาพนิ่งช้าๆ"""
    # zoompan: zoom from 1.0 to 1.3 over duration
    vf = f"zoompan=z='min(zoom+0.0015,1.3)':d={int(duration * 30)}:s=1920x1080:fps=30,format=yuv420p"
    
    args = [
        "ffmpeg", "-y", "-loop", "1", "-i", str(image_path),
        "-vf", vf, "-t", str(duration),
        "-c:v", "libx264", "-preset", "fast", "-crf", "22",
        "-pix_fmt", "yuv420p", str(output_path)
    ]
    
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=60)
        if r.returncode == 0 and Path(output_path).exists():
            logger.info("[Ken Burns] สร้างคลิปแล้ว: %s", Path(output_path).name)
            return True
        logger.error("[Ken Burns] FFmpeg error: %s", (r.stderr or r.stdout)[:500])
        return False
    except Exception as e:
        logger.error("[Ken Burns] %s", e)
        return False


def get_kanit_font() -> Path | None:
    """หา Kanit font (ถ้ามี) — ถ้าไม่มีจะใช้ system font"""
    FONTS_DIR.mkdir(parents=True, exist_ok=True)
    kanit = FONTS_DIR / "Kanit-Regular.ttf"
    if kanit.exists():
        return kanit
    
    # Download from Google Fonts (optional)
    # For now, return None → FFmpeg will try system fonts
    return None


def create_subtitle_file_utf8(lines: list[str], output_srt: Path) -> None:
    """สร้าง .srt ด้วย UTF-8 BOM สำหรับ FFmpeg Windows"""
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
        end = t + 3.5
        parts.append(f"{i + 1}\n{tc(t)} --> {tc(end)}\n{line}\n")
        t = end

    srt_content = "\n".join(parts)
    # Write with UTF-8 BOM
    output_srt.write_text("\ufeff" + srt_content, encoding="utf-8")
