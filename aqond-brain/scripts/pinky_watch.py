"""
pinky_watch.py — วนเช็กว่า pipeline มีการอัปเดตหรือไม่
ถ้ามี (ไฟล์ใหม่ / spy_report เปลี่ยน) จะรัน pinky_manager ทันที → Discord ตาม logic ใน Pinky

รันต่อเนื่องบนเซิร์ฟเวอร์ (systemd) คู่กับ pinky-hourly.timer
ตั้งค่า: PINKY_WATCH_INTERVAL=120 (วินาที) ใน environment ได้

ไม่ log API keys
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent
PIPELINE = AQOND_BRAIN / "pipeline"
STATE_FILE = PIPELINE / ".pinky_watch_state.json"
SKIP_NAMES = {".gitkeep", ".gitignore", ".DS_Store", ".pinky_watch_state.json"}

# โฟลเดอร์/ไฟล์ที่ถือว่า "มีงานเข้า" แล้วควรให้ Pinky มาเช็ก
WATCH_DIRS = [
    PIPELINE / "minnie_drafts",
    PIPELINE / "ready_to_post",
    PIPELINE / "thomas" / "reports",
    PIPELINE / "pinky" / "strategy",
    PIPELINE / "rocky",
    PIPELINE / "pinky",
]
SPY_REPORT = PIPELINE / "spy_report.json"


def _fingerprint() -> str:
    parts: list[str] = []
    if SPY_REPORT.is_file():
        st = SPY_REPORT.stat()
        parts.append(f"spy_report.json:{st.st_mtime_ns}:{st.st_size}")

    for d in WATCH_DIRS:
        if not d.is_dir():
            continue
        try:
            for p in sorted(d.rglob("*")):
                if not p.is_file():
                    continue
                if p.name.startswith(".") or p.name in SKIP_NAMES:
                    continue
                try:
                    st = p.stat()
                    rel = p.relative_to(PIPELINE).as_posix()
                    parts.append(f"{rel}:{st.st_mtime_ns}:{st.st_size}")
                except OSError:
                    pass
        except OSError:
            pass

    raw = "\n".join(parts).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _load_state() -> str | None:
    if not STATE_FILE.is_file():
        return None
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        return data.get("fp")
    except (json.JSONDecodeError, OSError):
        return None


def _save_state(fp: str) -> None:
    PIPELINE.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps({"fp": fp}, indent=2), encoding="utf-8")


def run_pinky_once() -> int:
    script = AQOND_BRAIN / "scripts" / "pinky_manager.py"
    return subprocess.run(
        [sys.executable, str(script)],
        cwd=str(AQOND_BRAIN),
        timeout=600,
    ).returncode


def main() -> None:
    interval = int(os.environ.get("PINKY_WATCH_INTERVAL", "120"))
    print(f"[pinky_watch] เริ่มวนเช็ก pipeline ทุก {interval} วินาที (aqond-brain: {AQOND_BRAIN})", flush=True)

    # รอบแรก: บันทึกสถานะปัจจุบันโดยไม่รัน Pinky (กันยิง Discord ซ้ำตอนบูต)
    # ถ้าต้องการรันทันทีตอนสตาร์ท ให้ลบไฟล์ .pinky_watch_state.json ก่อน start service
    fp0 = _fingerprint()
    if _load_state() is None:
        _save_state(fp0)
        print("[pinky_watch] บันทึก baseline fingerprint แล้ว — รอการเปลี่ยนแปลงถัดไป", flush=True)

    while True:
        try:
            fp = _fingerprint()
            last = _load_state()
            if last is not None and fp != last:
                print(f"[pinky_watch] ตรวจพบการอัปเดต pipeline — รัน Pinky ...", flush=True)
                rc = run_pinky_once()
                print(f"[pinky_watch] pinky_manager จบด้วย exit {rc}", flush=True)
                _save_state(_fingerprint())
            time.sleep(max(30, interval))
        except KeyboardInterrupt:
            print("[pinky_watch] หยุด", flush=True)
            break
        except Exception as e:
            print(f"[pinky_watch] error: {e}", flush=True)
            time.sleep(min(interval, 60))


if __name__ == "__main__":
    main()
