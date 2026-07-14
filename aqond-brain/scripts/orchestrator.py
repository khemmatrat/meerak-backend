"""
Orchestrator — ผู้ควบคุมวง (AI Operations)
ตรวจโฟลเดอร์ pipeline/ ตลอดเวลา เมื่อมีไฟล์งานใหม่จากคนหนึ่ง
จะส่ง Notification ไปสะกิดพนักงานคนถัดไป
Workflow: Navy -> Minnie -> Rocky -> Thomas
Pinky ตรวจสอบความเรียบร้อยในทุกขั้นตอน
"""

import json
import os
import sys
import time
import logging
import random
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# --- Paths (ทำงานเฉพาะภายใน aqond-brain) ---
AQOND_BRAIN = Path(__file__).resolve().parent.parent
PIPELINE_DIR = AQOND_BRAIN / "pipeline"
CONFIG_DIR = AQOND_BRAIN / "config"
LOGS_DIR = AQOND_BRAIN / "logs"

# Workflow ลำดับ: คนส่งงาน -> คนถัดไป (Pinky ตรวจทุกขั้น)
WORKFLOW_NEXT = {
    "navy": "minnie",
    "minnie": "rocky",
    "rocky": "thomas",
    "thomas": None,  # จบวง หรือส่งกลับไป Navy ตามนโยบาย
}

# โฟลเดอร์ใน pipeline ตาม role (ใครส่งงานมาวางที่โฟลเดอร์ของตัวเอง)
PIPELINE_ROLES = ["navy", "minnie", "rocky", "thomas"]

# Navy 2.0: ไฟล์รายงานข่าวกรอง — เมื่ออัปเดตจะ trigger Pinky review + Minnie draft
SPY_REPORT_PATH = PIPELINE_DIR / "spy_report.json"
MINNIE_DRAFTS_DIR = PIPELINE_DIR / "minnie_drafts"
PINKY_REVIEW_DIR = PIPELINE_DIR / "pinky"
READY_TO_POST_DIR = PIPELINE_DIR / "ready_to_post"
ACCOUNTS_CONFIG = CONFIG_DIR / "accounts.json"
THOMAS_TASKS_DIR = PIPELINE_DIR / "thomas" / "tasks"

# Pinky = Main Listener: ทุก event ใน pipeline รายงานไป Pinky ก่อน (webhook key: pinky_hq)
PINKY_HQ_KEY = "pinky_hq"

# Minnie -> Rocky: ไฟล์ Video Brief (Prompt สำหรับ Grok) — ส่งเนื้อหาไป Discord ให้เจ้านายก๊อปไปวางใน Grok
ROCKY_RAW_ASSETS_DIR = PIPELINE_DIR / "rocky" / "raw_assets"
ROCKY_FINISHED_DIR = PIPELINE_DIR / "rocky" / "finished"
VIDEO_BRIEF_PREFIX = "video_brief_"

# ไฟล์ที่ไม่นับเป็น "งาน" — ข้ามไม่ส่ง notification
SKIP_FILE_NAMES = (".gitkeep", ".gitignore", ".DS_Store")


def setup_logging():
    """ตั้งค่า log ไว้ที่ aqond-brain/logs/"""
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_file = LOGS_DIR / "orchestrator.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )
    return logging.getLogger("orchestrator")


def ensure_pipeline_folders():
    """สร้างโฟลเดอร์ใน pipeline ตาม role ถ้ายังไม่มี"""
    for role in PIPELINE_ROLES:
        (PIPELINE_DIR / role).mkdir(parents=True, exist_ok=True)
    MINNIE_DRAFTS_DIR.mkdir(parents=True, exist_ok=True)
    PINKY_REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    READY_TO_POST_DIR.mkdir(parents=True, exist_ok=True)
    THOMAS_TASKS_DIR.mkdir(parents=True, exist_ok=True)
    ROCKY_RAW_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    ROCKY_FINISHED_DIR.mkdir(parents=True, exist_ok=True)
    (AQOND_BRAIN / "output" / "final_videos").mkdir(parents=True, exist_ok=True)
    (AQOND_BRAIN / "output" / "dashboard").mkdir(parents=True, exist_ok=True)


def load_accounts(logger) -> list:
    """อ่าน config/accounts.json เพื่อใช้สร้าง post_task แยกบัญชี"""
    if not ACCOUNTS_CONFIG.exists():
        logger.warning(f"ไม่พบ {ACCOUNTS_CONFIG} — จะไม่สร้าง post_task แยกบัญชี")
        return []
    try:
        data = json.load(open(ACCOUNTS_CONFIG, "r", encoding="utf-8"))
        accounts = data.get("accounts") or []
        if not isinstance(accounts, list):
            return []
        return accounts
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"โหลด accounts.json ไม่ได้: {e}")
        return []


def _random_spint_instruction(account_index: int) -> str:
    """คำแนะนำให้ฝั่ง Minnie/Backend ปรับแคปชั่นเล็กน้อยต่อบัญชี (ไม่ใช่ anti-detection)"""
    # หมุนคำขึ้นต้น/อีโมจิเล็กน้อย เพื่อให้ไม่ใช้ข้อความเดียวแบบเป๊ะ 10 บัญชี
    prefixes = ["วันนี้มา", "ล่าสุดนี้", "ขออัปเดต", "ลองดู", "ทำแบบนี้เลย", "สรุปให้", "มาแชร์", "ลองแล้วบอก", "อัปเดตด่วน", "จังหวะนี้"]
    emojis = ["🔥", "✨", "📌", "🚀", "🎯", "💡", "🧠", "📣", "✅", "🆕"]
    p = prefixes[account_index % len(prefixes)]
    e = emojis[account_index % len(emojis)]
    return f"{p} {e} โปรดปรับแคปชั่นให้ 'ต่างเล็กน้อย' จากบัญชีอื่น (เปลี่ยนคำขึ้นต้น/อีโมจิ/โครงประโยค) แต่คงธีมเดียวกัน"


def create_thomas_post_tasks_for_ready(file_path: Path, accounts: list, logger) -> None:
    """
    เมื่อมี content ที่ผ่าน Pinky แล้วใน pipeline/ready_to_post/
    สร้าง post_task_*.json แยกบัญชีลง pipeline/thomas/tasks/

    Backend/Thomas publisher จะไปรับไฟล์นี้เพื่อโพสต์ตาม scheduled_at และส่ง report กลับมาที่ pipeline/thomas/reports/
    """
    if not accounts:
        return

    try:
        payload = json.loads(file_path.read_text(encoding="utf-8"))
    except Exception:
        # ถ้าไฟล์ไม่ใช่ json ให้ส่งเป็น content_ref ตามชื่อไฟล์
        payload = {"content_ref": file_path.as_posix(), "source_file": file_path.name}

    base_ts = datetime.now(timezone.utc)
    # Random Delay: อย่างน้อย 15-30 นาที/หนึ่งบัญชี เพื่อไม่ให้โพสต์ใกล้กันเกินไป
    # (ตั้งโครงเป็นคิวเวลา ไม่ได้เกี่ยวกับ anti-detection)
    offsets_minutes_sorted = []
    current = random.randint(15, 30)
    for _ in accounts:
        offsets_minutes_sorted.append(current)
        # เพิ่มห่างแบบสุ่มอีกก้อน (อย่างน้อย 15 นาที)
        current += random.randint(15, 30)

    created = 0
    for idx, acc in enumerate(accounts):
        account_id = str(acc.get("account_id") or f"account_{idx+1}")
        scheduled_at = base_ts.timestamp() + offsets_minutes_sorted[idx] * 60
        scheduled_at_iso = datetime.fromtimestamp(scheduled_at, tz=timezone.utc).isoformat()

        task = {
            "trigger_file": file_path.name,
            "account_id": account_id,
            "platform": (acc.get("platform") or payload.get("platform") or "unknown"),
            "scheduled_at": scheduled_at_iso,
            "content_ref": payload.get("content_ref") or payload.get("content_ref_from_pinky") or None,
            "spin_instruction": _random_spint_instruction(idx),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        out_path = THOMAS_TASKS_DIR / f"post_task_{file_path.stem}_{account_id}_{ts}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(task, f, ensure_ascii=False, indent=2)
        created += 1

    logger.info(f"สร้าง Thomas post_task สำหรับ {created} บัญชีจากไฟล์ {file_path.name}")


def _normalize_discord_url(url: str) -> str:
    """Discord เลิกใช้ discordapp.com — ใช้ discord.com แทนเพื่อหลีก 403"""
    if not url:
        return url
    return url.replace("https://discordapp.com/", "https://discord.com/", 1).strip()


def _load_env_webhooks():
    """โหลดจาก aqond-brain/.env (DISCORD_WEBHOOK_*) — ไม่ log URL"""
    env_path = AQOND_BRAIN / ".env"
    if not env_path.exists():
        return {}
    out = {}
    for line in open(env_path, "r", encoding="utf-8"):
        line = line.split("#")[0].strip()
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = _normalize_discord_url(v.strip().strip('"').strip("'"))
        if not v:
            continue
        k = k.strip()
        if k == "DISCORD_WEBHOOK_PINKY":
            out["pinky"] = out["pinky_hq"] = v
        elif k == "DISCORD_WEBHOOK_MINNIE":
            out["minnie"] = v
        elif k == "DISCORD_WEBHOOK_ROCKY":
            out["rocky"] = v
        elif k == "DISCORD_WEBHOOK_NAVY":
            out["navy"] = out["navy_intel"] = v
        elif k == "DISCORD_WEBHOOK_THOMAS":
            out["thomas"] = v
        elif k == "DISCORD_WEBHOOK_URL":
            out["report"] = v
    return out


def load_webhooks():
    """โหลด Webhook จาก .env ก่อน แล้วเติมจาก config/webhooks.json"""
    out = _load_env_webhooks()
    config_path = CONFIG_DIR / "webhooks.json"
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            for k, v in data.items():
                if k not in out and isinstance(v, str) and v.strip():
                    out[k] = v.strip()
        except (json.JSONDecodeError, OSError):
            pass
    return out


def pinky_verify(role: str, file_path: Path, logger) -> bool:
    """
    Pinky ตรวจสอบความเรียบร้อยก่อนส่งต่อ.
    คืน True = ผ่าน, False = ไม่ผ่าน (ยังส่ง notification ได้แต่ log ไว้)
    """
    try:
        if not file_path.is_file():
            logger.warning(f"[Pinky] ไม่พบไฟล์: {file_path}")
            return False
        # ตรวจว่าไฟล์อ่านได้และไม่ว่าง (ถ้าเป็น JSON อาจเช็ก schema ได้ต่อ)
        if file_path.stat().st_size == 0:
            logger.warning(f"[Pinky] ไฟล์ว่าง: {file_path}")
            return False
        logger.info(f"[Pinky] ตรวจผ่าน: {role} -> {file_path.name}")
        return True
    except Exception as e:
        logger.exception(f"[Pinky] ตรวจไม่ผ่าน: {e}")
        return False


def notify_pinky_first(event_type: str, detail: str, webhooks: dict, logger) -> None:
    """Pinky เป็น Main Listener — รายงานทุก event ใน pipeline ไป #👑-pinky-hq ก่อน (ไม่ log URL/keys)."""
    msg = f"📋 [Pipeline Event] **{event_type}** — {detail}"
    url = webhooks.get(PINKY_HQ_KEY, "").strip()
    if not url:
        logger.info("[Pinky HQ] ไม่มี webhook pinky_hq — ข้ามรายงาน event")
        return
    payload = json.dumps({"content": msg}).encode("utf-8")
    headers = {"Content-Type": "application/json", "User-Agent": "DiscordBot (aqond-brain/1.0)"}
    req = Request(url, data=payload, headers=headers, method="POST")
    try:
        with urlopen(req, timeout=10) as resp:
            if 200 <= resp.getcode() < 300:
                logger.info("[Pinky HQ] รายงาน event แล้ว")
    except HTTPError as e:
        if e.code == 403:
            logger.error("[Pinky HQ] 403 Forbidden — ตรวจสอบ DISCORD_WEBHOOK_PINKY ใน .env")
        else:
            logger.info("[Pinky HQ] ส่งรายงาน event ไม่สำเร็จ")
    except (URLError, OSError):
        logger.info("[Pinky HQ] ส่งรายงาน event ไม่สำเร็จ")


def send_notification(role: str, message: str, webhooks: dict, logger) -> bool:
    """ส่ง Notification ไปยัง role ที่กำหนด (ใช้ webhook ใน config). ไม่ log URL."""
    url = webhooks.get(role)
    if not url or not url.strip():
        logger.info(f"[Notification] ไม่มี webhook สำหรับ {role} — ข้ามส่ง (ข้อความ: {message[:80]}...)")
        return False
    payload = json.dumps({"content": message}).encode("utf-8")
    headers = {"Content-Type": "application/json", "User-Agent": "DiscordBot (aqond-brain/1.0)"}
    req = Request(url, data=payload, headers=headers, method="POST")
    try:
        with urlopen(req, timeout=10) as resp:
            if 200 <= resp.getcode() < 300:
                logger.info(f"[Notification] ส่งถึง {role} สำเร็จ")
                return True
            logger.warning(f"[Notification] ส่งถึง {role} ได้ code {resp.getcode()}")
            return False
    except (URLError, HTTPError, OSError) as e:
        if isinstance(e, HTTPError) and e.code == 403:
            logger.error(f"[Notification] ส่งถึง {role} ล้มเหลว: 403 Forbidden — ตรวจสอบ Webhook URL ใน .env (อาจหมดอายุหรือผิด channel)")
        else:
            logger.error(f"[Notification] ส่งถึง {role} ล้มเหลว: {e}")
        return False


def build_nudge_message(from_role: str, next_role: str, file_name: str) -> str:
    """สร้างข้อความสะกิดคนถัดไป"""
    return (
        f"🔔 [Orchestrator] มีงานใหม่จาก **{from_role.upper()}** "
        f"(ไฟล์: {file_name}) — ถึงคิว **{next_role.upper()}** แล้วครับ"
    )


def _rocky_send_discord_prompt_enabled(logger) -> bool:
    """ค่าเริ่มต้น: ปิด — ไม่ส่ง prompt ยาวไป Discord (ใช้ Rocky Studio + dashboard แทน)"""
    if os.environ.get("ROCKY_SEND_DISCORD_PROMPT", "").strip().lower() in ("1", "true", "yes"):
        return True
    env_path = AQOND_BRAIN / ".env"
    if env_path.exists():
        for line in open(env_path, "r", encoding="utf-8"):
            line = line.split("#")[0].strip()
            if line.startswith("ROCKY_SEND_DISCORD_PROMPT="):
                v = line.split("=", 1)[1].strip().strip('"').strip("'").lower()
                return v in ("1", "true", "yes")
    return False


def send_grok_prompt_to_discord(file_path: Path, webhooks: dict, logger) -> None:
    """Minnie -> Rocky: ส่ง Video Brief (Prompt สำหรับ Grok) ไป Discord — เจ้านายก๊อปไปวางใน Grok ได้เลย"""
    try:
        raw = file_path.read_text(encoding="utf-8", errors="replace").strip()
        if not raw:
            return
        if len(raw) > 1800:
            raw = raw[:1800] + "\n… (ตัดให้พอดีข้อความ Discord)"
        msg = (
            "**🎬 Prompt สำหรับ Grok — มินนี่เขียนไว้ เจ้านายก๊อปไปวางใน Grok ได้เลย**\n"
            "ดาวน์โหลดวิดีโอมาแล้วโยนไฟล์ใส่ `pipeline/rocky/raw_assets` ครับ\n\n"
            "```\n" + raw + "\n```"
        )
        url = webhooks.get(PINKY_HQ_KEY) or webhooks.get("report")
        if not url or not url.strip():
            logger.info("[Grok Prompt] ไม่มี webhook — ข้ามส่ง")
            return
        payload = json.dumps({"content": msg}).encode("utf-8")
        headers = {"Content-Type": "application/json", "User-Agent": "DiscordBot (aqond-brain/1.0)"}
        req = Request(url, data=payload, headers=headers, method="POST")
        with urlopen(req, timeout=10) as resp:
            if 200 <= resp.getcode() < 300:
                logger.info("[Grok Prompt] ส่งไป Discord แล้ว")
    except HTTPError as e:
        if e.code == 403:
            logger.warning("[Grok Prompt] 403 Forbidden — ตรวจสอบ Webhook (pinky_hq/report) ใน .env")
        else:
            logger.warning(f"[Grok Prompt] ส่งไม่สำเร็จ: {e}")
    except Exception as e:
        logger.warning(f"[Grok Prompt] ส่งไม่สำเร็จ: {e}")


def process_new_file(role: str, file_path: Path, webhooks: dict, logger):
    """เมื่อพบไฟล์ใหม่จาก role: ให้ Pinky ตรวจ แล้วส่งการแจ้งเตือนไปคนถัดไป"""
    next_role = WORKFLOW_NEXT.get(role)

    if role == "rocky" and file_path.name.startswith(VIDEO_BRIEF_PREFIX):
        if _rocky_send_discord_prompt_enabled(logger):
            send_grok_prompt_to_discord(file_path, webhooks, logger)
        else:
            logger.info(
                "[Rocky Studio] ข้ามส่ง prompt ไป Discord — จะเจน .mp4 หลัง Pinky ผ่าน (ดู output/final_videos + dashboard)"
            )

    ok = pinky_verify(role, file_path, logger)
    if not ok:
        logger.warning(f"Pinky ตรวจไม่ผ่านสำหรับ {file_path} แต่จะดำเนินการต่อ")

    if ok and role == "rocky" and file_path.name.startswith(VIDEO_BRIEF_PREFIX):
        try:
            scripts_dir = Path(__file__).resolve().parent
            if str(scripts_dir) not in sys.path:
                sys.path.insert(0, str(scripts_dir))
            from rocky_studio_render import render_video_from_brief

            out = render_video_from_brief(file_path, logger)
            if out:
                logger.info(
                    "[Rocky Studio] เปิดดูวิดีโอ: python scripts/serve_video_dashboard.py แล้วเข้า http://127.0.0.1:8765/dashboard/"
                )
        except Exception as e:
            logger.exception("[Rocky Studio] เจนวิดีโอไม่สำเร็จ: %s", e)

    if next_role is None:
        logger.info(f"[Workflow] งานจาก {role} ครบวงแล้ว (จบที่ Thomas)")
        return

    message = build_nudge_message(role, next_role, file_path.name)
    send_notification(next_role, message, webhooks, logger)


def get_seen_key(role: str, path: Path) -> str:
    """สร้าง key สำหรับจำว่าไฟล์นี้ประมวลผลแล้ว (path + mtime)."""
    try:
        mtime = path.stat().st_mtime
        return f"{role}:{path.name}:{mtime}"
    except OSError:
        return f"{role}:{path.name}:0"


def on_spy_report_updated(webhooks: dict, logger) -> None:
    """
    เมื่อ spy_report.json ถูกอัปเดต (โดย Navy 2.0):
    - สร้าง task ให้ Pinky ตรวจสอบความเรียบร้อย
    - สร้าง task ให้ Minnie เขียน Competitive Response Content ใน pipeline/minnie_drafts/
    - ส่ง Notification ไป Pinky และ Minnie
    """
    ensure_pipeline_folders()
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    # Task สำหรับ Pinky: ตรวจรายงานข่าวกรอง
    pinky_task = {
        "trigger": "spy_report_updated",
        "source_file": "pipeline/spy_report.json",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "action": "review_spy_report",
        "message": "Navy 2.0 อัปเดตรายงานข่าวกรองแล้ว — โปรดตรวจสอบความเรียบร้อยและลำดับความสำคัญ",
    }
    pinky_path = PINKY_REVIEW_DIR / f"review_spy_report_{ts}.json"
    with open(pinky_path, "w", encoding="utf-8") as f:
        json.dump(pinky_task, f, ensure_ascii=False, indent=2)
    logger.info(f"สร้าง Pinky review task: {pinky_path.name}")

    # Task สำหรับ Minnie: เขียน Competitive Response Content
    minnie_task = {
        "trigger": "spy_report_updated",
        "source_file": "pipeline/spy_report.json",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "action": "draft_competitive_response",
        "output_folder": "pipeline/minnie_drafts",
        "message": "กรุณาเขียน Competitive Response Content ตามข้อมูลใน spy_report.json",
    }
    minnie_path = MINNIE_DRAFTS_DIR / f"competitive_response_{ts}.json"
    with open(minnie_path, "w", encoding="utf-8") as f:
        json.dump(minnie_task, f, ensure_ascii=False, indent=2)
    logger.info(f"สร้าง Minnie draft task: {minnie_path.name}")

    # ส่งการแจ้งเตือน
    msg_pinky = "🔔 [Orchestrator] Navy 2.0 อัปเดต spy_report แล้ว — **Pinky** โปรดตรวจสอบความเรียบร้อยครับ"
    msg_minnie = "🔔 [Orchestrator] มี task Competitive Response Content ใหม่ใน pipeline/minnie_drafts/ — **Minnie** ถึงคิวเขียนครับ"
    send_notification("pinky", msg_pinky, webhooks, logger)
    send_notification("minnie", msg_minnie, webhooks, logger)


def watch_pipeline(webhooks: dict, logger, interval_seconds: float = 5.0):
    """วนเช็กโฟลเดอร์ pipeline/ ตลอดเวลา เมื่อมีไฟล์ใหม่จาก role ใด ๆ ให้ส่งการแจ้งเตือนคนถัดไป.
    รวมถึงเช็ก spy_report.json (Navy 2.0) — เมื่ออัปเดตจะ trigger Pinky + Minnie."""
    seen = set()
    last_spy_mtime = None
    last_ready_mtime = None
    ensure_pipeline_folders()
    accounts = load_accounts(logger)

    logger.info("Orchestrator เริ่มทำงาน — Workflow: Navy -> Minnie -> Rocky -> Thomas (Pinky ตรวจทุกขั้น)")
    logger.info("รวมถึงตรวจ spy_report.json — เมื่ออัปเดตจะ trigger Pinky review + Minnie draft")
    logger.info(f"เช็ก pipeline ทุก {interval_seconds} วินาที")

    while True:
        try:
            # Navy 2.0: ตรวจ spy_report.json — ครั้งแรกที่เห็นหรือเมื่ออัปเดต ให้ trigger Pinky + Minnie
            if SPY_REPORT_PATH.exists():
                try:
                    mtime = SPY_REPORT_PATH.stat().st_mtime
                    if last_spy_mtime is None or mtime != last_spy_mtime:
                        logger.info("ตรวจพบ spy_report.json (ใหม่หรืออัปเดต) — trigger Pinky + Minnie")
                        notify_pinky_first("spy_report_updated", "Navy อัปเดต spy_report.json", webhooks, logger)
                        on_spy_report_updated(webhooks, logger)
                    last_spy_mtime = mtime
                except OSError:
                    pass
            else:
                last_spy_mtime = None

            for role in PIPELINE_ROLES:
                role_dir = PIPELINE_DIR / role
                if not role_dir.is_dir():
                    continue
                for path in role_dir.iterdir():
                    if not path.is_file():
                        continue
                    if path.name.startswith(".") or path.name in SKIP_FILE_NAMES:
                        continue
                    key = get_seen_key(role, path)
                    if key in seen:
                        continue
                    seen.add(key)
                    logger.info(f"พบไฟล์ใหม่จาก {role}: {path.name}")
                    notify_pinky_first("new_file", f"{role}: {path.name}", webhooks, logger)
                    process_new_file(role, path, webhooks, logger)

            # ready_to_post -> สร้าง post_task แยกบัญชี (Thomas publisher จะไปรับ)
            if READY_TO_POST_DIR.exists():
                for path in sorted(READY_TO_POST_DIR.iterdir()):
                    if not path.is_file() or path.name.startswith("."):
                        continue
                    # ใช้ key ตาม mtime เพื่อไม่สร้างซ้ำ
                    try:
                        key = f"ready_to_post:{path.name}:{path.stat().st_mtime}"
                    except OSError:
                        continue
                    if key in seen:
                        continue
                    seen.add(key)
                    create_thomas_post_tasks_for_ready(path, accounts, logger)

            time.sleep(interval_seconds)
        except KeyboardInterrupt:
            logger.info("Orchestrator หยุดโดยผู้ใช้")
            break
        except Exception as e:
            logger.exception(f"เกิดข้อผิดพลาดในรอบเช็ก: {e}")
            time.sleep(interval_seconds)


def main():
    logger = setup_logging()
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    PIPELINE_DIR.mkdir(parents=True, exist_ok=True)

    webhooks = load_webhooks()
    if not webhooks:
        logger.warning("ไม่พบ config/webhooks.json — จะ log การแจ้งเตือนอย่างเดียว (ไม่ส่ง webhook จริง)")

    watch_pipeline(webhooks, logger)


if __name__ == "__main__":
    main()
