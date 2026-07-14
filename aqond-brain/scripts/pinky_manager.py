"""
Pinky — The Autonomous AI Project Manager (Control Logic)
ตรวจผลจาก Navy, Minnie, Rocky — ตัดสินใจลำดับความสำคัญ และจัดการ deployment ของ content/code
รายงานตรงไป #👑-pinky-hq | ไม่ log API keys หรือ secrets
"""

import json
import re
import shutil
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Tuple, Optional
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# Paths ภายใน aqond-brain เท่านั้น
AQOND_BRAIN = Path(__file__).resolve().parent.parent
PIPELINE_DIR = AQOND_BRAIN / "pipeline"
CONFIG_DIR = AQOND_BRAIN / "config"
LOGS_DIR = AQOND_BRAIN / "logs"

SPY_REPORT_PATH = PIPELINE_DIR / "spy_report.json"
CONTENT_DRAFTS_DIR = PIPELINE_DIR / "minnie_drafts"
READY_TO_POST_DIR = PIPELINE_DIR / "ready_to_post"
PINKY_REVIEW_DIR = PIPELINE_DIR / "pinky"
PENDING_APPROVAL_DIR = PIPELINE_DIR / "pending_approval"
THOMAS_REPORTS_DIR = PIPELINE_DIR / "thomas" / "reports"
PINKY_STRATEGY_DIR = PIPELINE_DIR / "pinky" / "strategy"

# Discord: #👑-pinky-hq (key ใน webhooks.json)
PINKY_HQ_CHANNEL_KEY = "pinky_hq"

# ไม่ log ค่าที่อาจเป็น secret (ใช้แค่ key name)
def _safe_log_config(webhooks: dict) -> str:
    return ", ".join(k for k in webhooks.keys() if webhooks.get(k))


def setup_logging():
    """Log ไว้ที่ aqond-brain/logs/ — ไม่บันทึก config values ที่เป็น URL/secret"""
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_file = LOGS_DIR / "pinky_manager.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )
    return logging.getLogger("pinky_manager")


def _normalize_discord_url(url: str) -> str:
    """Discord เลิกใช้ discordapp.com — ใช้ discord.com แทนเพื่อหลีก 403"""
    return (url or "").replace("https://discordapp.com/", "https://discord.com/", 1).strip()


def _load_env_webhooks() -> dict:
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
            out["navy"] = v
        elif k == "DISCORD_WEBHOOK_THOMAS":
            out["thomas"] = v
    return out


def load_webhooks_safe(logger) -> dict:
    """โหลด webhooks จาก .env ก่อน แล้วเติมจาก config/webhooks.json — ไม่ log URL"""
    out = _load_env_webhooks()
    path = CONFIG_DIR / "webhooks.json"
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            for k, v in data.items():
                if k not in out and isinstance(v, str) and v.strip():
                    out[k] = v.strip()
        except (json.JSONDecodeError, OSError):
            pass
    return out


def send_to_pinky_hq(content: str, logger) -> bool:
    """ส่งข้อความไป #👑-pinky-hq — ไม่ log URL หรือ API key"""
    try:
        from report_to_discord import send_to_discord
    except ImportError:
        logger.warning("report_to_discord ไม่พบ — ข้ามส่ง Discord")
        return False
    ok = send_to_discord(content, PINKY_HQ_CHANNEL_KEY)
    if ok:
        logger.info("ส่งไป Pinky HQ แล้ว (channel key: pinky_hq)")
    else:
        logger.info("ส่ง Pinky HQ ไม่สำเร็จ — ตรวจสอบ webhooks.json key: pinky_hq")
    return ok


def _post_webhook(webhooks: dict, key: str, message: str, logger) -> bool:
    """POST ไป webhook โดยไม่ log URL."""
    url = webhooks.get(key, "").strip()
    if not url:
        logger.info(f"[Notification] ไม่มี webhook สำหรับ {key}")
        return False
    payload = json.dumps({"content": message}).encode("utf-8")
    headers = {"Content-Type": "application/json", "User-Agent": "DiscordBot (aqond-brain/1.0)"}
    req = Request(url, data=payload, headers=headers, method="POST")
    try:
        with urlopen(req, timeout=10) as resp:
            if 200 <= resp.getcode() < 300:
                logger.info(f"[Notification] ส่งถึง {key} สำเร็จ")
                return True
            return False
    except (URLError, HTTPError, OSError):
        logger.info(f"[Notification] ส่งถึง {key} ล้มเหลว (ไม่ log รายละเอียด)")
        return False


def load_spy_report(logger):
    """โหลด spy_report.json (จาก Navy)."""
    if not SPY_REPORT_PATH.exists():
        return None
    try:
        with open(SPY_REPORT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"โหลด spy_report ไม่ได้: {e}")
        return None


def load_brand_guidelines(logger) -> dict:
    """โหลด Brand Guidelines จาก config (ไม่โหลดค่าที่เป็นความลับ)."""
    for name in ("pinky_guidelines.json", "pinky_guidelines.example.json"):
        path = CONFIG_DIR / name
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, OSError):
                pass
    return {
        "tone_of_voice": ["professional", "respectful"],
        "legal_compliance": ["no_false_claims"],
        "score_weights": {"tone": 30, "legal": 40, "alignment_with_navy_intel": 30},
        "approval_threshold_percent": 90,
        "high_risk_actions": ["store_deployment", "production_release"],
    }


def check_alignment_with_navy(content_text: str, spy: dict, logger) -> Tuple[bool, list]:
    """
    ตรวจว่า content สอดคล้องกับ Navy intelligence หรือไม่.
    คืน (aligned, list of issues).
    """
    issues = []
    trends = spy.get("market_trends") or []
    competitors = spy.get("competitor_analysis") or []
    keywords_from_intel = set()
    for t in trends:
        for w in re.findall(r"\w+", t):
            if len(w) > 2:
                keywords_from_intel.add(w.lower())
    for c in competitors:
        name = (c.get("name") or "").lower()
        if name:
            keywords_from_intel.add(name)
        for ch in (c.get("detected_changes") or []):
            for w in re.findall(r"\w+", str(ch)):
                if len(w) > 2:
                    keywords_from_intel.add(w.lower())
    content_lower = content_text.lower()
    if keywords_from_intel and not any(k in content_lower for k in list(keywords_from_intel)[:20]):
        issues.append("content_does_not_reference_market_intel")
    if not content_text.strip():
        issues.append("content_empty")
    aligned = len(issues) == 0
    return aligned, issues


def score_quality(
    content_text: str,
    spy: Optional[dict],
    guidelines: dict,
    logger,
    relax_navy_score: bool = False,
) -> Tuple[float, dict]:
    """
    ให้คะแนนตาม Brand Guidelines: tone, legal, alignment.
    relax_navy_score=True สำหรับ user_draft จาก !draft — ไม่หักคะแนน alignment กับ Navy
    """
    weights = guidelines.get("score_weights") or {}
    w_tone = weights.get("tone", 30)
    w_legal = weights.get("legal", 40)
    w_align = weights.get("alignment_with_navy_intel", 30)
    breakdown = {"tone": 0.0, "legal": 0.0, "alignment_with_navy_intel": 0.0}

    # Tone: ง่ายๆ เช็กคำที่ไม่เหมาะสมหรือ slang
    tone_rules = guidelines.get("tone_of_voice") or []
    tone_score = 100.0
    if "no_slang" in tone_rules:
        if re.search(r"\b(แม่ง|เหี้ย|ฉิบ|ฯลฯ)\b", content_text, re.I):
            tone_score -= 40
    if "respectful" in tone_rules:
        if re.search(r"\b(เกลียด|ด่า|ประจาน)\b", content_text, re.I):
            tone_score -= 30
    breakdown["tone"] = max(0, min(100, tone_score))

    # Legal
    legal_rules = guidelines.get("legal_compliance") or []
    legal_score = 100.0
    if "no_false_claims" in legal_rules:
        if re.search(r"\b(รับรองผลร้อยเปอร์เซ็นต์|ดีที่สุดในโลก)\b", content_text, re.I):
            legal_score -= 50
    breakdown["legal"] = max(0, min(100, legal_score))

    # Alignment with Navy
    if relax_navy_score:
        breakdown["alignment_with_navy_intel"] = 100.0
    elif spy:
        aligned, _ = check_alignment_with_navy(content_text, spy, logger)
        breakdown["alignment_with_navy_intel"] = 100.0 if aligned else 50.0
    else:
        breakdown["alignment_with_navy_intel"] = 80.0  # ไม่มี intel ก็ไม่หัก

    total = (breakdown["tone"] * w_tone + breakdown["legal"] * w_legal + breakdown["alignment_with_navy_intel"] * w_align) / (w_tone + w_legal + w_align)
    return round(total, 1), breakdown


def review_pipeline(webhooks: dict, logger) -> None:
    """
    ตรวจ pipeline: spy_report + content_drafts (Minnie).
    Conflict resolution: ถ้า content ไม่สอดคล้อง Navy -> flag และส่งกลับให้แก้
    Quality gate: คะแนนจาก Brand Guidelines.
    > 90% -> ย้ายไป ready_to_post/ สำหรับ Thomas
    < 90% -> แจ้ง agent ที่เกี่ยวข้องให้แก้
    """
    READY_TO_POST_DIR.mkdir(parents=True, exist_ok=True)
    spy = load_spy_report(logger)
    guidelines = load_brand_guidelines(logger)
    threshold = float(guidelines.get("approval_threshold_percent", 90))

    if not CONTENT_DRAFTS_DIR.exists():
        return

    # ไฟล์ task (สั่งมินนี่) ไม่ใช่ draft โพสต์ — อย่าเอาไปผ่าน quality gate
    _TASK_PREFIXES = (
        "competitive_response_",
        "discord_order_",
    )

    for path in sorted(CONTENT_DRAFTS_DIR.iterdir()):
        if not path.is_file() or path.suffix not in (".json", ".md", ".txt"):
            continue
        if path.name.startswith("revision_request_") or path.name.startswith("quality_feedback_"):
            continue
        if any(path.name.startswith(p) for p in _TASK_PREFIXES):
            logger.info(f"[Pinky] ข้ามไฟล์ task (รอมินนี่เขียน draft จริง): {path.name}")
            continue
        if path.suffix == ".json":
            try:
                with open(path, "r", encoding="utf-8") as f:
                    _d = json.load(f)
                if isinstance(_d, dict) and _d.get("action") in (
                    "draft_competitive_response",
                    "draft_content",
                    "draft_from_discord",
                ) and not (str(_d.get("content") or "").strip() or len(str(_d.get("body") or "")) > 80):
                    logger.info(f"[Pinky] ข้าม JSON ที่เป็นแค่ใบสั่งงาน ไม่มีเนื้อโพสต์: {path.name}")
                    continue
            except (OSError, json.JSONDecodeError):
                pass
        try:
            if path.suffix == ".json":
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                content_text = data.get("content", data.get("message", json.dumps(data)))
            else:
                content_text = path.read_text(encoding="utf-8", errors="replace")
        except (OSError, json.JSONDecodeError) as e:
            logger.warning(f"อ่านไฟล์ไม่สำเร็จ {path.name}: {e}")
            continue

        # บทจาก !draft (Discord Commander) — ไม่บังคับให้มีคำจาก Navy ในโพสต์สั้นๆ
        is_user_draft = path.name.startswith("user_draft_")
        user_draft_threshold = float(guidelines.get("user_draft_approval_threshold_percent", 72))

        # Conflict: Minnie vs Navy (ข้ามสำหรับ user_draft)
        if spy and not is_user_draft:
            aligned, issues = check_alignment_with_navy(content_text, spy, logger)
            if not aligned:
                logger.info(f"[Pinky] Conflict: {path.name} ไม่สอดคล้อง Navy intel — ส่งกลับให้ Minnie แก้")
                feedback_path = CONTENT_DRAFTS_DIR / f"revision_request_{path.stem}.json"
                feedback = {
                    "original_file": path.name,
                    "reason": "content_does_not_align_with_market_intelligence",
                    "issues": issues,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "action": "minnie_revise",
                }
                with open(feedback_path, "w", encoding="utf-8") as f:
                    json.dump(feedback, f, ensure_ascii=False, indent=2)
                _post_webhook(webhooks, "minnie", f"🔴 [Pinky] เนื้อหาใน **{path.name}** ไม่สอดคล้องกับ Navy intel — โปรดแก้ไขตาม revision_request แล้วส่งใหม่ครับ", logger)
                continue
        if is_user_draft:
            logger.info(f"[Pinky] {path.name} = บทจาก !draft — ข้าม Navy keyword gate, เกณฑ์ผ่าน {user_draft_threshold}%")

        use_threshold = user_draft_threshold if is_user_draft else threshold
        score, breakdown = score_quality(
            content_text, spy, guidelines, logger, relax_navy_score=bool(is_user_draft)
        )
        if score >= use_threshold:
            dest = READY_TO_POST_DIR / path.name
            shutil.copy2(path, dest)
            logger.info(f"[Pinky] ผ่าน Quality Gate ({score}%) — ย้ายไป ready_to_post: {path.name}")
            _post_webhook(
                webhooks,
                "thomas",
                f"✅ [Pinky] มี content พร้อมโพสต์: **{path.name}** (คะแนน {score}% / เกณฑ์ {use_threshold}%) — ถึงคิว Thomas ครับ",
                logger,
            )
            path.unlink()
        else:
            logger.info(f"[Pinky] ไม่ผ่าน ({score}% < {use_threshold}%) — แจ้ง Minnie แก้: {path.name}")
            feedback_path = CONTENT_DRAFTS_DIR / f"quality_feedback_{path.stem}.json"
            feedback = {
                "original_file": path.name,
                "score": score,
                "breakdown": breakdown,
                "threshold": use_threshold,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "action": "minnie_revise",
            }
            with open(feedback_path, "w", encoding="utf-8") as f:
                json.dump(feedback, f, ensure_ascii=False, indent=2)
            _post_webhook(
                webhooks,
                "minnie",
                f"🟡 [Pinky] เนื้อหา **{path.name}** ได้คะแนน {score}% (ต้องไม่ต่ำกว่า {use_threshold}%) — โปรดแก้ตาม quality_feedback แล้วส่งใหม่ครับ",
                logger,
            )


def generate_daily_briefing(spy: dict | None, logger) -> str:
    """สร้าง Daily Briefing: Today's Focus, Task Status, Market Threat."""
    theme = "Competitive Response & Content Pipeline"
    status_parts = []
    if (PIPELINE_DIR / "minnie_drafts").exists():
        count = sum(1 for _ in (PIPELINE_DIR / "minnie_drafts").iterdir() if _.is_file() and _.suffix in (".json", ".md", ".txt"))
        status_parts.append(f"Minnie: {count} draft(s) in queue" if count else "Minnie: Done (no pending drafts)")
    else:
        status_parts.append("Minnie: —")
    if (PIPELINE_DIR / "rocky").exists():
        count = sum(1 for _ in (PIPELINE_DIR / "rocky").iterdir() if _.is_file())
        status_parts.append(f"Rocky: In Progress ({count} file(s))" if count else "Rocky: Done (no files)")
    else:
        status_parts.append("Rocky: —")
    if (PIPELINE_DIR / "ready_to_post").exists():
        count = sum(1 for _ in (PIPELINE_DIR / "ready_to_post").iterdir() if _.is_file())
        status_parts.append(f"Thomas: {count} ready to post")
    else:
        status_parts.append("Thomas: —")
    task_status = ", ".join(status_parts)
    market_threat = "None"
    if spy:
        advice = (spy.get("strategic_advice") or "").strip()
        if advice:
            market_threat = advice[:200] + ("..." if len(advice) > 200 else "")
    return (
        f"**👑 Pinky Daily Briefing**\n"
        f"Today's Focus: {theme}\n"
        f"Task Status: {task_status}\n"
        f"Market Threat (Navy's Alert): {market_threat}"
    )


def check_high_risk_pending(action: str, logger) -> bool:
    """
    Human-in-the-loop: การตัดสินใจความเสี่ยงสูง (เช่น Store Deployment) ต้องรอ "YES".
    ตรวจจากไฟล์ใน pipeline/pending_approval/ เช่น store_deployment_YES.txt
    """
    PENDING_APPROVAL_DIR.mkdir(parents=True, exist_ok=True)
    signal_file = PENDING_APPROVAL_DIR / f"{action}_YES.txt"
    return signal_file.exists()


def request_human_approval(action: str, webhooks: dict, logger) -> None:
    """แจ้ง #👑-pinky-hq ว่าต้องการการอนุมัติจาก User — รอ YES (สร้างไฟล์ใน pending_approval/)."""
    PENDING_APPROVAL_DIR.mkdir(parents=True, exist_ok=True)
    msg = (
        f"⏸️ **Pinky Human-in-the-loop**\n"
        f"High-risk action: **{action}**\n"
        f"รอการอนุมัติจาก User — กรุณาตอบ **YES** ใน channel นี้ หรือสร้างไฟล์ `pipeline/pending_approval/{action}_YES.txt` เพื่อดำเนินการต่อ"
    )
    send_to_pinky_hq(msg, logger)


def on_pipeline_event(event_type: str, detail: str, webhooks: dict, logger) -> None:
    """รายงานทุก event ใน pipeline ไป Pinky ก่อน (Main Listener)."""
    msg = f"📋 [Pipeline Event] **{event_type}** — {detail}"
    send_to_pinky_hq(msg, logger)


def load_thomas_reports(logger) -> list:
    """อ่านสถิติจาก pipeline/thomas/reports/ (JSON ที่ Backend โยนมา)."""
    reports = []
    if not THOMAS_REPORTS_DIR.exists():
        return reports
    for path in THOMAS_REPORTS_DIR.iterdir():
        if not path.is_file() or path.suffix != ".json":
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["_file"] = path.name
            reports.append(data)
        except (OSError, json.JSONDecodeError) as e:
            logger.warning(f"อ่าน report ไม่ได้ {path.name}: {e}")
    return reports


def _get_metric(report: dict, key: str) -> float:
    """ดึงค่า metric จาก report (รองรับทั้งระดับบนและใน metrics)."""
    v = report.get(key)
    if v is not None and isinstance(v, (int, float)):
        return float(v)
    m = report.get("metrics") or {}
    v = m.get(key)
    if v is not None and isinstance(v, (int, float)):
        return float(v)
    return 0.0


def analyze_reports_and_write_strategy(webhooks: dict, logger) -> None:
    """
    Pinky Strategist: อ่านสถิติจาก thomas/reports/
    ถ้าเห็นแนวโน้ม (เช่น TikTok ยอดวิวพุ่ง แต่ Facebook เงียบ) จะเขียน strategy_update.json
    ลง pipeline/pinky/strategy/ และสั่งมินนี่ผ่าน Discord
    """
    reports = load_thomas_reports(logger)
    if not reports:
        return

    # หากมี account ไหน "ติด Shadowban" ให้สร้าง warning strategy ทันที
    shadowbanned = []
    for r in reports:
        hc = r.get("health_check") or {}
        if hc.get("is_shadowbanned") is True:
            shadowbanned.append(r)
    if shadowbanned:
        PINKY_STRATEGY_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        account_ids = [str(r.get("account_id") or r.get("_file") or "unknown") for r in shadowbanned]
        warning_messages = []
        for r in shadowbanned:
            hc = r.get("health_check") or {}
            msgs = hc.get("warning_messages") or []
            if isinstance(msgs, list):
                warning_messages.extend([str(x) for x in msgs if x])

        strategy = {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "type": "shadowban_warning",
            "target_account_ids": account_ids,
            "message_to_minnie": "บัญชีบางส่วนอาจติด Shadowban โปรดตรวจและลดความเสี่ยงก่อนโพสต์ถัดไป",
            "recommended_keywords": ["หลีกเลี่ยงการเดิมซ้ำ", "ทดสอบคอนเทนต์ใหม่"],
            "warning_messages": warning_messages,
        }
        out_path = PINKY_STRATEGY_DIR / f"strategy_shadowban_warning_{ts}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(strategy, f, ensure_ascii=False, indent=2)

        logger.warning(f"[Pinky] พบ is_shadowbanned=true ใน report: {account_ids} — สร้างไฟล์ {out_path.name}")
        # ยิง Notification เข้า Discord #pinky-hq
        for acc_id in account_ids:
            send_to_pinky_hq(f"🟠 [Pinky] บัญชี [{acc_id}] อาจจะติด Shadowban โปรดตรวจสอบ!", logger)
        return
    # รวมยอดต่อ platform
    by_platform = {}
    for r in reports:
        platform = (r.get("platform") or "unknown").lower().strip()
        if platform not in by_platform:
            by_platform[platform] = {"views": 0.0, "shares": 0.0, "follows_gained": 0.0}
        by_platform[platform]["views"] += _get_metric(r, "views")
        by_platform[platform]["shares"] += _get_metric(r, "shares")
        by_platform[platform]["follows_gained"] += _get_metric(r, "follows_gained")
    if not by_platform:
        return
    # หา platform ที่ยอดสูงสุด vs ต่ำ
    best_platform = max(by_platform.items(), key=lambda x: x[1]["views"] + x[1]["shares"] * 2 + x[1]["follows_gained"] * 3)
    worst_platform = min(by_platform.items(), key=lambda x: x[1]["views"] + x[1]["shares"])
    best_name, best_vals = best_platform
    worst_name, worst_vals = worst_platform
    total_views_best = best_vals["views"]
    total_views_worst = worst_vals["views"]
    # ถ้า TikTok (หรือ best) พุ่งแต่ Facebook (หรือ worst) เงียบ → เขียน strategy
    if total_views_best > 0 and total_views_worst < total_views_best * 0.2:
        PINKY_STRATEGY_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        strategy = {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "focus_platform": best_name,
            "focus_platforms": [best_name],
            "content_tone_adjustment": "เน้นสั้น ฮุกแรง แนว viral ตามแพลตฟอร์มที่ยอดดี",
            "recommended_keywords": ["Startup", "Freelance", "หางาน"],
            "message_to_minnie": f"มินนี่! ดูนี่สิ {best_name} ชอบแนวนี้ รอบหน้าเขียนบทเน้นแบบนี้ด่วน!",
            "metrics_summary": f"{best_name}: views {int(total_views_best)}, {worst_name}: เงียบ — โฟกัส {best_name}",
        }
        out_path = PINKY_STRATEGY_DIR / f"strategy_update_{ts}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(strategy, f, ensure_ascii=False, indent=2)
        logger.info(f"[Pinky Strategist] เขียน strategy_update: {out_path.name}")
        msg = f"📊 **Pinky Strategist** — อ่าน Report แล้ว\n{strategy['message_to_minnie']}\nโฟกัส: **{best_name}** · ไฟล์: pipeline/pinky/strategy/{out_path.name}"
        send_to_pinky_hq(msg, logger)
        _post_webhook(webhooks, "minnie", f"🔔 [Pinky] **มินนี่! ดูนี่สิ {best_name} ชอบแนวนี้ รอบหน้าเขียนบทเน้นแบบนี้ด่วน!** ดูรายละเอียดใน pipeline/pinky/strategy/ ครับ", logger)


def run_pinky_cycle(webhooks: dict, logger, send_briefing: bool = False) -> None:
    """รันหนึ่งรอบ: review pipeline, quality gate, อ่าน Report → เขียน Strategy, (optional) daily briefing."""
    if send_briefing:
        spy = load_spy_report(logger)
        briefing = generate_daily_briefing(spy, logger)
        send_to_pinky_hq(briefing, logger)
    review_pipeline(webhooks, logger)
    analyze_reports_and_write_strategy(webhooks, logger)


def main():
    import sys
    logger = setup_logging()
    logger.info("Pinky Manager เริ่มทำงาน (ไม่ log API keys)")
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    PIPELINE_DIR.mkdir(parents=True, exist_ok=True)
    webhooks = load_webhooks_safe(logger)
    if webhooks:
        logger.info(f"โหลด webhook keys: {_safe_log_config(webhooks)}")
    send_briefing = "--briefing" in sys.argv
    run_pinky_cycle(webhooks, logger, send_briefing=send_briefing)
    logger.info("Pinky รอบนี้เสร็จแล้ว")


if __name__ == "__main__":
    main()
