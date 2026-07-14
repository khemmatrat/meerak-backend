"""
AQOND Media Factory Scheduler — runs hook_factory on daily timeline.

Usage:
  python scripts/factory/app_scheduler.py              # start daemon
  python scripts/factory/app_scheduler.py --run-now      # all slots now (test)
  python scripts/factory/app_scheduler.py --run-slot 10:40
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent
if str(AQOND_BRAIN / "scripts") not in sys.path:
    sys.path.insert(0, str(AQOND_BRAIN / "scripts"))

CONFIG_PATH = AQOND_BRAIN / "config" / "media_factory_schedule.json"


def setup_logger() -> logging.Logger:
    log_dir = AQOND_BRAIN / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("hook_scheduler")
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    fh = logging.FileHandler(log_dir / "hook_scheduler.log", encoding="utf-8")
    fh.setFormatter(fmt)
    sh = logging.StreamHandler()
    sh.setFormatter(fmt)
    logger.addHandler(fh)
    logger.addHandler(sh)
    return logger


def load_schedule() -> dict:
    if not CONFIG_PATH.is_file():
        raise FileNotFoundError(f"Schedule config not found: {CONFIG_PATH}")
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def run_slot(time_str: str, logger: logging.Logger) -> None:
    from factory.hook_factory import run_hook_pipeline

    cfg = load_schedule()
    character = cfg.get("default_character", "man")
    slot = next((s for s in cfg.get("hook_slots", []) if s.get("time") == time_str), None)
    if not slot:
        logger.error("No hook slot for time %s in schedule config", time_str)
        return
    topic = slot.get("topic", "AQOND Platform")
    today = datetime.now().strftime("%Y-%m-%d")
    logger.info("[Scheduler] Trigger slot %s — %s", time_str, topic)
    result = run_hook_pipeline(
        topic=topic,
        publish_date=today,
        publish_time=time_str,
        character=character,
        logger=logger,
    )
    if result.get("ok"):
        logger.info("[Scheduler] Slot %s OK → %s", time_str, result.get("video_path"))
    else:
        logger.error("[Scheduler] Slot %s FAILED: %s", time_str, result.get("error"))


def run_all_slots_now(logger: logging.Logger) -> None:
    from factory.hook_factory import run_all_due_hooks

    logger.info("[Scheduler] Manual run — all hook slots for today")
    results = run_all_due_hooks()
    ok = sum(1 for r in results if r.get("ok"))
    logger.info("[Scheduler] Done %d/%d successful", ok, len(results))


def start_daemon() -> None:
    try:
        from apscheduler.schedulers.blocking import BlockingScheduler
        from apscheduler.triggers.cron import CronTrigger
    except ImportError as e:
        print("Install APScheduler: pip install APScheduler")
        raise SystemExit(1) from e

    logger = setup_logger()
    cfg = load_schedule()
    tz = cfg.get("timezone", "Asia/Bangkok")

    scheduler = BlockingScheduler(timezone=tz)
    for slot in cfg.get("hook_slots", []):
        time_str = slot.get("time", "")
        if not time_str or ":" not in time_str:
            continue
        hour, minute = time_str.split(":", 1)
        scheduler.add_job(
            run_slot,
            CronTrigger(hour=int(hour), minute=int(minute), timezone=tz),
            args=[time_str, logger],
            id=f"hook_{time_str.replace(':', '')}",
            replace_existing=True,
            misfire_grace_time=300,
        )
        logger.info("[Scheduler] Registered daily job at %s (%s)", time_str, tz)

    logger.info("[Scheduler] Daemon running — Ctrl+C to stop")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("[Scheduler] Stopped")


def main() -> None:
    parser = argparse.ArgumentParser(description="AQOND Hook Factory Scheduler")
    parser.add_argument(
        "--run-now",
        action="store_true",
        help="Run all hook slots immediately (testing)",
    )
    parser.add_argument(
        "--run-slot",
        metavar="HH:MM",
        help="Run one scheduled slot now (e.g. 10:40)",
    )
    args = parser.parse_args()
    logger = setup_logger()

    if args.run_now:
        run_all_slots_now(logger)
        return
    if args.run_slot:
        run_slot(args.run_slot, logger)
        return
    start_daemon()


if __name__ == "__main__":
    main()
