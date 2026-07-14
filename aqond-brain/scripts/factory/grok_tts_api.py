"""
Grok TTS API — Text-to-Speech พากย์ไทย/อังกฤษ
Voices: eve, ara, rex, sal, leo
"""

from __future__ import annotations

import json
import logging
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


def generate_tts(
    text: str,
    output_mp3: str,
    voice_id: str = "ara",
    language: str = "th",
    logger: logging.Logger | None = None
) -> bool:
    """
    เรียก Grok TTS API → .mp3
    
    Args:
        text: Text to speak (max 15,000 chars)
        output_mp3: Output path for MP3 file
        voice_id: eve/ara/rex/sal/leo
        language: 'th' for Thai, 'en' for English, 'auto' for detection
        logger: Logger instance
    
    Returns:
        True if successful
    """
    log = logger or logging.getLogger("grok_tts")
    env = _load_env()
    api_key = env.get("XAI_API_KEY", "").strip()
    
    if not api_key:
        log.info("[Grok TTS] ไม่มี XAI_API_KEY")
        return False

    payload = json.dumps({
        "text": text[:15000],
        "voice_id": voice_id,
        "language": language,
        "output_format": {
            "codec": "mp3",
            "sample_rate": 44100,
            "bit_rate": 192000,
        }
    }).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    try:
        req = Request("https://api.x.ai/v1/tts", data=payload, headers=headers, method="POST")
        with urlopen(req, timeout=120) as resp:
            audio_bytes = resp.read()
        
        Path(output_mp3).write_bytes(audio_bytes)
        log.info("[Grok TTS] เจนเสียงแล้ว: %.1f KB (%s voice)", len(audio_bytes) / 1024, voice_id)
        return True

    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        log.error("[Grok TTS] HTTP %d: %s", e.code, body[:500])
        return False
    except Exception as e:
        log.error("[Grok TTS] %s", e)
        return False
