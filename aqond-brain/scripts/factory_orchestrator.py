"""
Factory Orchestrator — Automated Video Production Pipeline
State Machine: Draft -> Minnie Script -> Rocky Visual -> Rocky Edit -> Pinky QC -> [Discord Approval] -> Thomas Publish -> Done

รัน: python scripts/factory_orchestrator.py
- สร้าง project จาก spy_report.json อัตโนมัติ
- ประมวลผลแบบ async (หลายโปรเจกต์พร้อมกัน)
- Retry ถ้าล้มเหลว
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AQOND_BRAIN / "scripts"))

from factory.production_manager import ProductionManager, ProductionProject, ProductionState
from factory.minnie_api import generate_script_and_audio
from factory.rocky_visual_api import generate_video_clips
from factory.rocky_editor_api import edit_video_with_claude
from factory.pinky_qc import qc_video
from factory.thomas_publisher import publish_video
from factory.mock_mode import (
    is_mock_mode_enabled,
    mock_minnie_script,
    mock_rocky_visual,
    mock_rocky_editor_timeline,
    mock_thomas_publish,
)

PIPELINE_DIR = AQOND_BRAIN / "pipeline"
SPY_REPORT_PATH = PIPELINE_DIR / "spy_report.json"
LOGS_DIR = AQOND_BRAIN / "logs"


def setup_logging() -> logging.Logger:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_file = LOGS_DIR / "factory_orchestrator.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )
    return logging.getLogger("factory_orchestrator")


async def process_project(proj: ProductionProject, pm: ProductionManager, logger: logging.Logger) -> None:
    """ประมวลผล 1 project ผ่าน pipeline ทั้งหมด"""
    mock = is_mock_mode_enabled()
    if mock:
        logger.info("[%s] MOCK MODE enabled — ไม่เรียก API จริง", proj.project_id)

    # 1. Minnie: Script + Audio Generation
    if proj.state == ProductionState.DRAFT:
        logger.info("[%s] เริ่ม Minnie scripting + audio...", proj.project_id)
        pm.update_state(proj, ProductionState.SCRIPTING)
        
        if mock:
            script, err = await asyncio.to_thread(
                mock_minnie_script, proj.brief, proj.spy_report, logger
            )
            audio_path = None
        else:
            script, audio_path, err = await asyncio.to_thread(
                generate_script_and_audio, proj.brief, proj.spy_report, logger
            )
        
        if not script:
            pm.record_error(proj, f"Minnie failed: {err}")
            if pm.should_retry(proj):
                logger.info("[%s] Retry Minnie...", proj.project_id)
                pm.update_state(proj, ProductionState.DRAFT)
                await asyncio.sleep(5)
                return await process_project(proj, pm, logger)
            else:
                pm.update_state(proj, ProductionState.FAILED)
                return
        
        proj.script_md = script
        if audio_path:
            proj.audio_narration_path = audio_path
            logger.info("[%s] Minnie complete: script (%d chars) + audio", proj.project_id, len(script))
        else:
            logger.info("[%s] Minnie complete: script (%d chars), no audio", proj.project_id, len(script))
        pm._save(proj)

    # 2. Rocky Visual: Generate raw clips
    if proj.state == ProductionState.SCRIPTING:
        logger.info("[%s] เริ่ม Rocky visual generation...", proj.project_id)
        pm.update_state(proj, ProductionState.VISUAL_GEN)
        
        if mock:
            clips, err = await asyncio.to_thread(
                mock_rocky_visual, proj.script_md, logger
            )
        else:
            clips, err = await asyncio.to_thread(
                generate_video_clips, proj.script_md, logger, "medium", proj.project_id
            )
        
        if not clips:
            pm.record_error(proj, f"Rocky visual failed: {err}")
            if pm.should_retry(proj):
                logger.info("[%s] Retry Rocky visual...", proj.project_id)
                pm.update_state(proj, ProductionState.SCRIPTING)
                await asyncio.sleep(5)
                return await process_project(proj, pm, logger)
            else:
                pm.update_state(proj, ProductionState.FAILED)
                return
        
        proj.raw_clips = clips
        pm._save(proj)
        logger.info("[%s] Rocky visual complete (%d clips)", proj.project_id, len(clips))

    # 3. Rocky Editor: Merge + Edit
    if proj.state == ProductionState.VISUAL_GEN:
        logger.info("[%s] เริ่ม Rocky editing...", proj.project_id)
        pm.update_state(proj, ProductionState.EDITING)
        
        edited_path, err = await asyncio.to_thread(
            edit_video_with_claude, proj.raw_clips, proj.script_md, proj.project_id, proj.audio_narration_path, logger
        )
        
        if not edited_path:
            pm.record_error(proj, f"Rocky edit failed: {err}")
            if pm.should_retry(proj):
                logger.info("[%s] Retry Rocky edit...", proj.project_id)
                pm.update_state(proj, ProductionState.VISUAL_GEN)
                await asyncio.sleep(5)
                return await process_project(proj, pm, logger)
            else:
                pm.update_state(proj, ProductionState.FAILED)
                return
        
        proj.edited_video_path = edited_path
        pm._save(proj)
        logger.info("[%s] Rocky edit complete: %s", proj.project_id, Path(edited_path).name)

    # 4. Pinky QC
    if proj.state == ProductionState.EDITING:
        logger.info("[%s] เริ่ม Pinky QC...", proj.project_id)
        pm.update_state(proj, ProductionState.QC)
        
        passed, notes = await asyncio.to_thread(qc_video, proj.edited_video_path, logger)
        
        if not passed:
            pm.record_error(proj, f"Pinky QC failed: {notes}")
            if pm.should_retry(proj):
                logger.info("[%s] Retry from visual_gen...", proj.project_id)
                pm.update_state(proj, ProductionState.VISUAL_GEN)
                await asyncio.sleep(5)
                return await process_project(proj, pm, logger)
            else:
                pm.update_state(proj, ProductionState.FAILED)
                return
        
        proj.qc_notes = notes
        pm._save(proj)
        logger.info("[%s] Pinky QC passed: %s", proj.project_id, notes[:100])
        
        # พร้อม Approval — รอ Discord interaction (หรือ auto-approve ถ้าไม่มี bot)
        pm.update_state(proj, ProductionState.APPROVED)
        logger.info("[%s] ✅ QC PASSED — รอ approval (Discord bot / manual)", proj.project_id)
        
        if mock:
            logger.info("[%s] MOCK: auto-approve และ mock publish", proj.project_id)
            await asyncio.sleep(2)
            # Mock publish
            success, errors = await asyncio.to_thread(
                mock_thomas_publish, proj.edited_video_path, "Mock caption", ["facebook"], logger
            )
            proj.publish_urls = success
            pm.update_state(proj, ProductionState.DONE)
            logger.info("[%s] 🎉 MOCK DONE — ดูวิดีโอที่: %s", proj.project_id, proj.edited_video_path)


async def watch_spy_report(pm: ProductionManager, logger: logging.Logger, interval: float = 10.0) -> None:
    """เช็ก spy_report.json — สร้าง project ใหม่เมื่ออัปเดต"""
    last_mtime = None
    
    while True:
        try:
            if SPY_REPORT_PATH.exists():
                mtime = SPY_REPORT_PATH.stat().st_mtime
                if last_mtime is None or mtime != last_mtime:
                    logger.info("[Factory] ตรวจพบ spy_report.json — สร้าง project")
                    try:
                        spy = json.loads(SPY_REPORT_PATH.read_text(encoding="utf-8"))
                        brief = spy.get("brief", "สร้างโฆษณา Aqond")
                        proj = pm.create_project(brief, spy)
                        
                        # Process in background
                        asyncio.create_task(process_project(proj, pm, logger))
                    except Exception as e:
                        logger.exception("[Factory] สร้าง project ล้มเหลว: %s", e)
                    
                    last_mtime = mtime
        except Exception as e:
            logger.exception("[Factory] เช็ก spy_report error: %s", e)
        
        await asyncio.sleep(interval)


async def process_pending_projects(pm: ProductionManager, logger: logging.Logger) -> None:
    """ประมวลผล projects ที่ค้างอยู่ (ไม่ใช่ done/failed/rejected)"""
    pending_states = [
        ProductionState.DRAFT,
        ProductionState.SCRIPTING,
        ProductionState.VISUAL_GEN,
        ProductionState.EDITING,
        ProductionState.QC,
    ]
    
    while True:
        try:
            tasks = []
            for state in pending_states:
                projects = pm.list_projects(state)
                for proj in projects[:3]:  # จำกัด 3 ต่อ state
                    tasks.append(asyncio.create_task(process_project(proj, pm, logger)))
            
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
        except Exception as e:
            logger.exception("[Factory] process_pending error: %s", e)
        
        await asyncio.sleep(15)


async def main_async(logger: logging.Logger) -> None:
    """Main async loop"""
    pm = ProductionManager(logger)
    logger.info("[Factory Orchestrator] เริ่มทำงาน — Video Production Factory")
    logger.info("[Factory] เช็ก spy_report.json ทุก 10 วินาที")
    logger.info("[Factory] ประมวลผล pending projects ทุก 15 วินาที")
    
    await asyncio.gather(
        watch_spy_report(pm, logger),
        process_pending_projects(pm, logger),
    )


def main():
    logger = setup_logging()
    if is_mock_mode_enabled():
        logger.warning("=" * 60)
        logger.warning("MOCK MODE ENABLED — ไม่เรียก API จริง (Minnie/Rocky/Thomas)")
        logger.warning("ปิด mock: ลบ FACTORY_MOCK_MODE=1 จาก .env")
        logger.warning("=" * 60)
    try:
        asyncio.run(main_async(logger))
    except KeyboardInterrupt:
        logger.info("[Factory] หยุดโดยผู้ใช้")


if __name__ == "__main__":
    main()
