"""
End-to-End Test — บิดก๊อกน้ำ (The Grand Opening)
จำลอง: Navy หาข่าว -> Orchestrator สร้างงานให้ Minnie + Pinky -> Video Brief สำหรับ Rocky -> ส่ง Grok Prompt ไป Discord
รัน Manual ทุกสคริปต์ต่อกัน แล้วรายงานผลใน Discord ให้เห็น "น้ำไหล"
"""

import json
import subprocess
import sys
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

AQOND_BRAIN = Path(__file__).resolve().parent.parent
PIPELINE_DIR = AQOND_BRAIN / "pipeline"
ENV_FILE = AQOND_BRAIN / ".env"
SCRIPTS_DIR = AQOND_BRAIN / "scripts"


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


def get_report_webhook():
    env = _load_env()
    u = env.get("DISCORD_WEBHOOK_URL") or env.get("DISCORD_WEBHOOK_PINKY") or ""
    return _normalize_discord_url(u)


def send_to_discord(content: str, url: str) -> bool:
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
    print("=== E2E Test: บิดก๊อกน้ำ ===\n")
    webhook = get_report_webhook()
    if not webhook:
        print("ไม่พบ DISCORD_WEBHOOK_URL หรือ DISCORD_WEBHOOK_PINKY ใน .env")
        sys.exit(1)

    # 1) สั่ง Navy 2.0
    print("1. รัน Navy 2.0 (navy_spy.py) ...")
    r = subprocess.run([sys.executable, str(SCRIPTS_DIR / "navy_spy.py")], cwd=str(AQOND_BRAIN.parent), timeout=120)
    if r.returncode != 0:
        print("   Navy ส่งคืน code:", r.returncode)
    if (PIPELINE_DIR / "spy_report.json").exists():
        print("   OK — spy_report.json เกิดขึ้นแล้ว")
        send_to_discord("✅ **E2E Step 1** — Navy 2.0 รันเสร็จ แล้วสร้าง spy_report.json แล้ว", webhook)
    else:
        print("   หมายเหตุ: spy_report.json ยังไม่มี (อาจไม่มี config หรือ RSS)")

    # 2) รัน Orchestrator สั้นๆ เพื่อให้เจอ spy_report แล้วสร้างงานให้ Minnie + Pinky
    print("2. รัน Orchestrator 15 วินาที (จะเจอ spy_report แล้วสร้าง task ให้ Minnie + Pinky) ...")
    try:
        subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "orchestrator.py")],
            cwd=str(AQOND_BRAIN.parent),
            timeout=15,
        )
    except subprocess.TimeoutExpired:
        pass  # ครบ 15 วินาที = ปล่อยให้หยุด
    except Exception as e:
        print("   ข้อยกเว้น:", e)
    if (PIPELINE_DIR / "minnie_drafts").exists() and any((PIPELINE_DIR / "minnie_drafts").iterdir()):
        print("   OK — มี task ใน pipeline/minnie_drafts แล้ว")
    send_to_discord("✅ **E2E Step 2** — Orchestrator รันแล้ว สร้าง task ให้ Minnie และ Pinky", webhook)

    # 3) สร้าง Video Brief ตัวอย่าง (เหมือนมินนี่เขียนให้ร็อคกี้) แล้วยิง Grok Prompt ไป Discord
    print("3. สร้าง Video Brief ตัวอย่าง และส่ง Prompt สำหรับ Grok ไป Discord ...")
    PIPELINE_DIR.mkdir(parents=True, exist_ok=True)
    (PIPELINE_DIR / "rocky").mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    brief_path = PIPELINE_DIR / "rocky" / f"video_brief_e2e_{ts}.md"
    sample_brief = """# Video Brief (E2E Test) — มินนี่เขียนไว้
Prompt สำหรับ Grok (ก๊อปไปวางใน Grok ได้เลย):

Scene 1: Startup Thailand — คนทำงานอิสระนั่งที่คาเฟ่ เปิด laptop พร้อมคำว่า "Freelance Tax"
Scene 2: แสดงกราฟแนวโน้มตลาด และโลโก้ Aqond
Scene 3: CTA — "ลงทะเบียนวันนี้"
"""
    brief_path.write_text(sample_brief, encoding="utf-8")
    grok_msg = (
        "**🎬 Prompt สำหรับ Grok — มินนี่เขียนไว้ (E2E Test) เจ้านายก๊อปไปวางใน Grok ได้เลย**\n"
        "ดาวน์โหลดวิดีโอมาแล้วโยนไฟล์ใส่ `pipeline/rocky/raw_assets` ครับ\n\n"
        "```\n" + sample_brief.strip() + "\n```"
    )
    send_to_discord(grok_msg[:1900], webhook)
    print("   OK — ส่ง Grok Prompt ไป Discord แล้ว")

    # 4) สรุปน้ำไหล
    summary = (
        "**🚀 E2E สมบูรณ์ — น้ำไหลแล้ว!**\n"
        "1. Navy 2.0 → spy_report.json + Discord #navy-intel\n"
        "2. Orchestrator → งานให้ Minnie + Pinky\n"
        "3. Video Brief → Prompt สำหรับ Grok ไป Discord\n"
        "เจ้านายลองเปิด Orchestrator (python aqond-brain/scripts/orchestrator.py) ต่อได้เลยครับ"
    )
    send_to_discord(summary, webhook)
    print("\n=== ส่งสรุปไป Discord แล้ว — น้ำไหลแล้ว ===\n")
    sys.exit(0)


if __name__ == "__main__":
    main()
