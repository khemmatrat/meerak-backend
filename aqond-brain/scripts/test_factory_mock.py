"""
Test Factory ใน MOCK MODE — ไม่เรียก API ช่วงทดสอบ (ใช้ FFmpeg synthetic เท่านั้น)
"""

import asyncio
import json
import logging
import os
import sys
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AQOND_BRAIN / "scripts"))

from factory.production_manager import ProductionManager, ProductionState
from factory_orchestrator import process_project


def setup_logging():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    return logging.getLogger("test_factory_mock")


async def main():
    # Force mock mode
    os.environ["FACTORY_MOCK_MODE"] = "1"
    
    logger = setup_logging()
    logger.warning("=" * 60)
    logger.warning("MOCK MODE TEST — ไม่เรียก Claude/Grok/Social APIs")
    logger.warning("ใช้ FFmpeg synthetic เท่านั้น")
    logger.warning("=" * 60)
    
    pm = ProductionManager(logger)

    brief = """โฆษณา Aqond — แอปเรียนออนไลน์สไตล์มหาวิทยาลัย
    
จุดเด่น:
- AI Tutor ส่วนตัว 24/7
- วิชา STEM ระดับปริญญาตรี
- ราคา 299 บาท/เดือน

Target: Gen Z, มหาลัย
CTA: ดาวน์โหลด Aqond — ทดลองฟรี 7 วัน"""

    spy = {
        "competitors": [
            {"name": "Coursera", "weakness": "ไม่มี AI tutor"},
        ]
    }

    proj = pm.create_project(brief, spy)
    logger.info("สร้าง mock test project: %s", proj.project_id)
    logger.info("เริ่ม pipeline (mock)...")

    await process_project(proj, pm, logger)

    proj = pm.load_project(proj.project_id)
    if proj:
        logger.info("\n" + "=" * 60)
        logger.info("MOCK TEST RESULT")
        logger.info("=" * 60)
        logger.info("Project ID: %s", proj.project_id)
        logger.info("State: %s", proj.state.value)
        logger.info("Script: %d chars", len(proj.script_md))
        logger.info("Raw clips: %d", len(proj.raw_clips))
        logger.info("Edited video: %s", proj.edited_video_path)
        logger.info("QC notes: %s", proj.qc_notes)
        logger.info("Publish URLs: %s", proj.publish_urls)
        logger.info("Retry count: %d", proj.retry_count)
        logger.info("Errors: %s", proj.error_log if proj.error_log else "None")
        logger.info("=" * 60)

        if proj.state == ProductionState.DONE:
            logger.info("\n✅ สำเร็จ! (MOCK) ดูวิดีโอที่: %s", proj.edited_video_path)
            logger.info("\nNext: ใส่ API keys จริง (ANTHROPIC_API_KEY) แล้วลบ FACTORY_MOCK_MODE")
        else:
            logger.error("\n❌ ล้มเหลว — state: %s", proj.state.value)


if __name__ == "__main__":
    asyncio.run(main())
