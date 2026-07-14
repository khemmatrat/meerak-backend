"""Flow 1 copy — หลากหลาย ไม่ซ้ำ กันสแปม Facebook"""

from __future__ import annotations

import json
import logging
import random
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from factory import media_db
from factory.hook_factory import load_env

COPY_ANGLES = [
    "เปิดด้วยคำถามกระแทกใจ แล้วให้คำตอบด้วย AQOND",
    "เล่าเรื่องสั้น 1 สถานการณ์จริงที่คนเจอ แล้วชี้ทางออก",
    "เน้นตัวเลข/สิทธิประโยชน์ชัด (ส่วนลด จำนวนจำกัด)",
    "โทนเร่งด่วน FOMO แต่ไม่หยาบคาย",
    "โทนให้ความรู้ 3 bullet สั้นๆ",
    "โทนเป็นกันเอง เหมือนเพื่อนแนะนำ",
    "เน้นความปลอดภัย/ความสบายใจ",
    "เปรียบเทียบ ก่อน vs หลังใช้แอป",
]

CTA_VARIANTS = [
    "ลองในแอปวันนี้ 👉 app.aqond.com",
    "กดดาวน์โหลด AQOND ฟรี 👉 app.aqond.com",
    "รับสิทธิ์ในแอปก่อนหมด 👉 app.aqond.com",
    "เช็กสิทธิ์ของคุณในแอป 👉 app.aqond.com",
    "คลิกเพื่อรับส่วนลดในแอป 👉 app.aqond.com",
]


def _recent_fb_copies(limit: int = 8) -> list[str]:
    """ดึง caption FB งานก่อนหน้า — ห้ามซ้ำ"""
    jobs = media_db.list_jobs(flow_type="flow1", limit=limit)
    out: list[str] = []
    for j in jobs:
        outputs = j.get("outputs") or {}
        copy = outputs.get("copy") or {}
        fb = (copy.get("facebook") or "").strip()
        if fb:
            out.append(fb[:300])
    return out


def _build_copy_prompt(
    topic: str,
    theme: str,
    context: str,
    job_id: int,
    user_brief: str,
) -> str:
    angle = COPY_ANGLES[job_id % len(COPY_ANGLES)]
    cta = CTA_VARIANTS[job_id % len(CTA_VARIANTS)]
    recent = _recent_fb_copies()
    avoid_block = ""
    if recent:
        avoid_block = (
            "\n=== ห้ามซ้ำประโยคเปิด/โครงสร้างเหล่านี้ (โพสต์ก่อนหน้า) ===\n"
            + "\n---\n".join(recent[:5])
            + "\nต้องเขียนใหม่ทั้งหมด ใช้คำต่าง มุมต่าง ห้ามขึ้นต้นเหมือนเดิม"
        )

    primary = user_brief.strip() or topic.strip()
    return f"""คุณเป็นนักเขียนโฆษณา AQOND (app.aqond.com) — เขียนโพสต์ใหม่ทุกครั้ง ห้ามสแปม

=== งานหลักจากผู้ใช้ (สำคัญสุด — ต้องสะท้อนในทุกแพลตฟอร์ม) ===
{primary}

ธีม: {theme}
มุมเขียนครั้งนี้: {angle}
CTA แนะนำ: {cta}
Job #{job_id} — ต้องไม่ซ้ำกับงานอื่น

{context}
{avoid_block}

กฎ:
- facebook: 2-4 ประโยค มี emoji ได้ 1-2 ตัว ไม่ซ้ำประโยคเดิม
- instagram: สั้น มีขึ้นบรรทัด มี hashtag ท้ายโพสต์
- youtube_short: 1-2 ประโยว สำหรับ Shorts
- hashtags: 5-8 แท็ก หลากหลาย ไม่ซ้ำชุดเดิม
- headline: หัวข้อสั้นสำหรับภาพ

ส่ง JSON เท่านั้น:
{{"facebook":"...","instagram":"...","youtube_short":"...","hashtags":"...","headline":"..."}}"""


def _parse_copy_json(text: str) -> dict[str, str] | None:
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        data = json.loads(m.group())
        if isinstance(data, dict) and data.get("facebook"):
            return {k: str(v) for k, v in data.items()}
    except json.JSONDecodeError:
        pass
    return None


def _too_similar(new_fb: str, recent: list[str]) -> bool:
    new_words = set(re.findall(r"[\wก-๙]+", new_fb.lower()))
    if len(new_words) < 5:
        return False
    for old in recent[:5]:
        old_words = set(re.findall(r"[\wก-๙]+", old.lower()))
        if not old_words:
            continue
        overlap = len(new_words & old_words) / max(len(new_words), 1)
        if overlap > 0.55:
            return True
    return False


def _grok_copy(prompt: str, logger: logging.Logger, temperature: float = 0.95) -> dict[str, str] | None:
    env = load_env()
    xai_key = env.get("XAI_API_KEY", "").strip()
    if not xai_key:
        return None
    try:
        payload = json.dumps(
            {
                "model": env.get("GROK_MODEL", "grok-3"),
                "messages": [
                    {
                        "role": "system",
                        "content": "เขียนโฆษณาไทยที่หลากหลาย ไม่ซ้ำ ไม่สแปม ปฏิบัติตาม brief ผู้ใช้เป็นหลัก",
                    },
                    {"role": "user", "content": prompt},
                ],
                "temperature": temperature,
            }
        ).encode("utf-8")
        req = Request(
            "https://api.x.ai/v1/chat/completions",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {xai_key}",
            },
            method="POST",
        )
        with urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
        )
        return _parse_copy_json(text)
    except (HTTPError, URLError, Exception) as e:
        logger.warning("[Flow1] Grok copy failed: %s", e)
        return None


def _diverse_fallback(topic: str, job_id: int, user_brief: str) -> dict[str, str]:
    """Fallback หลายแบบ — ไม่ใช่ MatchJob template เดิม"""
    base = user_brief.strip() or topic.strip()
    angle = COPY_ANGLES[job_id % len(COPY_ANGLES)]
    cta = CTA_VARIANTS[job_id % len(CTA_VARIANTS)]

    templates = [
        {
            "facebook": f"⏰ {base}\n\n{angle} — AQOND ช่วยคุณทำในแอปได้เลย\n{cta}",
            "instagram": f"{base}\n\n✨ AQOND\n{cta}\n\n#AQOND #พรบ #ประกันรถ #ส่วนลด",
            "youtube_short": f"{base[:80]} | AQOND {cta}",
            "hashtags": "#AQOND #พรบ #ประกันรถ #ส่วนลด #ด่วน",
            "headline": base[:50],
        },
        {
            "facebook": f"รู้ยัง? {base}\n\nสิทธิ์มีจำนวนจำกัด — อย่ารอจนเสียดาย\n{cta}",
            "instagram": f"🔥 {base}\n\nจำกัดจำนวน!\n{cta}\n#AQOND #Deal",
            "youtube_short": f"{base} รีบเลย! app.aqond.com",
            "hashtags": "#AQOND #โปรโมชั่น #พรบ #รีบเลย",
            "headline": "ด่วน! สิทธิ์จำกัด",
        },
        {
            "facebook": f"📌 {base}\n\nทำผ่านแอป AQOND ง่ายๆ ไม่ต้องวิ่งหลายที่\n{cta}",
            "instagram": f"{base}\n\nสะดวกในแอปเดียว 👇\n{cta}",
            "youtube_short": f"ต่อ พรบ. ในแอป AQOND — {cta}",
            "hashtags": "#AQOND #ต่อพรบ #แอปเดียวจบ",
            "headline": base[:45],
        },
    ]
    return templates[job_id % len(templates)]


def generate_flow1_copy(
    topic: str,
    theme: str,
    context: str,
    job_id: int,
    user_brief: str,
    logger: logging.Logger,
) -> dict[str, str]:
    prompt = _build_copy_prompt(topic, theme, context, job_id, user_brief)
    recent = _recent_fb_copies()

    copy = _grok_copy(prompt, logger, temperature=0.92)
    if copy and not _too_similar(copy.get("facebook", ""), recent):
        logger.info("[Flow1] Copy from Grok (diverse) job=%s", job_id)
        return copy

    if copy and _too_similar(copy.get("facebook", ""), recent):
        logger.info("[Flow1] Copy too similar — retry with higher temp")
        prompt2 = prompt + "\n\nเขียนใหม่ทั้งหมด ห้ามใช้คำว่า 'งานปลอดภัย' 'ตรวจสอบก่อนรับ' 'MatchJob' ถ้าไม่เกี่ยวกับ brief"
        copy2 = _grok_copy(prompt2, logger, temperature=1.0)
        if copy2:
            return copy2

    gemini_key = load_env().get("GEMINI_API_KEY", "").strip()
    if gemini_key:
        try:
            import google.generativeai as genai

            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel(load_env().get("GEMINI_MODEL", "gemini-1.5-flash"))
            resp = model.generate_content(prompt)
            parsed = _parse_copy_json((resp.text or "").strip())
            if parsed:
                return parsed
        except Exception as e:
            logger.warning("[Flow1] Gemini copy failed: %s", e)

    logger.info("[Flow1] Copy fallback template job=%s", job_id)
    return _diverse_fallback(topic, job_id, user_brief)
