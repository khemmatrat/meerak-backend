"""
ElevenLabs Voice — เพิ่มเสียงพากย์ AI ให้กับวิดีโอ
ต้องมี ELEVENLABS_API_KEY ใน .env
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


def generate_voiceover(text: str, output_mp3: str, logger: logging.Logger | None = None) -> bool:
    """
    เรียก ElevenLabs TTS API → .mp3
    คืน True ถ้าสำเร็จ
    """
    log = logger or logging.getLogger("elevenlabs")
    env = _load_env()
    api_key = env.get("ELEVENLABS_API_KEY", "").strip()
    
    if not api_key:
        log.info("[ElevenLabs] ไม่มี API key — ข้ามเสียงพากย์")
        return False

    # Voice ID: Rachel (multilingual) หรือ custom voice
    voice_id = env.get("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM").strip()
    
    payload = json.dumps({
        "text": text[:5000],
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.5,
            "use_speaker_boost": True,
        }
    }).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "xi-api-key": api_key,
    }

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    req = Request(url, data=payload, headers=headers, method="POST")

    try:
        with urlopen(req, timeout=120) as resp:
            audio_bytes = resp.read()
        
        Path(output_mp3).write_bytes(audio_bytes)
        log.info("[ElevenLabs] เจนเสียงแล้ว: %.1f KB", len(audio_bytes) / 1024)
        return True

    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        log.error("[ElevenLabs] HTTP %d: %s", e.code, body[:500])
        return False
    except Exception as e:
        log.error("[ElevenLabs] %s", e)
        return False


def add_voiceover_to_video(video_path: str, voiceover_mp3: str, output_path: str, logger: logging.Logger) -> bool:
    """ผสม voiceover กับวิดีโอ (แทนที่เสียงเดิม หรือผสม)"""
    args = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-i", str(voiceover_mp3),
        "-c:v", "copy",
        "-c:a", "aac",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-shortest",
        str(output_path)
    ]
    
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=120)
        if r.returncode == 0 and Path(output_path).exists():
            logger.info("[Voiceover] ผสมเสียงแล้ว: %s", Path(output_path).name)
            return True
        logger.error("[Voiceover] FFmpeg error: %s", (r.stderr or r.stdout)[:500])
        return False
    except Exception as e:
        logger.error("[Voiceover] %s", e)
        return False
