"""
Navy 2.0 — Competitor & Market Intelligence System (Spy Agent)
รวบรวมข่าวคู่แข่ง, แนวโน้มตลาด, ข่าวเศรษฐกิจ แล้วจัดรูปแบบให้ Pinky และ Minnie ใช้ได้
ทำงานร่วมกับ orchestrator และ report_to_discord ใน aqond-brain เท่านั้น
"""

import json
import re
import ssl
import sys
import logging
from typing import List, Optional
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from urllib.parse import quote
from xml.etree import ElementTree

# Paths ภายใน aqond-brain เท่านั้น
AQOND_BRAIN = Path(__file__).resolve().parent.parent
PIPELINE_DIR = AQOND_BRAIN / "pipeline"
CONFIG_DIR = AQOND_BRAIN / "config"
LOGS_DIR = AQOND_BRAIN / "logs"
SPY_REPORT_PATH = PIPELINE_DIR / "spy_report.json"

# ใช้ SSL มาตรฐาน (ไม่ verify สำหรับบาง feed ถ้าต้องการ)
SSL_CTX = ssl.create_default_context()

# Default RSS keywords ตาม Prompt
DEFAULT_RSS_KEYWORDS = ["Startup Thailand", "Freelance Tax", "หางาน"]


def setup_logging():
    """Log ไว้ที่ aqond-brain/logs/"""
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_file = LOGS_DIR / "navy_spy.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )
    return logging.getLogger("navy_spy")


def load_navy_config(logger):
    """โหลด config คู่แข่งและ RSS จาก config/navy_config.json"""
    path = CONFIG_DIR / "navy_config.json"
    if not path.exists():
        path = CONFIG_DIR / "navy_config.example.json"
    if not path.exists():
        logger.warning("ไม่พบ navy_config — ใช้ค่า default (RSS keywords เท่านั้น)")
        return {
            "competitors": [],
            "rss_keywords": DEFAULT_RSS_KEYWORDS,
            "google_news_rss_base": "https://news.google.com/rss/search?q={query}&hl=th&gl=TH&ceid=TH:th",
        }
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"โหลด navy_config ไม่ได้: {e}")
        return {"competitors": [], "rss_keywords": DEFAULT_RSS_KEYWORDS}


def fetch_url(url: str, logger, timeout: int = 15) -> str:
    """ดึงเนื้อหาจาก URL (stdlib only)."""
    try:
        req = Request(url, headers={"User-Agent": "Navy2.0-Bot/1.0 (aqond-brain)"})
        with urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except (URLError, HTTPError, OSError) as e:
        logger.warning(f"fetch_url failed: {url} — {e}")
        return ""


def fetch_google_news_rss(keywords: list, base_url: str, logger) -> list:
    """ดึงข่าวจาก Google News RSS ตาม keywords. คืน list ของ headline/link."""
    results = []
    for kw in keywords:
        # encode คำค้น (รวมภาษาไทย) เป็น ASCII เพื่อไม่ให้ UnicodeEncodeError ตอนส่ง request
        query = quote(kw.replace(" ", "+"), safe="+")
        url = base_url.format(query=query)
        html = fetch_url(url, logger)
        if not html:
            continue
        try:
            root = ElementTree.fromstring(html)
            # Google News RSS: channel -> item -> title, link
            for item in root.findall(".//item"):
                title_el = item.find("title")
                link_el = item.find("link")
                if title_el is not None and title_el.text:
                    results.append({
                        "title": title_el.text.strip(),
                        "link": link_el.text.strip() if link_el is not None and link_el.text else "",
                        "keyword": kw,
                    })
        except ElementTree.ParseError as e:
            logger.warning(f"Parse RSS failed for {kw}: {e}")
    return results


def analyze_competitor_page(html: str, name: str, logger) -> dict:
    """
    วิเคราะห์เนื้อหาเว็บคู่แข่ง (แบบ heuristic):
    - detected_changes: จากคำที่เกี่ยวกับ feature/update/new
    - user_complaints: จากคำที่เกี่ยวกับ pain/complaint/ปัญหา
    """
    text = re.sub(r"<[^>]+>", " ", html).replace("\n", " ").lower()
    words = re.findall(r"\w+", text)
    detected_changes = []
    user_complaints = []
    # Heuristic: หาประโยคหรือกลุ่มคำที่เกี่ยวกับฟีเจอร์ใหม่
    change_patterns = [
        r"new\s+feature", r"ฟีเจอร์ใหม่", r"อัปเดต", r"update", r"launch", r"เปิดตัว",
        r"improve", r"ปรับปรุง", r"เพิ่ม", r"add",
    ]
    complaint_patterns = [
        r"complaint", r"ปัญหา", r"pain", r"ไม่พอใจ", r"bug", r"error", r"slow",
        r"expensive", r"แพง", r"ยาก",
    ]
    for pat in change_patterns:
        if re.search(pat, text):
            detected_changes.append(pat)
    for pat in complaint_patterns:
        if re.search(pat, text):
            user_complaints.append(pat)
    return {
        "name": name,
        "detected_changes": list(set(detected_changes))[:10],
        "user_complaints": list(set(user_complaints))[:10],
    }


def analyze_market_trends(rss_items: list, logger) -> list:
    """สรุปเป็น market_trends จาก headline ข่าว."""
    trends = []
    seen = set()
    for item in rss_items:
        t = (item.get("title") or "").strip()
        if t and t not in seen and len(t) > 5:
            seen.add(t)
            trends.append(t)
    return trends[:15]


def build_strategic_advice(competitor_analysis: list, market_trends: list) -> str:
    """สร้าง strategic_advice สำหรับ Pinky."""
    parts = []
    if competitor_analysis:
        parts.append("คู่แข่งมีสัญญาณการอัปเดตและจุดที่ผู้ใช้ไม่พอใจ — แนะนำให้ Pinky ตรวจรายงานและตัดสินใจลำดับความสำคัญ.")
    if market_trends:
        parts.append("แนวโน้มตลาดจากข่าวล่าสุดมีหลายประเด็น — พิจารณาปรับกลยุทธ์เนื้อหาและโฟกัสตาม keyword ที่เกี่ยวข้อง.")
    return " ".join(parts) if parts else "ไม่มีข้อมูลใหม่เพียงพอในรอบนี้ — แนะนำรอรอบถัดไปหรือเพิ่มแหล่งข้อมูล."


def build_action_item_for_bill(competitor_analysis: list) -> str:
    """Technical preparation ที่ Bill ควรทำ."""
    if not competitor_analysis:
        return "ไม่มีข้อมูลคู่แข่งในรอบนี้ — ตรวจสอบ config/navy_config.json และแหล่งที่มา."
    return "เตรียมระบบให้รองรับการเปรียบเทียบฟีเจอร์และ pain points ต่อเนื่อง — พิจารณาเพิ่มแหล่งรวบรวมรีวิวหรือ API ถ้ามี."


def run_intelligence(logger, extra_rss_keywords: Optional[List[str]] = None) -> dict:
    """
    รันวงจรรวบรวมข่าว: คู่แข่ง + RSS -> วิเคราะห์ -> สร้างโครงสร้างตาม schema.
    extra_rss_keywords: คำสั่งจาก Discord !navy [หัวข้อ] — แทรกค้นหาข่าวเพิ่มก่อน keywords ปกติ
    """
    config = load_navy_config(logger)
    competitors = config.get("competitors", [])
    rss_keywords = list(config.get("rss_keywords", DEFAULT_RSS_KEYWORDS))
    if extra_rss_keywords:
        rss_keywords = [str(x).strip() for x in extra_rss_keywords if str(x).strip()] + rss_keywords
    rss_base = config.get("google_news_rss_base", "")

    competitor_analysis = []
    for c in competitors:
        name = c.get("name", "Unknown")
        url = c.get("url", "").strip()
        if not url:
            continue
        html = fetch_url(url, logger)
        if html:
            competitor_analysis.append(analyze_competitor_page(html, name, logger))
        else:
            competitor_analysis.append({
                "name": name,
                "detected_changes": [],
                "user_complaints": [],
            })

    market_trends = []
    if rss_base:
        rss_items = fetch_google_news_rss(rss_keywords, rss_base, logger)
        market_trends = analyze_market_trends(rss_items, logger)

    return {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "competitor_analysis": competitor_analysis,
        "market_trends": market_trends,
        "strategic_advice": build_strategic_advice(competitor_analysis, market_trends),
        "action_item_for_bill": build_action_item_for_bill(competitor_analysis),
    }


def write_spy_report(report: dict, logger) -> None:
    """เขียนหรืออัปเดต pipeline/spy_report.json"""
    PIPELINE_DIR.mkdir(parents=True, exist_ok=True)
    with open(SPY_REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    logger.info(f"อัปเดต spy_report.json แล้ว: {SPY_REPORT_PATH}")


def send_discord_alert(report: dict, logger) -> None:
    """
    ส่งสรุปไป #🛰️-navy-intel ผ่าน report_to_discord.
    Headline: "🚨 Navy 2.0 Intelligence Alert: คู่แข่งกำลังขยับ เจ้านายโปรดตรวจสอบ!"
    """
    try:
        from report_to_discord import send_to_discord, NAVY_INTEL_CHANNEL_KEY
    except ImportError:
        # เรียกแบบ subprocess ถ้า import ไม่ได้ (เช่นรันจากที่อื่น)
        import subprocess
        content = build_discord_content(report)
        script = Path(__file__).resolve().parent / "report_to_discord.py"
        subprocess.run([sys.executable, str(script), content], check=False, cwd=str(AQOND_BRAIN))
        return

    content = build_discord_content(report)
    ok = send_to_discord(content, NAVY_INTEL_CHANNEL_KEY)
    if ok:
        logger.info("ส่ง Navy Intelligence Alert ไป Discord แล้ว")
    else:
        logger.warning("ส่ง Discord ไม่สำเร็จ — ตรวจสอบ config/webhooks.json (key: navy_intel)")


def build_discord_content(report: dict) -> str:
    """สร้างข้อความเต็มสำหรับ Discord (#🛰️-navy-intel)."""
    lines = [
        "**🚨 Navy 2.0 Intelligence Alert: คู่แข่งกำลังขยับ เจ้านายโปรดตรวจสอบ!**",
        "",
        "**สรุป:**",
        f"- อัปเดตล่าสุด: {report.get('last_updated', 'N/A')}",
        f"- จำนวนคู่แข่งที่วิเคราะห์: {len(report.get('competitor_analysis', []))}",
        f"- แนวโน้มตลาดจากข่าว: {len(report.get('market_trends', []))} รายการ",
        "",
        "**Strategic Advice (สำหรับ Pinky):**",
        report.get("strategic_advice", "-"),
        "",
        "**Action Items:**",
        report.get("action_item_for_bill", "-"),
    ]
    return "\n".join(lines)


def main():
    logger = setup_logging()
    extra = None
    if len(sys.argv) > 1:
        topic = " ".join(sys.argv[1:]).strip()
        if topic:
            extra = [topic]
            logger.info(f"Navy 2.0 — หัวข้อเพิ่มจากคำสั่ง: {topic}")
    logger.info("Navy 2.0 เริ่มรันรอบข่าวกรอง")
    report = run_intelligence(logger, extra_rss_keywords=extra)
    write_spy_report(report, logger)
    send_discord_alert(report, logger)
    logger.info("Navy 2.0 รอบนี้เสร็จแล้ว")


if __name__ == "__main__":
    main()
