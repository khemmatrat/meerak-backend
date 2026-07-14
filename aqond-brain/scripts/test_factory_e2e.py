"""
Factory E2E Test — ทดสอบ pipeline โดยไม่ต้องรอ Discord
สร้าง project → process ทุก step → ดู output
"""

import asyncio
import json
import logging
import sys
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AQOND_BRAIN / "scripts"))

from factory.production_manager import ProductionManager, ProductionState
from factory_orchestrator import process_project


def setup_logging():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    return logging.getLogger("test_factory")


async def main():
    logger = setup_logging()
    pm = ProductionManager(logger)

    # โหลด spy_report.json (ถ้ามี) หรือใช้ default
    spy_path = AQOND_BRAIN / "pipeline" / "spy_report.json"
    if spy_path.exists():
        logger.info("โหลด spy_report.json...")
        try:
            spy_data = json.loads(spy_path.read_text(encoding="utf-8"))
            brief = spy_data.get("brief", "โฆษณา Aqond")
            spy = spy_data
        except Exception as e:
            logger.warning("โหลด spy_report.json ล้มเหลว: %s — ใช้ default", e)
            brief = "สร้างโฆษณา Aqond — แอปเรียนออนไลน์ AI-powered"
            spy = {}
    else:
        logger.info("ไม่มี spy_report.json — ใช้ brief ตัวอย่าง")
        brief = """สร้างโฆษณา Aqond — แอปเรียนออนไลน์สไตล์มหาวิทยาลัย
        
จุดเด่น:
- AI Tutor ส่วนตัว 24/7
- เน้นวิชา STEM ระดับปริญญาตรี
- ราคา 299 บาท/เดือน
        
Target: Gen Z, มหาลัย, ทำงานแล้วอยากเรียนต่อ
Tone: Modern, สนุก, Aspirational
CTA: ดาวน์โหลด Aqond วันนี้ — ทดลองฟรี 7 วัน"""
        spy = {
            "competitors": [
                {"name": "Coursera", "weakness": "ไม่มี AI tutor"},
                {"name": "edX", "weakness": "UX ไม่เป็นมิตรกับมือถือ"},
            ]
        }

    proj = pm.create_project(brief, spy)
    logger.info("สร้าง test project: %s", proj.project_id)

    # Process
    logger.info("เริ่ม pipeline — ใช้เวลา 2-5 นาที (ขึ้นอยู่กับ Claude + FFmpeg)...")
    await process_project(proj, pm, logger)

    # Check final state
    proj = pm.load_project(proj.project_id)
    if proj:
        logger.info("\n=== RESULT ===")
        logger.info("State: %s", proj.state.value)
        logger.info("Script: %d chars", len(proj.script_md))
        logger.info("Raw clips: %d", len(proj.raw_clips))
        logger.info("Edited video: %s", proj.edited_video_path or "N/A")
        logger.info("QC notes: %s", proj.qc_notes or "N/A")
        logger.info("Retry count: %d", proj.retry_count)
        logger.info("Errors: %s", proj.error_log)

        if proj.state == ProductionState.APPROVED:
            logger.info("\nสำเร็จ! ดูวิดีโอที่: %s", proj.edited_video_path)
            logger.info("ต่อไป: รัน factory_discord_dashboard.py เพื่อใช้ปุ่ม Approve")
        elif proj.state == ProductionState.FAILED:
            logger.error("\nล้มเหลว — ดู error_log ใน %s", f"output/production_states/{proj.project_id}.json")


if __name__ == "__main__":
    asyncio.run(main())
