"""Qwen vision via Ollama (free local) — label images/videos for success library."""

from __future__ import annotations

import base64
import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

log = logging.getLogger("qwen_vision")

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
VIDEO_EXT = {".mp4", ".webm", ".mov", ".mkv"}


def _env(key: str, default: str = "") -> str:
    v = os.getenv(key, default).strip()
    if v:
        return v
    env_file = Path(__file__).resolve().parent.parent.parent / ".env"
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.split("#")[0].strip().startswith(f"{key}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return default


def ollama_base() -> str:
    return _env("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")


def vision_model() -> str:
    return _env("QWEN_VISION_MODEL", "qwen2.5vl:3b")


def _extract_video_frame(video_path: Path) -> Path | None:
    """Grab one frame with ffmpeg for vision analysis."""
    try:
        fd, tmp = tempfile.mkstemp(suffix=".jpg")
        os.close(fd)
        out = Path(tmp)
        cmd = [
            "ffmpeg", "-y", "-i", str(video_path),
            "-vframes", "1", "-q:v", "2", str(out),
        ]
        r = subprocess.run(cmd, capture_output=True, timeout=60)
        if r.returncode == 0 and out.is_file() and out.stat().st_size > 0:
            return out
        out.unlink(missing_ok=True)
    except Exception as e:
        log.warning("ffmpeg frame extract failed: %s", e)
    return None


def _ollama_vision(image_path: Path, prompt: str) -> str:
    """qwen2.5vl ใช้ /api/chat (ไม่ใช่ /api/generate)"""
    b64 = base64.b64encode(image_path.read_bytes()).decode("ascii")
    model = vision_model()
    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt, "images": [b64]},
        ],
        "stream": False,
    }
    req = Request(
        f"{ollama_base()}/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    msg = data.get("message") or {}
    return (msg.get("content") or data.get("response") or "").strip()


def analyze_media(path: Path, flow_type: str = "flow1") -> dict[str, Any]:
    """
    Analyze image or video; return structured labels for success library.
    Falls back to text-only stub if Ollama unavailable.
    """
    path = Path(path)
    if not path.is_file():
        return {"error": "file not found", "description": "", "tags": []}

    prompt = (
        "คุณเป็นผู้เชี่ยวชาญการตลาด AQOND (app.aqond.com). "
        f"วิเคราะห์สื่อนี้สำหรับ {flow_type}. "
        "ตอบเป็น JSON เท่านั้น โครงสร้าง: "
        '{"description":"...", "tags":["tag1","tag2"], "mood":"...", '
        '"platform_fit":["facebook","instagram"], "quality_score":0-100, '
        '"success_factors":["..."]}'
    )

    image_for_vl = path
    cleanup: Path | None = None
    if path.suffix.lower() in VIDEO_EXT:
        frame = _extract_video_frame(path)
        if frame:
            image_for_vl = frame
            cleanup = frame
        else:
            return {
                "description": f"วิดีโอ {path.name} (ไม่สามารถดึงเฟรมได้)",
                "tags": ["video", flow_type],
                "mood": "unknown",
                "platform_fit": [],
                "quality_score": 50,
                "success_factors": [],
                "vision_available": False,
            }

    if path.suffix.lower() not in IMAGE_EXT and cleanup is None:
        return {
            "description": path.name,
            "tags": [flow_type],
            "mood": "unknown",
            "platform_fit": [],
            "quality_score": 50,
            "success_factors": [],
            "vision_available": False,
        }

    try:
        raw = _ollama_vision(image_for_vl, prompt)
        if cleanup:
            cleanup.unlink(missing_ok=True)
        # Parse JSON from response (may be wrapped in markdown)
        text = raw.strip()
        if "```" in text:
            for part in text.split("```"):
                part = part.strip()
                if part.startswith("json"):
                    part = part[4:].strip()
                if part.startswith("{"):
                    text = part
                    break
        if text.startswith("{"):
            parsed = json.loads(text)
            parsed["vision_available"] = True
            parsed["raw_model"] = vision_model()
            return parsed
        return {
            "description": raw[:500],
            "tags": ["aqond", flow_type],
            "mood": "neutral",
            "platform_fit": ["facebook", "instagram"],
            "quality_score": 70,
            "success_factors": ["human_reviewed"],
            "vision_available": True,
            "raw_response": raw[:300],
        }
    except HTTPError as e:
        log.warning("Qwen vision HTTP %s: %s", e.code, e)
        if cleanup:
            cleanup.unlink(missing_ok=True)
        hint = "รัน ollama list ตรวจว่ามี qwen2.5vl:3b และรีสตาร์ท Media Studio"
        if e.code == 404:
            hint = f"model '{vision_model()}' ไม่พบ — รัน: ollama pull qwen2.5vl:3b"
        return {
            "description": f"ไฟล์ {path.name} — vision error {e.code}. {hint}",
            "tags": ["aqond", flow_type, "needs_vision"],
            "mood": "unknown",
            "platform_fit": [],
            "quality_score": 0,
            "success_factors": [],
            "vision_available": False,
            "error": str(e),
        }
    except (URLError, OSError, json.JSONDecodeError, TimeoutError) as e:
        log.warning("Qwen vision unavailable: %s", e)
        if cleanup:
            cleanup.unlink(missing_ok=True)
        return {
            "description": f"ไฟล์ {path.name} — vision offline ({e})",
            "tags": ["aqond", flow_type, "needs_vision"],
            "mood": "unknown",
            "platform_fit": [],
            "quality_score": 0,
            "success_factors": [],
            "vision_available": False,
            "error": str(e),
        }


def ping_ollama() -> dict[str, Any]:
    try:
        req = Request(f"{ollama_base()}/api/tags", method="GET")
        with urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        models = [m.get("name", "") for m in data.get("models", [])]
        return {"ok": True, "models": models, "vision_model": vision_model()}
    except Exception as e:
        return {"ok": False, "error": str(e), "vision_model": vision_model()}
