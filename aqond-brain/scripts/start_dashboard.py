"""
Start Production Control Center Web Dashboard
Port 8765: http://127.0.0.1:8765
"""

import subprocess
import sys
import webbrowser
import time
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent
DASHBOARD_SCRIPT = AQOND_BRAIN / "scripts" / "factory_web_dashboard.py"

print("=" * 70)
print("Aqond Factory - Production Control Center")
print("=" * 70)
print("\nกำลังเปิด dashboard...")
print("URL: http://127.0.0.1:8765")
print("\nกด Ctrl+C เพื่อหยุด")
print("=" * 70)

time.sleep(1)
webbrowser.open("http://127.0.0.1:8765")

subprocess.run([sys.executable, str(DASHBOARD_SCRIPT)])
