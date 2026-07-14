"""
Full Pipeline Test + Dashboard
1. รัน factory pipeline (real API or mock)
2. เปิด dashboard ให้ดู progress real-time
"""

import asyncio
import logging
import os
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AQOND_BRAIN / "scripts"))

from factory.production_manager import ProductionManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S"
)

log = logging.getLogger("test")


async def run_pipeline():
    """เรียก factory_orchestrator process_project"""
    from factory_orchestrator import process_project
    
    spy_report_path = AQOND_BRAIN / "pipeline" / "spy_report.json"
    if spy_report_path.exists():
        import json
        spy = json.loads(spy_report_path.read_text(encoding="utf-8"))
        brief = spy.get("objective", "โฆษณา Aqond")
    else:
        brief = "สร้างคลิปโฆษณา Aqond แอปมหาวิทยาลัยออนไลน์ AI Tutor 24/7"
        spy = None
    
    pm = ProductionManager()
    proj = pm.create_project(brief, spy)
    
    log.info("เริ่ม pipeline: %s", proj.project_id)
    await process_project(proj, pm, log)
    
    log.info("Pipeline เสร็จแล้ว — ดูผลใน dashboard")


async def start_dashboard_async():
    """เปิด dashboard (background process)"""
    dashboard_script = AQOND_BRAIN / "scripts" / "factory_web_dashboard.py"
    
    proc = await asyncio.create_subprocess_exec(
        sys.executable, str(dashboard_script),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT
    )
    
    # รอให้ server ขึ้น
    await asyncio.sleep(3)
    webbrowser.open("http://127.0.0.1:8765")
    
    return proc


async def main():
    print("=" * 70)
    print("Aqond Factory - Full Pipeline + Dashboard")
    print("=" * 70)
    
    # Check if dashboard already running
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(("127.0.0.1", 8765))
    sock.close()
    
    dashboard_proc = None
    if result != 0:
        log.info("เปิด dashboard...")
        dashboard_proc = await start_dashboard_async()
    else:
        log.info("Dashboard รันอยู่แล้ว — เปิด browser")
        webbrowser.open("http://127.0.0.1:8765")
    
    log.info("เริ่ม pipeline...")
    await run_pipeline()
    
    print("\n" + "=" * 70)
    print("[OK] Pipeline เสร็จแล้ว")
    print("Dashboard: http://127.0.0.1:8765")
    print("กด Ctrl+C เพื่อหยุด dashboard")
    print("=" * 70)
    
    # Keep dashboard running
    if dashboard_proc:
        try:
            await dashboard_proc.wait()
        except KeyboardInterrupt:
            dashboard_proc.terminate()
            await dashboard_proc.wait()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("\nหยุดโดยผู้ใช้")
