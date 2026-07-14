"""
Rocky — ตัดต่อวิดีโอ (MoviePy)
เมื่อมีวิดีโอใน pipeline/rocky/raw_assets/ จะ:
1. ใส่ Subtitle อัตโนมัติ (จากบทมินนี่ / video_brief)
2. ใส่เพลงประกอบ (BGM)
3. ใส่ Logo Aqond ที่มุมจอ
ผลลัพธ์: วิดีโอสำเร็จรูปไป pipeline/rocky/finished/ และส่งไป Discord
ต้องติดตั้ง: pip install moviepy (ใน venv ของโปรเจกต์)
"""

import json
import logging
import shutil
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

AQOND_BRAIN = Path(__file__).resolve().parent.parent
PIPELINE_DIR = AQOND_BRAIN / "pipeline"
ROCKY_DIR = PIPELINE_DIR / "rocky"
RAW_ASSETS = ROCKY_DIR / "raw_assets"
FINISHED_DIR = ROCKY_DIR / "finished"
CONFIG_DIR = AQOND_BRAIN / "config"
LOGS_DIR = AQOND_BRAIN / "logs"
ENV_FILE = AQOND_BRAIN / ".env"

VIDEO_EXT = (".mp4", ".mov", ".webm", ".avi")
LOGO_PATH = AQOND_BRAIN / "config" / "assets" / "logo.png"
BGM_PATH = AQOND_BRAIN / "config" / "assets" / "bgm.mp3"


def setup_logging():
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_file = LOGS_DIR / "rocky_edit.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )
    return logging.getLogger("rocky_edit")


def _normalize_discord_url(url: str) -> str:
    """Discord เลิกใช้ discordapp.com — ใช้ discord.com แทนเพื่อหลีก 403"""
    return (url or "").replace("https://discordapp.com/", "https://discord.com/", 1).strip()


def load_webhook_report():
    out = {}
    if not ENV_FILE.exists():
        return ""
    for line in open(ENV_FILE, "r", encoding="utf-8"):
        line = line.split("#")[0].strip()
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        if k.strip() == "DISCORD_WEBHOOK_ROCKY" and v:
            return _normalize_discord_url(v)
        if k.strip() == "DISCORD_WEBHOOK_URL" and v:
            out["report"] = v
    return _normalize_discord_url(out.get("report", ""))


def send_video_done_to_discord(title: str, file_path: Path, logger) -> bool:
    """แจ้ง Discord ว่าวิดีโอสำเร็จแล้ว (Discord webhook ไม่รองรับไฟล์แนบโดยตรง — ส่งข้อความ + path)"""
    url = load_webhook_report()
    if not url:
        try:
            from report_to_discord import load_webhook_url
            url = load_webhook_url("rocky") or load_webhook_url("report")
        except Exception:
            pass
    if not url:
        logger.info("ไม่มี webhook — ข้ามส่ง Discord")
        return False
    msg = (
        f"**🎬 Rocky เสร็จแล้ว**\n"
        f"วิดีโอ: **{title}**\n"
        f"ไฟล์อยู่ที่: `pipeline/rocky/finished/{file_path.name}`\n"
        f"เจ้านายเปิดดูได้เลยครับ"
    )
    payload = json.dumps({"content": msg}).encode("utf-8")
    headers = {"Content-Type": "application/json", "User-Agent": "DiscordBot (aqond-brain/1.0)"}
    req = Request(url, data=payload, headers=headers, method="POST")
    try:
        with urlopen(req, timeout=10) as resp:
            if 200 <= resp.getcode() < 300:
                logger.info("ส่งแจ้ง Discord แล้ว")
                return True
    except (URLError, HTTPError, OSError):
        pass
    return False


def find_subtitle_or_brief(raw_video_path: Path) -> str:
    """หาบท/คำบรรยายจาก video_brief_* ใน pipeline/rocky/ หรือ minnie_drafts (ใช้ล่าสุด)"""
    texts = []
    for d in (ROCKY_DIR, PIPELINE_DIR / "minnie_drafts"):
        if not d.exists():
            continue
        for f in sorted(d.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            if not f.is_file():
                continue
            if f.name.startswith("video_brief_") or f.name.startswith("competitive_response_"):
                try:
                    s = f.read_text(encoding="utf-8", errors="replace").strip()
                    if s:
                        texts.append(s[:2000])
                except OSError:
                    pass
    return "\n\n".join(texts[:2]) if texts else ""


def process_one_video(video_path: Path, logger) -> bool:
    """ตัดต่อวิดีโอเดียว: subtitle, BGM, logo → finished/ แล้วแจ้ง Discord"""
    try:
        from moviepy.editor import VideoFileClip, TextClip, CompositeVideoClip, ImageClip
        from moviepy.config import change_settings
    except ImportError:
        logger.warning("ไม่พบ moviepy — ติดตั้ง: pip install moviepy")
        return False

    FINISHED_DIR.mkdir(parents=True, exist_ok=True)
    out_name = f"finished_{video_path.stem}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}{video_path.suffix}"
    out_path = FINISHED_DIR / out_name

    try:
        clip = VideoFileClip(str(video_path))
        w, h = clip.size
        clips_to_compose = [clip]

        # Logo ที่มุม (ขวาบน) ถ้ามีไฟล์
        if LOGO_PATH.exists():
            try:
                logo = ImageClip(str(LOGO_PATH)).with_duration(clip.duration).resize(height=int(h * 0.12))
                logo = logo.with_position((w - logo.w - 20, 20))
                clips_to_compose.append(logo)
            except Exception as e:
                logger.warning(f"ใส่ logo ไม่ได้: {e}")

        # Subtitle จากบท (แบบง่าย: ข้อความเดียว overlay ตอนต้น)
        subtitle_text = find_subtitle_or_brief(video_path)
        if subtitle_text:
            try:
                txt = TextClip(subtitle_text[:200], font="Arial", font_size=24, color="white")
                txt = txt.with_duration(min(5, clip.duration)).with_position(("center", h - 80))
                clips_to_compose.append(txt)
            except Exception as e:
                logger.warning(f"ใส่ subtitle ไม่ได้: {e}")

        # BGM (ถ้ามี config/assets/bgm.mp3) — ผสมกับเสียงเดิม
        if BGM_PATH.exists():
            try:
                from moviepy.audio.io.AudioFileClip import AudioFileClip
                from moviepy.audio.AudioClip import CompositeAudioClip
                bgm = AudioFileClip(str(BGM_PATH)).subclipped(0, clip.duration).volumex(0.25)
                if clip.audio is not None:
                    clip = clip.with_audio(CompositeAudioClip([clip.audio.volumex(0.85), bgm]))
                else:
                    clip = clip.with_audio(bgm)
                clips_to_compose[0] = clip
            except Exception as e:
                logger.warning(f"ใส่ BGM ไม่ได้: {e}")

        final = CompositeVideoClip(clips_to_compose)
        final.write_videofile(str(out_path), codec="libx264", audio_codec="aac", logger=None)
        clip.close()
        final.close()

        send_video_done_to_discord(out_name, out_path, logger)
        return True
    except Exception as e:
        logger.exception(f"ตัดต่อไม่สำเร็จ: {e}")
        return False


def watch_and_process(logger, run_once: bool = False):
    """เช็ก raw_assets — ถ้ามีวิดีโอใหม่ ให้ตัดต่อแล้วย้ายไป finished (หรือลบจาก raw เพื่อไม่รันซ้ำ)"""
    RAW_ASSETS.mkdir(parents=True, exist_ok=True)
    seen = set()
    import time
    while True:
        for p in RAW_ASSETS.iterdir():
            if not p.is_file() or p.suffix.lower() not in VIDEO_EXT:
                continue
            key = f"{p.name}_{p.stat().st_mtime}"
            if key in seen:
                continue
            seen.add(key)
            logger.info(f"พบวิดีโอใหม่: {p.name} — เริ่มตัดต่อ")
            process_one_video(p, logger)
        if run_once:
            break
        time.sleep(30)


def main():
    import sys
    logger = setup_logging()
    logger.info("Rocky Edit เริ่มทำงาน (raw_assets -> finished, แจ้ง Discord)")
    watch_and_process(logger, run_once="--once" in sys.argv)


if __name__ == "__main__":
    main()
