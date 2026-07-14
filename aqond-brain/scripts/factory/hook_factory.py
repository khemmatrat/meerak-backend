"""
AQOND Hook Factory — Automated 8–10s vertical hook clips.

Pipeline: Script (Gemini/Grok) → AQOND TTS → Image (DALL-E/Grok/Stock) → FFmpeg → SQLite
"""

from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent
if str(AQOND_BRAIN / "scripts") not in sys.path:
    sys.path.insert(0, str(AQOND_BRAIN / "scripts"))

ENV_FILE = AQOND_BRAIN / ".env"
HOOK_ASSETS_DIR = AQOND_BRAIN / "output" / "hook_factory" / "assets"
HOOK_OUTPUT_DIR = AQOND_BRAIN / "output" / "hook_factory" / "final"
DB_PATH = AQOND_BRAIN / "output" / "hook_factory" / "aqond_media_factory.db"

TTS_MAX_RETRIES = 3
TTS_RETRY_DELAY_SEC = 5


def load_env() -> dict[str, str]:
    out: dict[str, str] = {}
    if ENV_FILE.is_file():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.split("#")[0].strip()
            if "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.strip().strip('"').strip("'")
            if v:
                out[k.strip()] = v
    for k, v in os.environ.items():
        if v and k not in out:
            out[k] = v
    return out


def setup_logger(name: str = "hook_factory") -> logging.Logger:
    log_dir = AQOND_BRAIN / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    fh = logging.FileHandler(log_dir / "hook_factory.log", encoding="utf-8")
    fh.setFormatter(fmt)
    sh = logging.StreamHandler()
    sh.setFormatter(fmt)
    logger.addHandler(fh)
    logger.addHandler(sh)
    return logger


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS aqond_media_factory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            publish_date TEXT NOT NULL,
            publish_time TEXT NOT NULL,
            video_type TEXT NOT NULL,
            topic TEXT NOT NULL,
            script_text TEXT NOT NULL,
            subtitle_json TEXT,
            voiceover_path TEXT,
            image_path TEXT,
            output_video_path TEXT,
            status TEXT DEFAULT 'PENDING',
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()
    conn.close()


def _insert_job(
    publish_date: str,
    publish_time: str,
    topic: str,
    script_text: str,
    status: str = "PROCESSING",
) -> int:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO aqond_media_factory
        (publish_date, publish_time, video_type, topic, script_text, status)
        VALUES (?, ?, 'HOOK_8S', ?, ?, ?)
        """,
        (publish_date, publish_time, topic, script_text, status),
    )
    job_id = cur.lastrowid
    conn.commit()
    conn.close()
    return int(job_id)


def _update_job(job_id: int, **fields: Any) -> None:
    if not fields:
        return
    cols = ", ".join(f"{k} = ?" for k in fields)
    vals = list(fields.values()) + [job_id]
    conn = sqlite3.connect(DB_PATH)
    conn.execute(f"UPDATE aqond_media_factory SET {cols} WHERE id = ?", vals)
    conn.commit()
    conn.close()


def generate_hook_script(topic: str, logger: logging.Logger) -> str:
    """Gemini → Grok → mock fallback."""
    env = load_env()
    min_words = env.get("HOOK_SCRIPT_MIN_WORDS", "12")
    max_words = env.get("HOOK_SCRIPT_MAX_WORDS", "28")

    prompt = f"""เขียนบทพากย์ภาษาไทยสำหรับ Hook วิดีโอสั้น 8–10 วินาที แอป AQOND
หัวข้อ: {topic}

กฎ:
- ประโยคคำถามกระแทกจุเจ็บ 3–5 วินาทีแรก
- ปิดด้วยว่า AQOND ช่วยอย่างไร 2–3 วินาทีท้าย
- {min_words}–{max_words} คำ ไม่เกิน 2 ประโยว
- ส่งกลับเฉพาะข้อความพากย์ ไม่มีคำอธิบาย ไม่มี markdown
"""

    gemini_key = env.get("GEMINI_API_KEY", "").strip()
    if gemini_key:
        try:
            import google.generativeai as genai

            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel(env.get("GEMINI_MODEL", "gemini-1.5-flash"))
            resp = model.generate_content(prompt)
            text = (resp.text or "").strip()
            if text:
                logger.info("[Hook] Script from Gemini")
                return _clean_vo_text(text)
        except Exception as e:
            logger.warning("[Hook] Gemini failed: %s", e)

    xai_key = env.get("XAI_API_KEY", "").strip()
    if xai_key:
        try:
            payload = json.dumps(
                {
                    "model": env.get("GROK_MODEL", "grok-3"),
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.7,
                }
            ).encode("utf-8")
            req = Request(
                "https://api.x.ai/v1/chat/completions",
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {xai_key}",
                },
                method="POST",
            )
            with urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            text = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
                .strip()
            )
            if text:
                logger.info("[Hook] Script from Grok")
                return _clean_vo_text(text)
        except (HTTPError, URLError, Exception) as e:
            logger.warning("[Hook] Grok script failed: %s", e)

    logger.info("[Hook] Using fallback script template")
    return _clean_vo_text(
        f"ยังโดนเบี้ยวเงินค่าจ้างอยู่ไหม? AQOND มี MatchJob ตรวจนายจ้างก่อนให้รับงาน — ลองฟรีวันนี้"
    )


def _clean_vo_text(text: str) -> str:
    s = text.strip().strip('"').strip("'")
    s = re.sub(r"^#+\s*", "", s)
    s = re.sub(r"\*\*", "", s)
    s = re.sub(r"\[.*?\]", "", s)
    return " ".join(s.split())


def generate_voice_aqond_tts(
    text: str,
    output_path: Path,
    character: str,
    logger: logging.Logger,
) -> bool:
    """POST to AQOND Voice Studio (app_voice_api.py)."""
    env = load_env()
    base = (
        env.get("AQOND_TTS_URL")
        or env.get("LOCAL_TTS_URL")
        or "http://127.0.0.1:8000/api/v1/generate-voice"
    ).rstrip("/")
    if not base.endswith("generate-voice"):
        if base.endswith("/api/v1"):
            url = f"{base}/generate-voice"
        else:
            url = f"{base}/api/v1/generate-voice"
    else:
        url = base

    payload = json.dumps(
        {"text": text, "character": character, "speed": 1.0}
    ).encode("utf-8")

    for attempt in range(1, TTS_MAX_RETRIES + 1):
        try:
            req = Request(
                url,
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(req, timeout=90) as resp:
                data = resp.read()
            if len(data) < 500:
                raise RuntimeError(f"TTS response too small ({len(data)} bytes)")
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(data)
            logger.info("[Hook] TTS OK → %s (%.1f KB)", output_path.name, len(data) / 1024)
            return True
        except Exception as e:
            logger.warning(
                "[Hook] TTS attempt %d/%d failed: %s", attempt, TTS_MAX_RETRIES, e
            )
            if attempt < TTS_MAX_RETRIES:
                time.sleep(TTS_RETRY_DELAY_SEC * attempt)
    return False


def generate_hook_image(
    script_text: str,
    topic: str,
    output_path: Path,
    logger: logging.Logger,
) -> bool:
    env = load_env()
    prompt = (
        f"Cinematic vertical 9:16 marketing photo for Thai app AQOND. "
        f"Topic: {topic}. Mood from script: {script_text[:200]}. "
        f"Professional Thai person, premium lighting, emotional, no text overlay."
    )

    openai_key = env.get("OPENAI_API_KEY", "").strip()
    if openai_key:
        try:
            from openai import OpenAI

            client = OpenAI(api_key=openai_key)
            resp = client.images.generate(
                model="dall-e-3",
                prompt=prompt[:4000],
                size="1024x1792",
                quality="standard",
                n=1,
            )
            image_url = resp.data[0].url
            if image_url:
                with urlopen(image_url, timeout=60) as r:
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    output_path.write_bytes(r.read())
                logger.info("[Hook] Image from DALL-E 3")
                return True
        except Exception as e:
            logger.warning("[Hook] DALL-E failed: %s", e)

    try:
        from factory.visual_upgrade import generate_image_with_grok

        grok_path = generate_image_with_grok(prompt, logger)
        if grok_path and Path(grok_path).is_file():
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(Path(grok_path).read_bytes())
            logger.info("[Hook] Image from Grok")
            return True
    except Exception as e:
        logger.warning("[Hook] Grok image failed: %s", e)

    try:
        from factory.stock_images import download_stock_image, get_stock_image_url

        idx = abs(hash(topic)) % 8
        url = get_stock_image_url(idx)
        if download_stock_image(url, str(output_path)):
            logger.info("[Hook] Image from stock fallback")
            return True
    except Exception as e:
        logger.warning("[Hook] Stock image failed: %s", e)

    return False


def get_audio_duration(audio_path: Path) -> float:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(audio_path),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if r.returncode == 0 and r.stdout.strip():
        return max(1.0, float(r.stdout.strip()))
    return 9.0


def create_subtitles_srt(text: str, duration: float, srt_path: Path) -> dict:
    words = text.split()
    if not words:
        words = [text]
    chunk_size = max(1, len(words) // 2)
    chunks = [
        " ".join(words[i : i + chunk_size])
        for i in range(0, len(words), chunk_size)
    ]
    chunks = [c for c in chunks if c.strip()] or [text]
    time_per = duration / len(chunks)

    lines: list[str] = []
    meta: list[dict[str, Any]] = []
    for idx, chunk in enumerate(chunks):
        start = idx * time_per
        end = (idx + 1) * time_per
        start_srt = _sec_to_srt(start)
        end_srt = _sec_to_srt(end)
        lines.append(f"{idx + 1}\n{start_srt} --> {end_srt}\n{chunk}\n")
        meta.append({"start": start, "end": end, "text": chunk})

    srt_path.parent.mkdir(parents=True, exist_ok=True)
    srt_path.write_text("\ufeff" + "\n".join(lines), encoding="utf-8")
    return {"chunks": meta}


def _sec_to_srt(sec: float) -> str:
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    ms = int((sec % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _escape_ffmpeg_path(path: Path) -> str:
    p = str(path.resolve()).replace("\\", "/")
    if len(p) >= 2 and p[1] == ":":
        p = p[0] + "\\:" + p[2:]
    return p.replace("'", r"\'")


def compile_hook_video(
    image_path: Path,
    audio_path: Path,
    srt_path: Path,
    output_path: Path,
    logger: logging.Logger,
    attach_subtitles: bool = True,
) -> bool:
    duration = get_audio_duration(audio_path)
    frames = max(int(duration * 30), 30)

    base_vf = (
        f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
        f"zoompan=z='min(zoom+0.0010,1.12)':d={frames}:s=1080x1920:fps=30"
    )
    if attach_subtitles and srt_path.is_file():
        srt_esc = _escape_ffmpeg_path(srt_path)
        vf = (
            base_vf
            + f",subtitles='{srt_esc}':force_style="
            + "'FontSize=22,PrimaryColour=&H00FFFFFF,Outline=2,OutlineColour=&H00000000,"
            + "Alignment=2,MarginV=100'"
        )
    else:
        vf = base_vf

    cmd = [
        "ffmpeg",
        "-y",
        "-loop",
        "1",
        "-i",
        str(image_path),
        "-i",
        str(audio_path),
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "-t",
        str(duration),
        "-shortest",
        str(output_path),
    ]

    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if r.returncode != 0:
            logger.error("[Hook] FFmpeg: %s", (r.stderr or r.stdout)[-800:])
            return False
        if not output_path.is_file():
            return False

        max_mb = float(load_env().get("HOOK_MAX_OUTPUT_MB", "15"))
        size_mb = output_path.stat().st_size / (1024 * 1024)
        if size_mb > max_mb:
            _recompress_video(output_path, logger, target_mb=max_mb)
        logger.info("[Hook] Video compiled: %s (%.2f MB)", output_path.name, size_mb)
        return True
    except Exception as e:
        logger.error("[Hook] FFmpeg exception: %s", e)
        return False


def _recompress_video(path: Path, logger: logging.Logger, target_mb: float = 15.0) -> None:
    tmp = path.with_suffix(".tmp.mp4")
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(path),
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        str(tmp),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if r.returncode == 0 and tmp.is_file():
        tmp.replace(path)
        logger.info("[Hook] Recompressed to %.2f MB", path.stat().st_size / (1024 * 1024))


def run_hook_pipeline(
    topic: str,
    publish_date: str | None = None,
    publish_time: str | None = None,
    character: str | None = None,
    logger: logging.Logger | None = None,
) -> dict[str, Any]:
    """Run full hook pipeline for one slot. Returns result dict."""
    log = logger or setup_logger()
    init_db()
    env = load_env()

    date_str = publish_date or datetime.now().strftime("%Y-%m-%d")
    time_str = publish_time or datetime.now().strftime("%H:%M")
    char = character or env.get("HOOK_DEFAULT_CHARACTER", "man")

    prefix = f"HOOK_{date_str}_{time_str.replace(':', '')}"
    voice_file = HOOK_ASSETS_DIR / f"{prefix}_voice.mp3"
    image_file = HOOK_ASSETS_DIR / f"{prefix}_image.jpg"
    srt_file = HOOK_ASSETS_DIR / f"{prefix}_sub.srt"
    video_file = HOOK_OUTPUT_DIR / f"{prefix}_final.mp4"

    HOOK_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    HOOK_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    log.info("[Hook] START %s %s — %s", date_str, time_str, topic)

    script = generate_hook_script(topic, log)
    job_id = _insert_job(date_str, time_str, topic, script, status="PROCESSING")

    try:
        if not generate_voice_aqond_tts(script, voice_file, char, log):
            raise RuntimeError(
                "AQOND TTS ล้มเหลว — ตรวจ AQOND_TTS_URL / เปิด app_voice_api.py"
            )

        if not generate_hook_image(script, topic, image_file, log):
            raise RuntimeError("สร้างภาพ hook ไม่สำเร็จ")

        duration = get_audio_duration(voice_file)
        subtitle_meta = create_subtitles_srt(script, duration, srt_file)

        if not compile_hook_video(image_file, voice_file, srt_file, video_file, log):
            raise RuntimeError("FFmpeg compile ล้มเหลว")

        _update_job(
            job_id,
            script_text=script,
            subtitle_json=json.dumps(subtitle_meta, ensure_ascii=False),
            voiceover_path=str(voice_file),
            image_path=str(image_file),
            output_video_path=str(video_file),
            status="COMPLETED",
            error_message=None,
        )
        log.info("[Hook] SUCCESS job #%d → %s", job_id, video_file)
        return {
            "ok": True,
            "job_id": job_id,
            "topic": topic,
            "script": script,
            "video_path": str(video_file),
        }
    except Exception as e:
        _update_job(job_id, status="FAILED", error_message=str(e))
        log.error("[Hook] FAILED job #%d: %s", job_id, e)
        return {"ok": False, "job_id": job_id, "topic": topic, "error": str(e)}


def run_all_due_hooks(for_date: str | None = None) -> list[dict[str, Any]]:
    """Run hooks from schedule config (all slots for today)."""
    log = setup_logger("hook_factory_batch")
    cfg_path = AQOND_BRAIN / "config" / "media_factory_schedule.json"
    if not cfg_path.is_file():
        log.error("Missing config: %s", cfg_path)
        return []

    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    date_str = for_date or datetime.now().strftime("%Y-%m-%d")
    character = cfg.get("default_character", "man")
    results: list[dict[str, Any]] = []

    for slot in cfg.get("hook_slots", []):
        topic = slot.get("topic", "AQOND Platform")
        time_str = slot.get("time", "09:00")
        results.append(
            run_hook_pipeline(
                topic=topic,
                publish_date=date_str,
                publish_time=time_str,
                character=character,
                logger=log,
            )
        )
    return results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="AQOND Hook Factory — single run")
    parser.add_argument("--topic", default="MatchJob กันคนโกงจ่ายค่าจ้าง")
    parser.add_argument("--time", default=datetime.now().strftime("%H:%M"))
    parser.add_argument("--character", default=None)
    parser.add_argument("--all-today", action="store_true", help="Run all slots from schedule JSON")
    args = parser.parse_args()

    if args.all_today:
        out = run_all_due_hooks()
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        out = run_hook_pipeline(topic=args.topic, publish_time=args.time, character=args.character)
        print(json.dumps(out, ensure_ascii=False, indent=2))
        sys.exit(0 if out.get("ok") else 1)
