"""
Test Robust Pipeline — validation + timeout + clear temp
"""

import asyncio
import json
import logging
import os
import sys
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AQOND_BRAIN / "scripts"))

# Enable mock mode for faster testing
os.environ["FACTORY_MOCK_MODE"] = "1"

from factory.production_manager import ProductionManager
from factory_orchestrator import process_project

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S"
)

log = logging.getLogger("test_robust")


async def main():
    print("=" * 60)
    print("Test Robust Pipeline")
    print("=" * 60)
    print("MOCK MODE: ON")
    print("Testing: validation, timeout, temp cleanup")
    print("=" * 60)
    
    brief = "สร้างคลิปโฆษณา Aqond (Robust Test)"
    
    pm = ProductionManager()
    proj = pm.create_project(brief, None)
    
    log.info("เริ่ม pipeline: %s", proj.project_id)
    log.info("Dashboard: http://127.0.0.1:8765")
    
    await process_project(proj, pm, log)
    
    proj_reloaded = pm.load_project(proj.project_id)
    
    print("\n" + "=" * 60)
    print("Pipeline เสร็จแล้ว")
    print("=" * 60)
    print(f"Project: {proj_reloaded.project_id}")
    print(f"State: {proj_reloaded.state.value}")
    print(f"Video: {proj_reloaded.edited_video_path}")
    print(f"Size: {Path(proj_reloaded.edited_video_path).stat().st_size / 1024:.1f} KB" if proj_reloaded.edited_video_path else "N/A")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
