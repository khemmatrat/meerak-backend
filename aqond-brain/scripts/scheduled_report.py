"""
รายงานตามเวลาที่กำหนด → ส่งสรุปไป Discord
เวลา: 06:00, 10:00, 18:00, 00:00 (6 โมงเช้า, 10 โมงเช้า, 6 โมงเย็น, เที่ยงคืน)
ใช้ webhook จาก aqond-brain/.env (DISCORD_WEBHOOK_URL หรือ DISCORD_WEBHOOK_PINKY)
รันด้วย Windows Task Scheduler / cron ตาม 4 ช่วงเวลานี้
"""

import json
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

AQOND_BRAIN = Path(__file__).resolve().parent.parent
PIPELINE_DIR = AQOND_BRAIN / "pipeline"
LOGS_DIR = AQOND_BRAIN / "logs"
ENV_FILE = AQOND_BRAIN / ".env"
CONFIG_DIR = AQOND_BRAIN / "config"
WEBHOOKS_JSON = CONFIG_DIR / "webhooks.json"

REPORT_TIMES = ("06:00", "10:00", "18:00", "00:00")  # 6am, 10am, 6pm, midnight


def _load_env():
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


def _normalize_discord_url(url: str) -> str:
    """Discord เลิกใช้ discordapp.com — ใช้ discord.com แทนเพื่อหลีก 403"""
    return (url or "").replace("https://discordapp.com/", "https://discord.com/", 1).strip()


def get_report_webhook_url() -> str:
    """ใช้ DISCORD_WEBHOOK_URL หรือ DISCORD_WEBHOOK_PINKY — ไม่ log URL"""
    env = _load_env()
    url = env.get("DISCORD_WEBHOOK_URL", "").strip() or env.get("DISCORD_WEBHOOK_PINKY", "").strip()
    if url:
        return _normalize_discord_url(url)
    if WEBHOOKS_JSON.exists():
        try:
            data = json.load(open(WEBHOOKS_JSON, "r", encoding="utf-8"))
            u = (data.get("report") or data.get("pinky_hq") or data.get("pinky") or "").strip()
            return _normalize_discord_url(u) if u else ""
        except (json.JSONDecodeError, OSError):
            pass
    return ""


def pipeline_summary() -> str:
    """สรุปสถานะ pipeline: แต่ละโฟลเดอร์มีไฟล์อะไรบ้าง"""
    lines = []
    dirs = [
        ("Navy", PIPELINE_DIR / "navy"),
        ("Minnie drafts", PIPELINE_DIR / "minnie_drafts"),
        ("Rocky", PIPELINE_DIR / "rocky"),
        ("Thomas", PIPELINE_DIR / "thomas"),
        ("Pinky review", PIPELINE_DIR / "pinky"),
        ("Ready to post", PIPELINE_DIR / "ready_to_post"),
    ]
    for label, d in dirs:
        if not d.exists():
            lines.append(f"- **{label}**: —")
            continue
        files = [f.name for f in d.iterdir() if f.is_file() and not f.name.startswith(".")]
        lines.append(f"- **{label}**: {len(files)} ไฟล์" + (f" ({', '.join(files[:5])}{'…' if len(files) > 5 else ''})" if files else ""))
    if (PIPELINE_DIR / "spy_report.json").exists():
        try:
            mtime = (PIPELINE_DIR / "spy_report.json").stat().st_mtime
            from datetime import datetime
            dt = datetime.fromtimestamp(mtime, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            lines.append(f"- **spy_report.json**: อัปเดตล่าสุด {dt}")
        except OSError:
            pass
    return "\n".join(lines)


def recent_log_lines(log_name: str, max_lines: int = 15) -> str:
    """ดึงบรรทัดล่าสุดจาก log file"""
    path = LOGS_DIR / log_name
    if not path.exists():
        return ""
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").strip().splitlines()
        return "\n".join(lines[-max_lines:]) if lines else ""
    except OSError:
        return ""


def build_report_body(slot_label: str) -> str:
    """สร้างข้อความรายงานสำหรับส่ง Discord"""
    now = datetime.now(timezone.utc)
    now_local = now.strftime("%Y-%m-%d %H:%M") + " UTC"
    body = [
        f"**📋 รายงานตามเวลา — {slot_label}**",
        f"เวลา: {now_local}",
        "",
        "**สถานะ Pipeline**",
        pipeline_summary(),
        "",
    ]
    log_preview = recent_log_lines("orchestrator.log", 8)
    if log_preview:
        body.append("**Orchestrator ล่าสุด**")
        body.append("```")
        body.append(log_preview[-500:])  # ไม่เกิน 500 ตัวอักษร
        body.append("```")
    return "\n".join(body)


def send_to_discord(content: str, url: str) -> bool:
    """ส่งข้อความไป Discord (ไม่ log URL)"""
    if not url or len(content) > 1900:
        content = content[:1900] + "…" if len(content) > 1900 else content
    payload = json.dumps({"content": content}).encode("utf-8")
    headers = {"Content-Type": "application/json", "User-Agent": "DiscordBot (aqond-brain/1.0)"}
    req = Request(url, data=payload, headers=headers, method="POST")
    try:
        with urlopen(req, timeout=10) as resp:
            return 200 <= resp.getcode() < 300
    except (URLError, HTTPError, OSError):
        return False


def main():
    import sys
    # ชื่อช่วงจากอาร์กิวเมนต์ หรือจากเวลาปัจจุบัน
    if len(sys.argv) > 1:
        slot_label = sys.argv[1]
    else:
        now = datetime.now(timezone.utc)
        h = now.hour
        if h < 6:
            slot_label = "เที่ยงคืน–06:00"
        elif h < 10:
            slot_label = "06:00–10:00"
        elif h < 18:
            slot_label = "10:00–18:00"
        else:
            slot_label = "18:00–เที่ยงคืน"

    url = get_report_webhook_url()
    if not url:
        print("ไม่พบ Webhook ใน .env (DISCORD_WEBHOOK_URL หรือ DISCORD_WEBHOOK_PINKY)", file=sys.stderr)
        sys.exit(1)
    body = build_report_body(slot_label)
    ok = send_to_discord(body, url)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
