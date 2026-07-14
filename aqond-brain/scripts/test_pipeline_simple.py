"""
Simple Pipeline Test (assumes dashboard already running)
"""

import asyncio
import json
import logging
import sys
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AQOND_BRAIN / "scripts"))

from factory.production_manager import ProductionManager
from factory_orchestrator import process_project

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S"
)

log = logging.getLogger("test_pipeline")


async def main():
    print("=" * 60)
    print("Aqond Factory - Pipeline Test")
    print("=" * 60)
    
    spy_report_path = AQOND_BRAIN / "pipeline" / "spy_report.json"
    if spy_report_path.exists():
        spy = json.loads(spy_report_path.read_text(encoding="utf-8"))
        brief = spy.get("objective", "โฆษณา Aqond")
    else:
        brief = "สร้างคลิปโฆษณา Aqond แอปมหาวิทยาลัยออนไลน์ AI Tutor 24/7"
        spy = None
    
    pm = ProductionManager()
    proj = pm.create_project(brief, spy)
    
    log.info("เริ่ม pipeline: %s", proj.project_id)
    log.info("ดู progress ที่: http://127.0.0.1:8765")
    
    await process_project(proj, pm, log)
    
    proj_reloaded = pm.load_project(proj.project_id)
    
    print("\n" + "=" * 60)
    print("Pipeline เสร็จแล้ว")
    print("=" * 60)
    print(f"Project: {proj_reloaded.project_id}")
    print(f"State: {proj_reloaded.state.value}")
    print(f"Video: {proj_reloaded.edited_video_path}")
    print(f"QC: {proj_reloaded.qc_notes}")
    print("\nดูผลใน dashboard: http://127.0.0.1:8765")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
