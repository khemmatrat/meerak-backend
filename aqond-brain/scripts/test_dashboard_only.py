"""
Test Dashboard Only — เปิดดู projects ที่มีอยู่แล้ว
"""

import sys
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AQOND_BRAIN / "scripts"))

print("=" * 60)
print("Aqond Factory Control Center")
print("=" * 60)
print("Dashboard: http://127.0.0.1:8765")
print("กด Ctrl+C เพื่อหยุด")
print("=" * 60)

from factory_web_dashboard import main

if __name__ == "__main__":
    main()
