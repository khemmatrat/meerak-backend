"""
โหลด Webhook URLs จาก aqond-brain/.env หรือ config/webhooks.json
ใช้ใน scripts ทั้งหมด — ไม่ log URL หรือ secret
"""

import json
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent
ENV_FILE = AQOND_BRAIN / ".env"
WEBHOOKS_JSON = AQOND_BRAIN / "config" / "webhooks.json"

# map key ที่สคริปต์ใช้ -> ชื่อตัวแปรใน .env
ENV_KEYS = {
    "pinky": "DISCORD_WEBHOOK_PINKY",
    "pinky_hq": "DISCORD_WEBHOOK_PINKY",
    "minnie": "DISCORD_WEBHOOK_MINNIE",
    "rocky": "DISCORD_WEBHOOK_ROCKY",
    "navy": "DISCORD_WEBHOOK_NAVY",
    "thomas": "DISCORD_WEBHOOK_THOMAS",
    "navy_intel": "DISCORD_WEBHOOK_NAVY",
    "report": "DISCORD_WEBHOOK_URL",
}


def _parse_env_line(line: str) -> tuple:
    """ได้ (key, value) จากบรรทัด KEY=VALUE (ตัด comment และ quote)."""
    line = line.split("#")[0].strip()
    if "=" not in line:
        return None, None
    k, v = line.split("=", 1)
    k = k.strip()
    v = v.strip().strip('"').strip("'")
    return k, v


def load_webhooks_from_env() -> dict:
    """โหลดจาก aqond-brain/.env (DISCORD_WEBHOOK_*) -> dict key เล็ก (pinky, minnie, ...)."""
    out = {}
    if not ENV_FILE.exists():
        return out
    env_vars = {}
    with open(ENV_FILE, "r", encoding="utf-8") as f:
        for line in f:
            k, v = _parse_env_line(line)
            if k and v:
                env_vars[k] = v
    for our_key, env_name in ENV_KEYS.items():
        url = env_vars.get(env_name, "").strip()
        if url:
            out[our_key] = url
    if env_vars.get("DISCORD_WEBHOOK_URL", "").strip() and "report" not in out:
        out["report"] = env_vars["DISCORD_WEBHOOK_URL"].strip()
    return out


def load_webhooks_from_json() -> dict:
    """โหลดจาก config/webhooks.json"""
    if not WEBHOOKS_JSON.exists():
        return {}
    try:
        with open(WEBHOOKS_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {k: str(v).strip() for k, v in data.items() if v}
    except (json.JSONDecodeError, OSError):
        return {}


def load_webhooks() -> dict:
    """โหลด webhooks — ลำดับ: .env ก่อน แล้วเติมจาก webhooks.json ถ้า key ยังไม่มี."""
    out = load_webhooks_from_env()
    json_data = load_webhooks_from_json()
    for k, v in json_data.items():
        if k not in out and v:
            out[k] = v
    return out


def get_report_webhook_url() -> str:
    """URL สำหรับส่งรายงานตามเวลา (ใช้ DISCORD_WEBHOOK_URL หรือ PINKY)."""
    w = load_webhooks()
    return w.get("report") or w.get("pinky_hq") or w.get("pinky") or ""
