"""
report_to_discord.py — ส่งสรุปไป Discord
รองรับ webhook จาก aqond-brain/.env (DISCORD_WEBHOOK_*) หรือ config/webhooks.json
"""

import json
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

AQOND_BRAIN = Path(__file__).resolve().parent.parent
CONFIG_DIR = AQOND_BRAIN / "config"
WEBHOOKS_JSON = CONFIG_DIR / "webhooks.json"
ENV_FILE = AQOND_BRAIN / ".env"
NAVY_INTEL_CHANNEL_KEY = "navy_intel"

# map channel_key -> ชื่อตัวแปรใน .env
_ENV_MAP = {"navy_intel": "DISCORD_WEBHOOK_NAVY", "pinky_hq": "DISCORD_WEBHOOK_PINKY", "pinky": "DISCORD_WEBHOOK_PINKY",
            "minnie": "DISCORD_WEBHOOK_MINNIE", "rocky": "DISCORD_WEBHOOK_ROCKY", "navy": "DISCORD_WEBHOOK_NAVY",
            "thomas": "DISCORD_WEBHOOK_THOMAS", "report": "DISCORD_WEBHOOK_URL"}


def _load_env() -> dict:
    out = {}
    if not ENV_FILE.exists():
        return out
    for line in open(ENV_FILE, "r", encoding="utf-8"):
        line = line.split("#")[0].strip()
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        if v:
            out[k.strip()] = v
    return out


def _normalize_discord_webhook_url(url: str) -> str:
    """Discord เลิกใช้ discordapp.com — ใช้ discord.com แทนเพื่อหลีก 403"""
    if not url:
        return url
    return url.replace("https://discordapp.com/", "https://discord.com/", 1).strip()


def load_webhook_url(channel_key: str) -> str:
    """โหลดจาก .env ก่อน แล้วจาก webhooks.json (ไม่ log URL)"""
    env = _load_env()
    env_var = _ENV_MAP.get(channel_key) or "DISCORD_WEBHOOK_URL"
    url = env.get(env_var, "").strip()
    if url:
        return _normalize_discord_webhook_url(url)
    if WEBHOOKS_JSON.exists():
        try:
            data = json.load(open(WEBHOOKS_JSON, "r", encoding="utf-8"))
            u = (data.get(channel_key) or "").strip()
            return _normalize_discord_webhook_url(u) if u else ""
        except (json.JSONDecodeError, OSError):
            pass
    return ""


def send_to_discord(content: str, channel_key: str = NAVY_INTEL_CHANNEL_KEY) -> bool:
    """
    ส่งข้อความไป Discord ผ่าน Webhook.
    content: ข้อความเต็ม (รองรับ Discord markdown)
    channel_key: key ใน webhooks.json (default = navy_intel สำหรับ #🛰️-navy-intel)
    """
    url = load_webhook_url(channel_key)
    if not url:
        return False
    payload = json.dumps({"content": content}).encode("utf-8")
    headers = {"Content-Type": "application/json", "User-Agent": "DiscordBot (aqond-brain/1.0)"}
    req = Request(url, data=payload, headers=headers, method="POST")
    try:
        with urlopen(req, timeout=10) as resp:
            return 200 <= resp.getcode() < 300
    except (URLError, HTTPError, OSError):
        return False


def main():
    """รับข้อความจาก stdin หรือ argument แล้วส่งไป #🛰️-navy-intel"""
    if len(sys.argv) > 1:
        content = " ".join(sys.argv[1:])
    else:
        content = sys.stdin.read().strip()
    if not content:
        print("Usage: python report_to_discord.py <message>", file=sys.stderr)
        sys.exit(1)
    ok = send_to_discord(content)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
