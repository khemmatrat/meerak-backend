"""
Zero-Touch Orchestrator — Fully Automated Production Pipeline
Flow: Navy → Pinky → Minnie → Rocky → Pinky Final → Thomas

Mission: 100% automation — Boss only ticks "Approve All"
"""

from __future__ import annotations

import asyncio
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(AQOND_BRAIN / "scripts"))


async def run_morning_briefing(logger: logging.Logger) -> dict:
    """
    Step 1: Navy generates morning report
    
    Returns:
        Navy report dict
    """
    logger.info("[Orchestrator] Step 1: Navy Morning Briefing")
    
    from factory.navy_agent import generate_morning_report
    
    report = await asyncio.to_thread(generate_morning_report, logger)
    
    logger.info("[Orchestrator] Navy report complete: %d news items", report['news_count'])
    
    return report


async def create_content_calendar(logger: logging.Logger) -> dict:
    """
    Step 2: Pinky creates 7-day calendar based on Navy's insights
    
    Returns:
        Content calendar dict
    """
    logger.info("[Orchestrator] Step 2: Pinky's 7-Day Planning")
    
    from factory.pinky_planner import create_7_day_calendar
    
    calendar = await asyncio.to_thread(create_7_day_calendar, videos_per_day=7, logger=logger)
    
    logger.info("[Orchestrator] Calendar created: %d days, %d videos", len(calendar['days']), calendar['videos_per_day'] * 7)
    
    return calendar


async def start_today_production(logger: logging.Logger) -> list[str]:
    """
    Step 3: Auto-start production for today's scheduled videos
    
    Returns:
        List of project IDs
    """
    logger.info("[Orchestrator] Step 3: Auto-Start Today's Production")
    
    from factory.pinky_planner import auto_start_today_production
    
    project_ids = await asyncio.to_thread(auto_start_today_production, logger)
    
    logger.info("[Orchestrator] Started %d projects", len(project_ids))
    
    return project_ids


async def monitor_pipeline(project_id: str, logger: logging.Logger) -> bool:
    """
    Step 4: Monitor single project through entire pipeline
    
    Pipeline:
    1. Minnie generates script
    2. Pinky reviews script (≥8/10)
    3. Rocky generates visuals
    4. Rocky auto-edits video
    5. Pinky final review (≥9/10)
    6. Move to Thomas
    
    Returns:
        True if completed successfully
    """
    logger.info("[Orchestrator] Monitoring %s...", project_id)
    
    from factory.production_manager import ProductionManager, ProductionState
    
    pm = ProductionManager()
    
    max_wait = 600  # 10 minutes per project
    check_interval = 10  # Check every 10s
    elapsed = 0
    
    while elapsed < max_wait:
        proj = pm.load_project(project_id)
        if not proj:
            logger.error("[Orchestrator] Project %s not found", project_id)
            return False
        
        state = proj.state
        
        # Success states
        if state in [ProductionState.APPROVED, ProductionState.DONE]:
            logger.info("[Orchestrator] %s COMPLETE (state: %s)", project_id, state.value)
            return True
        
        # Failure states
        if state in [ProductionState.FAILED, ProductionState.REJECTED]:
            logger.warning("[Orchestrator] %s FAILED (state: %s)", project_id, state.value)
            return False
        
        # Check if stuck
        if state == ProductionState.SCRIPT_REJECTED:
            logger.warning("[Orchestrator] %s script rejected — Minnie fixing...", project_id)
        
        if state == ProductionState.EDIT_REJECTED:
            logger.warning("[Orchestrator] %s video rejected — Rocky re-rendering...", project_id)
        
        # Wait and check again
        await asyncio.sleep(check_interval)
        elapsed += check_interval
        
        if elapsed % 60 == 0:
            logger.info("[Orchestrator] %s still in progress (%ds elapsed, state: %s)", 
                        project_id, elapsed, state.value)
    
    logger.error("[Orchestrator] %s TIMEOUT after %ds", project_id, max_wait)
    return False


async def run_zero_touch_pipeline(videos_per_day: int = 7, logger: logging.Logger | None = None):
    """
    Main Zero-Touch Pipeline
    
    Fully automated production:
    1. Navy morning briefing
    2. Pinky 7-day calendar
    3. Auto-start today's videos
    4. Monitor all pipelines
    5. Report to Boss
    
    Args:
        videos_per_day: Number of videos to produce per day (7-10)
        logger: Logger
    """
    log = logger or logging.getLogger("orchestrator")
    
    log.info("="*60)
    log.info(">>> ZERO-TOUCH PIPELINE STARTING")
    log.info("="*60)
    
    start_time = datetime.now(timezone.utc)
    
    try:
        # === Phase 1: Intelligence & Planning ===
        navy_report = await run_morning_briefing(log)
        
        calendar = await create_content_calendar(log)
        
        # === Phase 2: Production Launch ===
        project_ids = await start_today_production(log)
        
        if not project_ids:
            log.warning("[Orchestrator] No projects started — check calendar")
            return
        
        # === Phase 3: Pipeline Monitoring ===
        log.info("[Orchestrator] Monitoring %d projects...", len(project_ids))
        
        results = await asyncio.gather(
            *[monitor_pipeline(pid, log) for pid in project_ids],
            return_exceptions=True
        )
        
        # === Phase 4: Final Report ===
        successful = sum(1 for r in results if r is True)
        failed = len(results) - successful
        
        elapsed_mins = (datetime.now(timezone.utc) - start_time).total_seconds() / 60
        
        log.info("="*60)
        log.info(">>> ZERO-TOUCH PIPELINE COMPLETE")
        log.info("="*60)
        log.info("Total Projects: %d", len(project_ids))
        log.info("✅ Successful: %d", successful)
        log.info("❌ Failed: %d", failed)
        log.info("⏱ Time Elapsed: %.1f minutes", elapsed_mins)
        log.info("="*60)
        
        # Save summary
        summary = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "navy_news_count": navy_report.get('news_count', 0),
            "calendar_days": len(calendar.get('days', [])),
            "projects_started": len(project_ids),
            "successful": successful,
            "failed": failed,
            "elapsed_minutes": elapsed_mins,
            "project_ids": project_ids
        }
        
        summary_file = AQOND_BRAIN / "output" / "pipeline_summaries" / f"summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        summary_file.parent.mkdir(parents=True, exist_ok=True)
        
        import json
        summary_file.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        
        log.info("[Orchestrator] Summary saved: %s", summary_file.name)
    
    except Exception as e:
        log.error("[Orchestrator] CRITICAL ERROR: %s", e, exc_info=True)
        raise


# === Scheduled Runner (Cron/Task Scheduler) ===
async def run_daily_at_morning():
    """
    Run Zero-Touch Pipeline every morning (e.g., 6:00 AM)
    
    Usage with Windows Task Scheduler or cron:
    - Schedule: Daily at 6:00 AM
    - Command: python zero_touch_orchestrator.py
    """
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )
    log = logging.getLogger("orchestrator")
    
    await run_zero_touch_pipeline(videos_per_day=7, logger=log)


# === Test ===
if __name__ == "__main__":
    import sys
    
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )
    log = logging.getLogger("test")
    
    print("\n>>> Zero-Touch Orchestrator - Test Mode\n")
    
    # Check command-line args
    videos_per_day = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    
    asyncio.run(run_zero_touch_pipeline(videos_per_day, log))
