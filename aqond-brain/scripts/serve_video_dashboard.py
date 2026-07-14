"""
Local dashboard — เปิดดูวิดีโอที่ Rocky Studio เจนแล้ว
รัน:  python scripts/serve_video_dashboard.py
แล้วเปิดเบราว์เซอร์: http://127.0.0.1:8765/dashboard/
"""

from __future__ import annotations

import functools
import http.server
import socketserver
import webbrowser
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent
OUTPUT = AQOND_BRAIN / "output"
PORT = 8765


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "final_videos").mkdir(parents=True, exist_ok=True)
    (OUTPUT / "dashboard").mkdir(parents=True, exist_ok=True)

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(OUTPUT))
    with socketserver.ThreadingTCPServer(("", PORT), handler) as httpd:
        url = f"http://127.0.0.1:{PORT}/dashboard/"
        print(f"Rocky Studio dashboard: {url}")
        print("Ctrl+C to stop.")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        httpd.serve_forever()


if __name__ == "__main__":
    main()
