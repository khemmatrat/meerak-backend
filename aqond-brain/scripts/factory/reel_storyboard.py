"""Flow 2 storyboard — บทพากย์ไม่ซ้ำทุกฉาก"""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from urllib.request import Request, urlopen

from factory.hook_factory import load_env

SCENARIO_SCRIPTS: dict[str, list[dict[str, str]]] = {
    "friend": [
        {"vo": "เพื่อนถามว่ารับงานออนไลน์ยังไงไม่ให้โดนโกง?", "visual": "Two Thai friends chatting at a cafe, one curious"},
        {"vo": "เพื่อนแนะนำ AQOND — แอปตรวจงานก่อนรับ มั่นใจกว่า", "visual": "Friend showing AQOND app on smartphone, enthusiastic"},
        {"vo": "ดูรีวิวนายจ้าง ตรวจสัญญา ก่อนตกลงรับงาน", "visual": "Close-up of app showing employer reviews and contract check"},
        {"vo": "ใช้จริงแล้วรู้สึกปลอดภัยขึ้น ไม่ต้องกลัวเบี้ยวเงิน", "visual": "Thai worker smiling relieved, completed job"},
        {"vo": "ลองฟรีวันนี้ที่ app.aqond.com แนะนำเพื่อนด้วยนะ!", "visual": "AQOND app download CTA, happy friends"},
    ],
    "repair": [
        {"vo": "ช่างซ่อมรับงานแล้วโดนเบี้ยวค่าจ้างอีกแล้ว?", "visual": "Thai repairman frustrated, unpaid invoice"},
        {"vo": "AQOND ช่วยตรวจนายจ้างก่อนรับงาน", "visual": "Repairman checking employer on AQOND app"},
        {"vo": "มีหลักฐาน มีสัญญา บันทึกในแอปครบ", "visual": "Document and contract on phone screen"},
        {"vo": "รับงานมั่นใจ ไม่ต้องกลัวโดนโกงอีก", "visual": "Repairman working confidently at client home"},
        {"vo": "ดาวน์โหลดฟรี app.aqond.com วันนี้เลย!", "visual": "Call to action, repairman thumbs up"},
    ],
    "maid": [
        {"vo": "ทำงานหนักทั้งเดือน แต่นายจ้างจ่ายไม่ครบ?", "visual": "Thai maid worried about salary"},
        {"vo": "AQOND ทำให้งานชัดเจนก่อนเริ่ม มีสัญญาครบ", "visual": "Maid reading clear job contract on app"},
        {"vo": "บันทึกเวลาทำงานและหลักฐานในแอป", "visual": "Maid logging work hours on smartphone"},
        {"vo": "แม่บ้านหลายคนเปลี่ยนมาใช้ AQOND แล้ว", "visual": "Group of domestic workers with phones"},
        {"vo": "ลองฟรี app.aqond.com ปลอดภัยกว่าเดิม!", "visual": "Happy maid, AQOND logo subtle"},
    ],
    "driver": [
        {"vo": "คนขับรับงานแล้วไม่รู้จะได้เงินจริงไหม?", "visual": "Thai driver uncertain before trip"},
        {"vo": "AQOND ตรวจงานและนายจ้างก่อนออกรถ", "visual": "Driver checking job details on AQOND app"},
        {"vo": "รู้ราคา รู้เส้นทาง รู้เงื่อนไข ก่อนเริ่มงาน", "visual": "Map and fare details on phone"},
        {"vo": "จบงานรับเงินตรง มีหลักฐานครบ", "visual": "Driver receiving payment, satisfied"},
        {"vo": "สมัครฟรี app.aqond.com คนขับไว้ใจได้!", "visual": "Driver with van, CTA"},
    ],
    "insurance": [
        {"vo": "พรบ. หมดอายุแล้วหรือยัง? อย่ารอจนโดนปรับ!", "visual": "Thai car owner checking expiry document"},
        {"vo": "ต่อ พรบ. ในแอป AQOND ง่ายมาก", "visual": "Car owner using AQOND app for insurance"},
        {"vo": "รับส่วนลดทันที สิทธิ์จำกัด รีบเลย!", "visual": "Discount badge on phone screen"},
        {"vo": "ไม่ต้องวิ่งหลายที่ ทำในแอปเดียวจบ", "visual": "Happy car owner, completed renewal"},
        {"vo": "กดดาวน์โหลด app.aqond.com วันนี้!", "visual": "Car and smartphone, CTA"},
    ],
    "matchjob": [
        {"vo": "รับงานออนไลน์ กลัวโดนนายจ้างโกง?", "visual": "Young Thai worker scrolling job ads worried"},
        {"vo": "AQOND MatchJob ตรวจนายจ้างก่อนรับงาน", "visual": "App showing employer verification badge"},
        {"vo": "ดูรีวิวจริง ตรวจประวัติ มั่นใจก่อนตกลง", "visual": "Review stars and verification on screen"},
        {"vo": "คนใช้จริงหลายพันคน ปลอดภัยกว่าเดิม", "visual": "Diverse Thai workers using app"},
        {"vo": "ลองฟรี app.aqond.com วันนี้เลย!", "visual": "Confident worker, download CTA"},
    ],
    "advance_job": [
        {
            "vo": "รับเหมาโปรแกรม การตลาด ดูแลผู้สูงอายุ — กลัวโดนเบี้ยวเงินอีกไหม?",
            "visual": "Thai freelancers collage: programmer, marketer, caregiver worried about unpaid invoice",
        },
        {
            "vo": "Advance Job บน AQOND — ประกาศงาน รับงานรอบ มีตัวกลางดูแลเงิน",
            "visual": "Smartphone showing AQOND Job Board UI with Thai text Advance Job and escrow badge",
        },
        {
            "vo": "นายจ้างโอนเงินเข้าระบบก่อน ฟรีแลนซ์ส่งงาน ค่อยปล่อยเงินเมื่อผ่าน",
            "visual": "App screen Thai text เงินปลอดภัย ตัวกลางดูแลการเงิน escrow flow diagram",
        },
        {
            "vo": "เหมาะทั้งโปรแกรมเมอร์ ทนายความ พี่เลี้ยงเด็ก งานพิธีกรรม รับจ้างทุกสาย",
            "visual": "Montage Thai professionals: lawyer, babysitter, ritual organizer using AQOND app",
        },
        {
            "vo": "ลงประกาศหรือรับงานรอบวันนี้ที่ app.aqond.com ปลอดภัยกว่าเดิม!",
            "visual": "Happy Thai contractor thumbs up, clean premium closing shot, no text on image",
        },
    ],
    "video_feed": [
        {
            "vo": "มีฝีมือแต่หางานยาก? ลองโชว์ผ่านคลิปสั้นบน AQOND",
            "visual": "Thai skilled worker recording vertical video portfolio on smartphone",
        },
        {
            "vo": "Video Feed Hiring — นายจ้างดูคลิปโชว์ฝีมือก่อนจ้าง ตัดสินใจง่ายขึ้น",
            "visual": "Phone feed of skill demo videos: cooking, repair, design with Thai UI Video Feed",
        },
        {
            "vo": "ช่าง ครูสอน ช่างภาพ โปรแกรมเมอร์ — อัปคลิปแล้วรอลูกค้าทัก",
            "visual": "Grid of Thai professionals short video thumbnails with play buttons",
        },
        {
            "vo": "AQOND ช่วยตรวจนายจ้างและสัญญา จ้างผ่านคลิปก็มั่นใจได้",
            "visual": "Employer watching skill video then confirming hire on AQOND app Thai text",
        },
        {
            "vo": "อัปคลิปโชว์ฝีมือวันนี้ app.aqond.com รับงานเร็วขึ้น!",
            "visual": "Thai creator smiling after uploading video, warm closing portrait, no text",
        },
    ],
}

SCENARIO_BRIEFS: dict[str, str] = {
    "advance_job": (
        "Advance Job / Job Board ของ AQOND — ประกาศหางานหรือเข้ารับงานรอบ "
        "มีตัวกลางจัดการเงิน (escrow) ป้องกันทั้งนายจ้างและผู้รับจ้างโดนโกง "
        "เหมาะงานรับเหมา: เขียนโปรแกรม การตลาด ดูแลผู้สูงอายุ พี่เลี้ยงเด็ก ทนายความ งานพิธีกรรม/ดูดวงจัดจ้าง"
    ),
    "video_feed": (
        "Video Feed Hiring — เชิญชวนจ้างงานผ่านคลิปโชว์ฝีมือ "
        "ผู้หางานอัปวิดีโอสั้น นายจ้างดูก่อนจ้าง มี AQOND ช่วยตรวจสัญญาและความปลอดภัย"
    ),
}


def _extract_vo(sc: Any) -> str:
    if isinstance(sc, str):
        return sc.strip()
    if not isinstance(sc, dict):
        return ""
    for key in ("vo", "voiceover", "voice", "narration", "script", "text", "dialogue", "line"):
        val = sc.get(key)
        if val and str(val).strip():
            return str(val).strip()
    return ""


def _extract_visual(sc: Any, topic: str, scenario: str, n: int) -> str:
    if isinstance(sc, dict):
        for key in ("visual", "image", "description", "scene_description", "shot"):
            val = sc.get(key)
            if val and str(val).strip():
                return str(val).strip()
    return f"Cinematic Thai vertical 9:16 scene {n}, {scenario}, {topic[:60]}"


def _fallback_scene(n: int, topic: str, scenario: str, brief: str) -> dict[str, str]:
    scripts = SCENARIO_SCRIPTS.get(scenario) or SCENARIO_SCRIPTS["matchjob"]
    idx = min(n, len(scripts) - 1)
    base = scripts[idx]
    vo = base["vo"]
    if brief and n == 0:
        vo = brief[:120] if len(brief) < 120 else brief[:117] + "..."
    return {
        "scene": n + 1,
        "vo": vo,
        "visual": base["visual"] + f" — {topic[:40]}",
    }


def normalize_storyboard(
    raw: Any,
    topic: str,
    scenario: str,
    brief: str,
) -> list[dict[str, str]]:
    """บังคับ 5 ฉาก + บทพากย์ไม่ซ้ำ"""
    items: list[dict[str, str]] = []

    if isinstance(raw, dict):
        raw = raw.get("scenes") or raw.get("storyboard") or raw.get("items") or [raw]
    if not isinstance(raw, list):
        raw = []

    for i, sc in enumerate(raw[:5]):
        vo = _extract_vo(sc)
        visual = _extract_visual(sc, topic, scenario, i + 1)
        if vo:
            items.append({"scene": i + 1, "vo": vo[:200], "visual": visual[:300]})

    while len(items) < 5:
        items.append(_fallback_scene(len(items), topic, scenario, brief))

    # แก้บทซ้ำ
    seen: set[str] = set()
    scripts = SCENARIO_SCRIPTS.get(scenario) or SCENARIO_SCRIPTS["matchjob"]
    for i, item in enumerate(items):
        vo = item["vo"].strip()
        if not vo or vo in seen or len(vo) < 8:
            fb = _fallback_scene(i, topic, scenario, brief)
            item["vo"] = fb["vo"]
            if not item.get("visual"):
                item["visual"] = fb["visual"]
        seen.add(item["vo"])

    return items[:5]


def _parse_json_array(text: str) -> list[Any] | None:
    text = (text or "").strip()
    m = re.search(r"\[[\s\S]*\]", text)
    if not m:
        return None
    try:
        data = json.loads(m.group())
        return data if isinstance(data, list) else None
    except json.JSONDecodeError:
        return None


def _grok_storyboard(prompt: str, logger: logging.Logger) -> list[Any] | None:
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
                        "content": (
                            "คุณคือนักเขียน Reel โฆษณาไทย ส่ง JSON array 5 ชิ้นเท่านั้น "
                            "แต่ละชิ้นต้องมี vo (บทพากย์ไทยไม่ซ้ำกัน) และ visual (คำอธิบายภาพ)"
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.88,
            }
        ).encode("utf-8")
        req = Request(
            "https://api.x.ai/v1/chat/completions",
            data=payload,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {xai_key}"},
            method="POST",
        )
        with urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return _parse_json_array(text)
    except Exception as e:
        logger.warning("[Flow2] Grok storyboard failed: %s", e)
    return None


def _gemini_storyboard(prompt: str, logger: logging.Logger) -> list[Any] | None:
    env = load_env()
    gemini_key = env.get("GEMINI_API_KEY", "").strip()
    if not gemini_key:
        return None
    try:
        import google.generativeai as genai

        genai.configure(api_key=gemini_key)
        model = genai.GenerativeModel(env.get("GEMINI_MODEL", "gemini-1.5-flash"))
        resp = model.generate_content(prompt)
        return _parse_json_array((resp.text or "").strip())
    except Exception as e:
        logger.warning("[Flow2] Gemini storyboard failed: %s", e)
    return None


def _adapt_storyboard_from_preset(
    board: list[dict[str, Any]],
    topic: str,
    brief: str,
    scenario: str,
    logger: logging.Logger,
) -> list[dict[str, str]] | None:
    """Rewrite vo/visual from a successful preset for a new brief (Gemini/Grok)."""
    env = load_env()
    primary = (brief or topic or "").strip()
    if not primary:
        return None

    sample = json.dumps(board[:5], ensure_ascii=False)[:2500]
    prompt = f"""ปรับ storyboard Reel 5 ฉากจากต้นแบบที่สำเร็จแล้ว ให้เข้ากับ brief ใหม่

Brief ใหม่: {primary}
สถานการณ์: {scenario}

ต้นแบบ (JSON):
{sample}

กฎ:
- คงโครง 5 ฉาก Hook→ปัญหา→โซลูชัน→CTA เหมือนเดิม
- เปลี่ยน vo เป็นประโยคไทยใหม่ให้เข้ากับ brief (ไม่ copy ตรงๆ)
- visual ปรับเล็กน้อยให้สอดคล้อง brief แต่สไตล์ cinematic เดิม
- ส่ง JSON array เท่านั้น: [{{"scene":1,"vo":"...","visual":"..."}}, ...]"""

    raw = _gemini_storyboard(prompt, logger)
    if not raw:
        raw = _grok_storyboard(prompt, logger)
    if raw:
        return normalize_storyboard(raw, topic, scenario, brief)
    return None


def generate_storyboard(
    topic: str,
    scenario: str,
    brief: str,
    context: str,
    job_id: int,
    logger: logging.Logger,
    preset_storyboard: list[dict[str, Any]] | None = None,
    preset_brief: str = "",
) -> list[dict[str, str]]:
    primary = (brief or topic or "").strip()
    scenario_hint = SCENARIO_BRIEFS.get(scenario, "")

    if preset_storyboard and isinstance(preset_storyboard, list) and len(preset_storyboard) >= 3:
        same_brief = not primary or primary.strip() == (preset_brief or "").strip()
        if same_brief:
            logger.info("[Flow2] Reusing preset storyboard (%d scenes)", len(preset_storyboard))
            return normalize_storyboard(preset_storyboard, topic, scenario, brief)
        adapted = _adapt_storyboard_from_preset(
            preset_storyboard, topic, brief, scenario, logger
        )
        if adapted:
            logger.info("[Flow2] Adapted preset storyboard for new brief")
            return adapted
        logger.info("[Flow2] Preset adapt failed — using preset structure with normalize")
        return normalize_storyboard(preset_storyboard, topic, scenario, brief)

    prompt = f"""สร้าง storyboard วิดีโอ Reel โฆษณา 20 วินาที (5 ฉาก 9:16) แอป AQOND

=== ข้อความหลักจากผู้ใช้ (ต้องสะท้อนในทุกฉาก) ===
{primary}

สถานการณ์: {scenario}
{f"คำอธิบายสถานการณ์: {scenario_hint}" if scenario_hint else ""}
Job #{job_id}

{context}

กฎสำคัญ:
- ต้องมี 5 ฉากเท่านั้น
- แต่ละฉาก "vo" ต้องเป็นประโยคไทยที่ต่างกันทั้งหมด ห้ามซ้ำ
- ฉาก 1 = Hook ดึงดูด, ฉาก 2-4 = ปัญหา→โซลูชัน, ฉาก 5 = CTA app.aqond.com
- แต่ละ vo สั้น 1-2 ประโยค พูดได้ใน 3-5 วินาที
- visual = คำอธิบายภาพ cinematic 9:16 — ถ้ามีหน้าจอมือถือ/แอป ให้ระบุข้อความภาษาไทยที่ต้องแสดงบนจอ

ส่ง JSON array เท่านั้น:
[{{"scene":1,"vo":"...","visual":"..."}}, ...]"""

    raw = _grok_storyboard(prompt, logger)
    if not raw:
        raw = _gemini_storyboard(prompt, logger)
    if not raw:
        logger.info("[Flow2] Using built-in scenario script for %s", scenario)
        raw = SCENARIO_SCRIPTS.get(scenario) or SCENARIO_SCRIPTS["matchjob"]

    board = normalize_storyboard(raw, topic, scenario, brief)
    logger.info(
        "[Flow2] Storyboard scenes: %s",
        " | ".join(s["vo"][:35] for s in board),
    )
    return board
