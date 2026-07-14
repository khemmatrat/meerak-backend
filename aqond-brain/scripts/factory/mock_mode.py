"""
Mock Mode — ทดสอบ Factory pipeline โดยไม่เรียก API จริง
ตั้ง FACTORY_MOCK_MODE=1 ใน .env หรือ env var
"""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent


def is_mock_mode_enabled() -> bool:
    """Check ว่าเปิด mock mode หรือไม่"""
    if os.environ.get("FACTORY_MOCK_MODE", "").strip() == "1":
        return True
    env_file = AQOND_BRAIN / ".env"
    if env_file.exists():
        for line in open(env_file, "r", encoding="utf-8"):
            line = line.split("#")[0].strip()
            if line.startswith("FACTORY_MOCK_MODE="):
                return line.split("=", 1)[1].strip() == "1"
    return False


def mock_minnie_script(brief: str, spy_report: dict | None, logger: logging.Logger) -> tuple[str, None]:
    """Mock: คืนสคริปต์ตัวอย่าง"""
    logger.info("[MOCK Minnie] ใช้สคริปต์ตัวอย่าง (ไม่เรียก API)")
    script = f"""## SCRIPT

🔥 เบื่อเรียนหนังสือแบบเดิมๆ ใช่มั้ย?

มหาวิทยาลัยออนไลน์ Aqond พร้อมช่วยคุณ!
✨ AI Tutor ส่วนตัว ตอบคำถาม 24/7
📚 วิชา STEM ระดับปริญญาตรีครบ
💰 เพียง 299 บาท/เดือน

ดาวน์โหลด Aqond วันนี้ — ทดลองฟรี 7 วัน!

## SCENES
1. [0-3s] Hook: เด็กนักเรียนหงุดหงิดกับตำราหนา
2. [4-10s] Problem: การเรียนแบบเดิมน่าเบื่อ ไม่มีใครช่วย
3. [11-25s] Solution: เปิดแอป Aqond → AI tutor ตอบคำถามทันที
4. [26-35s] Features: STEM, ราคา 299, เรียนได้ทุกที่
5. [36-42s] CTA: ดาวน์โหลดเลย ทดลองฟรี 7 วัน
"""
    return (script.strip(), None)


def mock_rocky_visual(script_md: str, logger: logging.Logger) -> tuple[list[str], None]:
    """Mock: สร้าง 5 synthetic clips ด้วย FFmpeg (ยาวพอให้ผ่าน QC)"""
    logger.info("[MOCK Rocky Visual] สร้าง 5 synthetic clips (12s each)")
    clips = []
    
    # ใช้ directory ถาวร (ไม่ใช่ tempfile) เพื่อให้ concat ใช้ได้
    output_tmp = AQOND_BRAIN / "output" / ".tmp_clips"
    output_tmp.mkdir(parents=True, exist_ok=True)
    
    colors = ["0x2a3a5a", "0x5a3a5a", "0x3a5a3a", "0x5a5a2a", "0x3a3a5a"]
    for idx in range(5):
        out = output_tmp / f"mock_clip_{idx:02d}.mp4"
        color = colors[idx % len(colors)]
        # ไม่ใส่ drawtext — คลิป mock คือสีพื้นเท่านั้น (ไม่หลอกว่าเป็น Grok)
        args = [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c={color}:s=1920x1080:r=30:d=12",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "28",
            "-pix_fmt",
            "yuv420p",
            str(out.resolve()),
        ]
        
        try:
            r = subprocess.run(args, capture_output=True, text=True, timeout=25, cwd=str(AQOND_BRAIN))
            if r.returncode != 0:
                stderr = (r.stderr or r.stdout or "")[:800]
                logger.error("[MOCK Visual] คลิป %d FFmpeg exit %d: %s", idx, r.returncode, stderr)
            elif out.exists() and out.stat().st_size > 1000:
                clips.append(str(out.resolve()))
                logger.info("[MOCK Visual] ✅ คลิป %d: %s (%.1f KB)", idx, out.name, out.stat().st_size / 1024)
            else:
                exists = out.exists()
                size = out.stat().st_size if exists else 0
                logger.error("[MOCK Visual] คลิป %d: exists=%s, size=%d", idx, exists, size)
        except subprocess.TimeoutExpired:
            logger.error("[MOCK Visual] คลิป %d timeout (>25s)", idx)
        except Exception as e:
            logger.error("[MOCK Visual] คลิป %d exception: %s", idx, e)
    
    logger.info("[MOCK Visual] สร้างสำเร็จ: %d/%d clips", len(clips), 5)
    return (clips, None) if clips else (None, "สร้าง mock clips ล้มเหลว")


def mock_rocky_editor_timeline(raw_clips: list[str], logger: logging.Logger) -> tuple[list[dict], float, list[str]]:
    """Mock: simple timeline — ต่อคลิปตามลำดับ"""
    logger.info("[MOCK Rocky Editor] ใช้ simple timeline")
    timeline = []
    for idx in range(len(raw_clips)):
        timeline.append({
            "clip_index": idx,
            "start_sec": 0,
            "end_sec": 999,
            "transition": "fade" if idx > 0 else "cut",
        })
    return (timeline, 0.25, [])


def mock_thomas_publish(video_path: str, caption: str, platforms: list[str], logger: logging.Logger) -> tuple[dict[str, str], list[str]]:
    """Mock: คืน mock URLs (ไม่อัปโหลดจริง)"""
    logger.info("[MOCK Thomas] ไม่อัปโหลดจริง — คืน mock URLs")
    success = {}
    for p in platforms:
        success[p] = f"https://mock.{p}.com/video/123456"
    return (success, [])
