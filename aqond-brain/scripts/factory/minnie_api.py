"""
Minnie API — Script & Audio Generation (Grok-first)
+ Chat Interface for live script editing
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent


def _load_env() -> dict[str, str]:
    """โหลด .env file → dict"""
    env_path = AQOND_BRAIN / ".env"
    env_dict = {}
    if not env_path.exists():
        return env_dict
    for line in open(env_path, "r", encoding="utf-8"):
        line = line.split("#")[0].strip()
        if "=" in line:
            k, v = line.split("=", 1)
            env_dict[k.strip()] = v.strip()
    return env_dict


TONE_PROFILES = {
    "toon": "Use exaggerated cartoon / anime-adjacent energy: big reactions, playful rhythm, family-friendly slapstick. Still clear on product benefits.",
    "funny": "Use humor, wit, and light-hearted language. Include wordplay and relatable jokes. Keep it fun and energetic.",
    "professional": "Use formal, authoritative language. Focus on credentials, results, and ROI. Corporate and trustworthy tone.",
    "sci-fi": "Use futuristic, tech-forward language. Reference AI, space, and digital transformation. Visionary and inspiring.",
    "warm": "Use empathetic, personal, nurturing language. Focus on community, support, and human connection. Feel-good and caring.",
}

HOOK_TYPE_LABELS: dict[str, str] = {
    "pain_question": "คำถามแทงใจ / Pain question",
    "instant_result": "โชว์ผลลัพธ์ทันที / Instant proof",
    "secret_reveal": "เผยความลับ / Secret reveal",
    "story_open": "เปิดด้วยเรื่องเล่าสั้น",
    "trend_hook": "ผูกเทรนด์ / FOMO",
    "other": "อื่นๆ (ระบุในโน้ตเพิ่ม)",
}

# Short-form ads — output locale for "Localize" button & API
LOCALIZATION_LOCALES: dict[str, str] = {
    "en": "English",
    "en_sg": "English (Singapore — natural local tone; light Singlish ok if fits brand)",
    "es": "Spanish",
    "zh_cn": "Simplified Chinese (Mainland)",
    "zh_tw": "Traditional Chinese (Taiwan / HK style)",
    "vi": "Vietnamese",
    "id": "Indonesian (Bahasa Indonesia)",
    "fil": "Filipino / Tagalog",
    "ms": "Malay (Malaysia)",
    "bn": "Bengali (Bangladesh)",
    "lo": "Lao",
    "my": "Burmese (Myanmar)",
    "th": "Thai (alternative phrasing — same market, fresh wording)",
}

_SOCIAL_PROOF_RE = re.compile(
    r"(รีวิว|ผู้ใช้จริง|ลูกค้าจริง|คนใช้จริง|user review|social proof|##\s*SOCIAL|⭐|⭐️|ดาว\s*\d)",
    re.IGNORECASE,
)


def normalize_structured_brief(raw: dict[str, Any] | None) -> dict[str, Any]:
    if not raw:
        return {}
    return {
        "hook_type": (raw.get("hook_type") or "other").strip(),
        "hook_insight": (raw.get("hook_insight") or "").strip(),
        "problem_solution": (raw.get("problem_solution") or "").strip(),
        "product_service": (raw.get("product_service") or "").strip(),
        "promotion_cta": (raw.get("promotion_cta") or "").strip(),
        "call_to_action": (raw.get("call_to_action") or "").strip(),
        "tiktok_safe_zone": bool(raw.get("tiktok_safe_zone")),
        "extra_notes": (raw.get("extra_notes") or "").strip(),
    }


def validate_structured_brief(sb: dict[str, Any]) -> tuple[bool, str]:
    if not sb:
        return True, ""
    if len(sb.get("hook_insight", "")) < 5:
        return False, "กรุณากรอก Hook Insight (หยุดนิ้วใน 3 วินาที) อย่างน้อย 5 ตัวอักษร"
    if len(sb.get("problem_solution", "")) < 10:
        return False, "กรุณากรอก Problem / Solution ให้ชัดเจน"
    if len(sb.get("product_service", "")) < 2:
        return False, "กรุณาระบุ Product / Service"
    if len(sb.get("call_to_action", "")) < 4:
        return False, "กรุณากรอก Call to Action ที่ต้องการให้ผู้ชมทำ"
    return True, ""


def build_compiled_brief_line(sb: dict[str, Any]) -> str:
    ht = sb.get("hook_type", "other")
    label = HOOK_TYPE_LABELS.get(ht, ht)
    prod = (sb.get("product_service") or "")[:100]
    return f"{prod} | {label}".strip(" |")


def tiktok_viral_formula_addon(sb: dict[str, Any]) -> str:
    promo = sb.get("promotion_cta") or "(ระบุใน CTA ถ้าไม่มีรหัส)"
    cta = sb.get("call_to_action") or ""
    safe = ""
    if sb.get("tiktok_safe_zone"):
        safe = """
VISUAL / FRAME NOTES (TikTok & Reels 9:16 SAFE ZONE):
- ในแต่ละบรรทัดฉาก ให้ใส่ท้ายวงเล็บสั้นๆ เช่น [FRAME: ใบหน้า+CTA กลาง-บน หลบแถบล่าง UI]
- ห้ามวางข้อความสำคัญที่ขอบล่างจอ"""
    return f"""
=== TIKTOK / REELS VIRAL SPINE (บังคับตามลำดับ) ===
1) HOOK 0-3 วินาที — ใช้ Hook Type ที่กำหนด + Hook Insight
2) VALUE — อธิบายปัญหา → ทางออกจากสินค้า/บริการ
3) PRODUCT — เน้นประโยชน์ชัดเจน
4) SOCIAL PROOF (บังคับ) — อย่างน้อย 1 ประโยคสไตล์เสียงลูกค้าจริง / รีวิวสั้น เกี่ยวกับสินค้า
5) CTA (บังคับ) — พูดชัดว่าให้ทำอะไร: {cta}
   และต้องอ้างถึงโปร/ลิงก์ตะกร้าตามที่ให้มา: {promo}

รูปแบบไฟล์:
- ใส่หัวข้อ markdown: ## HOOK, ## VALUE, ## SOCIAL PROOF, ## CTA
- ภายใต้แต่ละหัวข้อ ใส่บรรทัดมี scene marker [0-3s]** ข้อความพูด...
{safe}
"""


def user_message_from_structured(sb: dict[str, Any], spy_report: dict | None) -> str:
    ht = sb.get("hook_type", "other")
    ht_label = HOOK_TYPE_LABELS.get(ht, ht)
    parts = [
        "ข้อมูลแคมเปญ (ห้ามละเลย — ใช้ครบในโครง Hook→Value→Social Proof→CTA):",
        f"- Hook Type: {ht_label}",
        f"- Hook Insight (หยุดนิ้ว ~3 วินาที): {sb.get('hook_insight')}",
        f"- Problem / Solution: {sb.get('problem_solution')}",
        f"- Product / Service: {sb.get('product_service')}",
        f"- Promotion / ลิงก์ตะกร้า / รหัส: {sb.get('promotion_cta') or '—'}",
        f"- Call to Action (พูดตรงตามนี้): {sb.get('call_to_action')}",
    ]
    if sb.get("extra_notes"):
        parts.append(f"- โน้ตเพิ่มเติม: {sb.get('extra_notes')}")
    parts.append("\nเขียนสคริปต์โฆษณาไทยฉบับเต็มตามกติกาด้านบน (พร้อม scene markers และมนุษย์ในทุกฉาก)")
    msg = "\n".join(parts)
    if spy_report:
        msg += f"\n\nบริบทเพิ่ม (spy): {json.dumps(spy_report, ensure_ascii=False)}"
    return msg


def script_has_social_proof_block(script_md: str) -> bool:
    u = script_md.upper()
    if "## SOCIAL" in u or "# SOCIAL" in u:
        return True
    return bool(_SOCIAL_PROOF_RE.search(script_md))


def script_has_cta_coverage(script_md: str, call_to_action: str, promotion_cta: str) -> bool:
    cta = (call_to_action or "").strip()
    promo = (promotion_cta or "").strip()
    if not cta and not promo:
        return True
    ok = False
    if cta and len(cta) >= 3:
        if cta in script_md:
            ok = True
        else:
            toks = [t for t in re.split(r"\s+", cta) if len(t) >= 3]
            if toks and sum(1 for t in toks if t in script_md) >= max(1, len(toks) // 2):
                ok = True
    if promo and len(promo) >= 2 and promo in script_md:
        ok = True
    return ok


def enforce_script_compliance(
    script_md: str,
    structured: dict[str, Any] | None,
    logger: logging.Logger,
) -> tuple[str, list[str]]:
    """
    Auto-แพตช์ถ้า AI ลืม SOCIAL PROOF หรือ CTA — รองรับเป้า 100 คลิป/วัน (เร็ว ไม่ต้องรอรอบแชท)
    """
    if not structured:
        return script_md, []
    sb = normalize_structured_brief(structured)
    if not any(sb.values()):
        return script_md, []
    notes: list[str] = []
    out = script_md.rstrip()

    if not script_has_social_proof_block(out):
        prod = sb.get("product_service", "สินค้านี้")[:60]
        out += (
            "\n\n## SOCIAL PROOF\n"
            f"[22-26s]** ผู้ใช้จริงเล่าว่า \"ลอง{prod} แล้วรู้สึกว่าคุ้มค่า "
            f"ใช้ง่ายจริงๆ\" — ย้ำความน่าเชื่อถือก่อนปิดการขาย\n"
        )
        notes.append("เพิ่มบล็อก SOCIAL PROOF อัตโนมัติ")

    if not script_has_cta_coverage(out, sb.get("call_to_action", ""), sb.get("promotion_cta", "")):
        cta = sb.get("call_to_action", "กดลิงก์ในคอมเมนต์")
        promo = sb.get("promotion_cta", "").strip()
        promo_bit = f" {promo}" if promo else ""
        out += (
            "\n\n## CTA\n"
            f"[34-42s]** {cta}{promo_bit} — พูดชัด ช้าๆ ให้จดได้\n"
        )
        notes.append("เพิ่มบล็อก CTA อัตโนมัติ")

    if notes:
        logger.warning("[Minnie Compliance] %s", "; ".join(notes))
    return out, notes


def generate_script_and_audio(
    video_brief: str,
    spy_report: dict | None,
    logger: logging.Logger,
    tone: str = "professional",
    tier: str = "marketing",
    structured_brief: dict[str, Any] | None = None,
) -> tuple[str | None, str | None, str | None]:
    """
    เรียก Claude/Grok เพื่อสร้างสคริปต์ + เรียก Grok TTS สร้างเสียงพากย์
    
    Returns:
        (script_md, audio_mp3_path, error_message)
    """
    env = _load_env()
    claude_key = env.get("ANTHROPIC_API_KEY", "").strip()
    grok_key = env.get("XAI_API_KEY", "").strip()
    
    # Priority: Claude > Grok > Mock
    script_md = None
    
    tone_instruction = TONE_PROFILES.get(tone.lower(), TONE_PROFILES["professional"])
    sb = normalize_structured_brief(structured_brief) if structured_brief else None
    if sb and not any(sb.values()):
        sb = None

    if claude_key:
        script_md = _call_claude_for_script(
            video_brief,
            spy_report,
            claude_key,
            logger,
            tone_instruction=tone_instruction,
            tier=tier,
            structured_brief=sb,
        )

    if not script_md and grok_key:
        logger.info("[Minnie] Claude ล้มเหลว → ใช้ Grok")
        script_md = _call_grok_for_script(
            video_brief,
            spy_report,
            grok_key,
            logger,
            tone_instruction=tone_instruction,
            tier=tier,
            structured_brief=sb,
        )
    
    if not script_md:
        return (None, None, "ไม่มี API key หรือ API ล้มเหลว")

    if sb:
        script_md, _compliance_notes = enforce_script_compliance(script_md, sb, logger)
    
    # Generate audio with Grok TTS
    audio_path = None
    if grok_key:
        from factory.grok_tts_api import generate_tts
        
        audio_tmp = AQOND_BRAIN / "output" / ".tmp_audio" / f"narration_{int(logger.name.split('_')[-1]) if '_' in logger.name else 0}.mp3"
        audio_tmp.parent.mkdir(parents=True, exist_ok=True)
        
        # Extract narration text (remove scene markers)
        import re
        narration_lines = []
        for line in script_md.split("\n"):
            line = line.strip()
            if line and not line.startswith("#") and not line.startswith("**") and not re.match(r"^\d+\.", line):
                if not re.search(r"\[\d+-\d+s\]", line):
                    narration_lines.append(line)
        
        narration_text = " ".join(narration_lines[:15])  # Max 15 sentences
        
        if narration_text:
            success = generate_tts(narration_text, str(audio_tmp), voice_id="ara", language="th", logger=logger)
            if success and audio_tmp.exists():
                audio_path = str(audio_tmp)
                logger.info("[Minnie] Grok TTS สำเร็จ: %.1f KB", audio_tmp.stat().st_size / 1024)
    
    return (script_md, audio_path, None)


def chat_with_claude_for_edit(
    user_message: str,
    current_script: str,
    logger: logging.Logger
) -> tuple[str, str]:
    """
    Real-time chat กับ Claude/Grok เพื่อแก้ไขสคริปต์
    
    Returns:
        (minnie_response, updated_script)
    """
    env = _load_env()
    claude_key = env.get("ANTHROPIC_API_KEY", "").strip()
    grok_key = env.get("XAI_API_KEY", "").strip()
    
    system_prompt = f"""You are Minnie, an expert Thai advertising script writer.

Current script:
```
{current_script}
```

User feedback: {user_message}

Task: Update the script based on the user's feedback. Return ONLY the updated script in the SAME format (with scene markers [0-5s], etc.). Be concise and professional."""
    
    # Try Claude first
    if claude_key:
        try:
            response = _call_claude_chat(system_prompt, claude_key, logger)
            if response:
                return ("Updated script based on your feedback.", response.strip())
        except Exception as e:
            logger.warning("[Minnie Chat] Claude failed: %s", e)
    
    # Fallback: Grok
    if grok_key:
        try:
            response = _call_grok_chat(system_prompt, grok_key, logger)
            if response:
                return ("Updated via Grok.", response.strip())
        except Exception as e:
            logger.warning("[Minnie Chat] Grok failed: %s", e)
    
    return ("API unavailable — manual edit only.", current_script)


def _normalize_locale_code(raw: str) -> str:
    x = (raw or "").strip().lower().replace("-", "_")
    legacy = {"english": "en", "lao": "lo", "myanmar": "my", "spanish": "es", "chinese": "zh_cn"}
    return legacy.get(x, x)


def localize_script_md(script_md: str, locale_code: str, logger: logging.Logger) -> str:
    """
    Localize (translate + cultural adaptation) a short-form script; preserve scene markers.
    """
    code = _normalize_locale_code(locale_code)
    display = LOCALIZATION_LOCALES.get(code)
    if not display:
        display = locale_code.replace("_", " ").title()

    env = _load_env()
    claude_key = env.get("ANTHROPIC_API_KEY", "").strip()
    grok_key = env.get("XAI_API_KEY", "").strip()
    api_key = claude_key or grok_key
    use_claude = bool(claude_key)

    prompt = f"""You are Minnie, expert short-form video script LOCALIZATION specialist (not literal translation).

Target language / market: {display}

Rules:
1. Preserve ALL scene timing markers exactly, e.g. [0-3s], [4-10s], [FRAME: ...] if present.
2. Keep markdown structure (## HOOK, ## VALUE, ## SOCIAL PROOF, ## CTA, scene lists).
3. Adapt idioms, currency, address style, and CTAs for the target locale; keep brand name unless instructed otherwise.
4. Same emotional arc: Hook → Problem → Solution → Social proof → CTA.
5. Output ONLY the localized script — no preamble.

Source script:
{script_md}"""

    try:
        if use_claude:
            payload = {
                "model": "claude-sonnet-4-6",
                "max_tokens": 4000,
                "messages": [{"role": "user", "content": prompt}],
            }
            req = Request(
                "https://api.anthropic.com/v1/messages",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
            )
            with urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                text = data.get("content", [{}])[0].get("text", "").strip()
        else:
            payload = {
                "model": "grok-3",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 4000,
            }
            req = Request(
                "https://api.x.ai/v1/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
            with urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                text = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()

        if text:
            logger.info("[Minnie Localize] → %s (%d chars)", code, len(text))
            return text
        return f"[Localization failed for {display}]"
    except Exception as e:
        logger.error("[Minnie Localize] %s: %s", code, e)
        return f"[Error localizing to {display}: {str(e)[:120]}]"


def translate_script(
    script_md: str,
    target_languages: list[str],
    logger: logging.Logger,
) -> dict[str, str]:
    """
    Back-compat: localize to one or more locales. Keys in the returned dict match
    the input tokens (normalized to our locale codes where applicable).
    """
    results: dict[str, str] = {}
    for lang in target_languages:
        code = _normalize_locale_code(str(lang))
        results[str(lang)] = localize_script_md(script_md, code, logger)
    return results


def _call_claude_for_script(
    brief: str,
    spy_report: dict | None,
    api_key: str,
    logger: logging.Logger,
    tone_instruction: str = "",
    tier: str = "marketing",
    structured_brief: dict[str, Any] | None = None,
) -> str | None:
    """Call Claude API for script generation"""

    tier_addon = ""
    if tier.lower() == "tutorial":
        tier_addon = """
TUTORIAL TIER rules:
- Number every step clearly (Step 1, Step 2...)
- Include UI zoom callouts: [ZOOM: show button X]
- Add screen markers: [SCREEN: dashboard view]
- Pace: minimum 3s per step
- End with clear "Now you can..." result statement"""

    viral_addon = ""
    if structured_brief:
        viral_addon = tiktok_viral_formula_addon(structured_brief)

    system = f"""You are Minnie, a Thai script writer for Aqond (AI-powered online university app).

Tone of voice: {tone_instruction}

Write a 30-45 second video script in Thai with:
- Strong hook (0-5s)
- Problem/solution (5-25s)
- Features + pricing (25-35s)
- CTA (35-45s)

Include scene markers: [0-5s], [6-12s], etc.
HUMAN REPRESENTATION required in every scene (e.g., "young professional using laptop").
{tier_addon}
{viral_addon}"""

    if structured_brief:
        user_msg = user_message_from_structured(structured_brief, spy_report)
    else:
        user_msg = f"Video brief: {brief}\n\nCreate a compelling Thai script."
        if spy_report:
            user_msg += f"\n\nContext: {json.dumps(spy_report, ensure_ascii=False)}"
    
    payload = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 2000,
        "system": system,
        "messages": [{"role": "user", "content": user_msg}]
    }
    
    try:
        req = Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
        )
        
        with urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            text = result.get("content", [{}])[0].get("text", "").strip()
            if text:
                logger.info("[Minnie Claude] Script generated (%d chars)", len(text))
                return text
    
    except HTTPError as e:
        body = e.read().decode("utf-8") if hasattr(e, "read") else str(e)
        logger.error("[Minnie Claude] HTTP %d: %s", e.code, body[:500])
    except Exception as e:
        logger.error("[Minnie Claude] %s", e)
    
    return None


def _call_grok_for_script(
    brief: str,
    spy_report: dict | None,
    api_key: str,
    logger: logging.Logger,
    tone_instruction: str = "",
    tier: str = "marketing",
    structured_brief: dict[str, Any] | None = None,
) -> str | None:
    """Call Grok API for script generation"""
    tier_note = ""
    if tier.lower() == "tutorial":
        tier_note = "Tutorial tier: numbered steps, [ZOOM:] [SCREEN:] markers, slower pace per step."

    viral = tiktok_viral_formula_addon(structured_brief) if structured_brief else ""

    system = f"""You are Minnie, a Thai advertising script writer for Aqond.
Tone: {tone_instruction or 'professional'}
Write a 30-45 second video ad script in Thai with scene markers [0-5s], [6-12s], etc.
HUMAN REPRESENTATION required in every scene.
{tier_note}
{viral}"""

    if structured_brief:
        user_msg = user_message_from_structured(structured_brief, spy_report)
    else:
        user_msg = f"Brief: {brief}\n\nCreate Thai advertisement script."
        if spy_report:
            user_msg += f"\n\nContext: {json.dumps(spy_report, ensure_ascii=False)}"
    
    payload = {
        "model": "grok-3",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg}
        ],
        "max_tokens": 2000
    }
    
    try:
        req = Request(
            "https://api.x.ai/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
        )
        
        with urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            text = result.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            if text:
                logger.info("[Minnie Grok] Script generated (%d chars)", len(text))
                return text
    
    except HTTPError as e:
        body = e.read().decode("utf-8") if hasattr(e, "read") else str(e)
        logger.error("[Minnie Grok] HTTP %d: %s", e.code, body[:500])
    except Exception as e:
        logger.error("[Minnie Grok] %s", e)
    
    return None


def _call_claude_chat(prompt: str, api_key: str, logger: logging.Logger) -> str | None:
    """Simple Claude chat call for script editing"""
    payload = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 2000,
        "messages": [{"role": "user", "content": prompt}]
    }
    
    try:
        req = Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
        )
        
        with urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result.get("content", [{}])[0].get("text", "").strip()
    
    except Exception as e:
        logger.error("[Claude Chat] %s", e)
        return None


def _call_grok_chat(prompt: str, api_key: str, logger: logging.Logger) -> str | None:
    """Simple Grok chat call for script editing"""
    payload = {
        "model": "grok-3",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 2000
    }
    
    try:
        req = Request(
            "https://api.x.ai/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
        )
        
        with urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    
    except Exception as e:
        logger.error("[Grok Chat] %s", e)
        return None


def _coerce_brainstorm_item(raw: dict[str, Any]) -> dict[str, Any]:
    """Fill weak AI rows so validate_structured_brief passes."""
    x = dict(raw) if isinstance(raw, dict) else {}
    if len((x.get("hook_insight") or "").strip()) < 5:
        x["hook_insight"] = "ทำไมต้องเริ่มเรียนทักษะนี้วันนี้ — ก่อนพลาดโอกาส?"
    if len((x.get("problem_solution") or "").strip()) < 10:
        x["problem_solution"] = (
            "หลายคนยังลังเลเรื่องเวลาและต้นทุน — คอร์สออนไลน์ช่วยให้เริ่มได้จริงแบบย่อยส่วน"
        )
    if len((x.get("product_service") or "").strip()) < 2:
        x["product_service"] = "Aqond — เรียนออนไลน์สายดิจิทัล"
    if len((x.get("call_to_action") or "").strip()) < 4:
        x["call_to_action"] = "กดลิงก์ในคอมเมนต์และลงทะเบียนวันนี้"
    if not (x.get("promotion_cta") or "").strip():
        x["promotion_cta"] = "รหัส AQOND — ลดพิเศษที่ลิงก์โปรไฟล์"
    ht = (x.get("hook_type") or "trend_hook").strip()
    if ht not in HOOK_TYPE_LABELS:
        ht = "trend_hook"
    x["hook_type"] = ht
    x["tiktok_safe_zone"] = bool(x.get("tiktok_safe_zone", True))
    return normalize_structured_brief(x)


def _brainstorm_fallback_from_signals(
    heat: list[dict[str, Any]],
    news: list[dict[str, Any]],
    count: int,
) -> list[dict[str, Any]]:
    topics = [str(h.get("topic") or "การเรียนออนไลน์") for h in heat[:10]]
    if not topics:
        topics = ["AI", "Python", "การตลาดดิจิทัล", "งานไกล", "เรียนฟรี", "Data", "Excel", "ภาษาอังกฤษ"]
    hooks = ["trend_hook", "pain_question", "instant_result", "secret_reveal", "story_open", "other"]
    titles = [str(n.get("title") or "")[:80] for n in news[:6] if n.get("title")]
    out: list[dict[str, Any]] = []
    for i in range(count):
        t = topics[i % len(topics)]
        hint = titles[i % len(titles)] if titles else ""
        out.append(
            normalize_structured_brief(
                {
                    "hook_type": hooks[i % len(hooks)],
                    "hook_insight": f"เทรนด์ {t}: หยุดสไลด์ใน 3 วินาที — {hint or 'ทำไมตอนนี้ต้องลงมือ?'}",
                    "problem_solution": f"คนส่วนใหญ่ยังไม่รู้จุดเริ่มที่ถูก — {t} ช่วยให้เห็นภาพและลงมือได้จริง",
                    "product_service": f"Aqond — {t}",
                    "promotion_cta": f"รหัส AQOND{i % 97} — โปรพิเศษที่ลิงก์โปรไฟล์",
                    "call_to_action": "กดลิงก์ ลงทะเบียน และเริ่มเรียนวันนี้",
                    "tiktok_safe_zone": True,
                    "extra_notes": "สร้างอัตโนมัติจาก Navy (fallback)",
                }
            )
        )
    return out


def _navy_performance_digest_for_daily(
    production_manager: Any,
    logger: logging.Logger,
    *,
    view_threshold: int = 10000,
    scan_limit: int = 100,
) -> tuple[str, str, list[str]]:
    """สรุปเมตริกจาก get_post_performance_by_project ต่อโปรเจกต์ → ข้อความแนบ prompt brainstorm"""
    from factory.navy_agent import get_post_performance_by_project

    rows: list[dict[str, Any]] = []
    try:
        plist = sorted(
            production_manager.list_projects(),
            key=lambda x: (getattr(x, "updated_at", None) or ""),
            reverse=True,
        )[:scan_limit]
    except Exception:
        plist = []

    for p in plist:
        st = getattr(getattr(p, "state", None), "value", None) or str(getattr(p, "state", ""))
        if st not in ("done", "approved", "qc", "editing", "visual_paused", "visual_gen"):
            continue
        pid = getattr(p, "project_id", None) or str(p)
        try:
            perf = get_post_performance_by_project(pid, logger)
            plats = perf.get("platforms") or []
            max_v = max((int(x.get("views") or 0) for x in plats), default=0)
        except Exception:
            continue
        sb = getattr(p, "structured_brief", None) or {}
        if not isinstance(sb, dict):
            sb = {}
        rows.append(
            {
                "project_id": pid,
                "max_views": max_v,
                "hook": (sb.get("hook_insight") or "")[:140],
                "product": (sb.get("product_service") or "")[:100],
                "hook_type": sb.get("hook_type") or "",
                "navy_hint": str(perf.get("summary_hint") or "")[:100],
            }
        )

    rows.sort(key=lambda x: -x["max_views"])
    winners = [r for r in rows if r["max_views"] >= view_threshold]
    use_rows = winners[:10] if winners else rows[:8]

    if not use_rows:
        return "", "ยังไม่มีโปรเจกต์ในสถานะที่สแกนเมตริกได้", []

    label = (
        f"คลิปที่ snapshot สูงกว่า {view_threshold:,} วิว ({len(winners)} โปรเจกต์)"
        if winners
        else (
            f"ท็อปคลิปยังไม่ถึง {view_threshold:,} วิว — ใช้ท็อป {len(use_rows)} รายการ "
            "(ตัวเลขจาก Navy module เดียวกับ Thomas; ต่อ API โซเชียลจริงเมื่อพร้อม)"
        )
    )
    lines = [
        f"- {r['project_id']}: สูงสุด ~{r['max_views']:,} วิว (max แพลตฟอร์ม) | hook: {r['hook']} | "
        f"สินค้า/มุม: {r['product']} | hook_type: {r['hook_type']} | Navy: {r['navy_hint']}"
        for r in use_rows
    ]
    digest = (
        "=== ANALYTICS (get_post_performance_by_project — เดียวกับ Thomas Check Stats) ===\n"
        + "\n".join(lines)
        + "\n\nสิ่งที่ต้องทำ: วิเคราห์จุดร่วมของคลิปที่มียอดสูง (hook angle, ปัญหา-ทางออก, โทน CTA, ประเภทสินค้า) "
        "แล้วสร้าง brief ชุดใหม่ที่ต่อยอด pattern เหล่านี้ — หลากหลาย ไม่คัดลอกต้นฉบับ\n"
        f"หมายเหตุ: {label}."
    )
    return digest, label, [str(r["project_id"]) for r in use_rows]


def brainstorm_structured_briefs_from_navy(
    logger: logging.Logger,
    *,
    count: int = 10,
    tier: str = "marketing",
    extra_context: str = "",
) -> tuple[list[dict[str, Any]], str]:
    """
    Navy RSS + heatmap → N structured briefs. Claude/Grok JSON if keys exist, else template.
    """
    from factory.navy_agent import get_trend_heatmap, scrape_rss_feeds

    count = max(3, min(20, int(count)))
    news = scrape_rss_feeds(logger)
    heat = get_trend_heatmap(news, logger)
    trend_lines = "\n".join(
        f"- {h.get('topic', '')} (score {h.get('score', '')}): {str(h.get('description', ''))[:90]}"
        for h in heat[:14]
    )
    headlines = "\n".join(f"- {str(n.get('title', ''))[:110]}" for n in news[:18])

    prompt = f"""You are Minnie planning Thai short-form video ads for Aqond (online education app).

NAVY HEADLINES:
{headlines}

NAVY TREND SIGNALS:
{trend_lines}

Tier: {tier} (marketing = punchy ad; tutorial = how-to / step vibe).

Return ONLY a JSON array of exactly {count} objects. Each object keys:
hook_type (one of: trend_hook, pain_question, instant_result, secret_reveal, story_open, other),
hook_insight, problem_solution, product_service, promotion_cta, call_to_action,
tiktok_safe_zone (boolean), extra_notes (optional string).

All human-readable text in Thai except URLs or promo codes. Vary hooks and products. No markdown fences."""

    env = _load_env()
    claude_key = env.get("ANTHROPIC_API_KEY", "").strip()
    grok_key = env.get("XAI_API_KEY", "").strip()

    raw_text = ""
    if claude_key:
        raw_text = _call_claude_chat(
            prompt + "\n\nOutput: JSON array only.",
            claude_key,
            logger,
        ) or ""
    if not raw_text.strip() and grok_key:
        payload = {
            "model": "grok-3",
            "messages": [{"role": "user", "content": prompt + "\n\nOutput: JSON array only."}],
            "max_tokens": 3500,
        }
        try:
            req = Request(
                "https://api.x.ai/v1/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {grok_key}",
                    "Content-Type": "application/json",
                },
            )
            with urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                raw_text = (
                    result.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                )
        except Exception as e:
            logger.warning("[Minnie Brainstorm] Grok failed: %s", e)

    ideas: list[dict[str, Any]] = []
    source = "ai"

    if raw_text.strip():
        text = raw_text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```\w*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
        try:
            s, e2 = text.find("["), text.rfind("]") + 1
            if s >= 0 and e2 > s:
                arr = json.loads(text[s:e2])
                if isinstance(arr, list):
                    for item in arr:
                        if isinstance(item, dict):
                            nb = _coerce_brainstorm_item(item)
                            ok, _ = validate_structured_brief(nb)
                            if ok:
                                ideas.append(nb)
        except Exception as ex:
            logger.warning("[Minnie Brainstorm] parse: %s", ex)

    if len(ideas) < max(3, count // 3):
        source = "navy_template"
        ideas = _brainstorm_fallback_from_signals(heat, news, count)
    elif len(ideas) > count:
        ideas = ideas[:count]

    return ideas, source


def _yesterday_posted_project_ids(logger: logging.Logger) -> tuple[str, list[str]]:
    """โซนเวลาไทย — โปรเจกต์ที่ schedule บันทึกว่า posted เมื่อวาน"""
    import datetime as dt

    th = dt.timezone(dt.timedelta(hours=7))
    today = dt.datetime.now(th).date()
    yday = today - dt.timedelta(days=1)
    ids: list[str] = []
    sched = AQOND_BRAIN / "output" / "schedule.json"
    if not sched.exists():
        return ("ยังไม่มี schedule.json", ids)
    try:
        entries = json.loads(sched.read_text(encoding="utf-8"))
    except Exception:
        return ("อ่าน schedule ไม่ได้", ids)
    for e in entries:
        if e.get("status") != "posted":
            continue
        st = e.get("schedule_time") or ""
        try:
            d = dt.datetime.fromisoformat(st.replace("Z", "+00:00"))
            if d.tzinfo is None:
                d = d.replace(tzinfo=th)
            if d.astimezone(th).date() == yday:
                pid = str(e.get("project_id") or "").strip()
                if pid and pid not in ids:
                    ids.append(pid)
        except Exception:
            continue
    if ids:
        return (f"เมื่อวานโพสต์แล้ว {len(ids)} คลิป — ต่อยอดแนวเดิมได้", ids)
    logger.info("[Minnie Daily] No posted entries yesterday in schedule.json")
    return ("เมื่อวานยังไม่มีโพสต์ในบันทึก — ใช้เทรนด์ Navy วันนี้แทน", ids)


def daily_extension_suggestions(
    logger: logging.Logger,
    production_manager: Any | None = None,
    *,
    count: int = 5,
) -> tuple[list[dict[str, Any]], str, str, dict[str, Any]]:
    """
    Pop-up รายวัน: brief ต่อยอด — ผสม Navy analytics (get_post_performance_by_project) + เมื่อวานจาก schedule
    """
    count = max(3, min(10, int(count)))
    line_y, y_ids = _yesterday_posted_project_ids(logger)
    meta: dict[str, Any] = {
        "yesterday_project_ids": y_ids,
        "analytics_label": "",
        "analytics_top_ids": [],
        "digest_used": False,
    }

    extra = ""
    if production_manager is not None:
        digest, a_label, top_ids = _navy_performance_digest_for_daily(
            production_manager, logger, view_threshold=10000, scan_limit=100
        )
        meta["analytics_label"] = a_label
        meta["analytics_top_ids"] = top_ids
        if digest:
            extra = "\n\n" + digest
            meta["digest_used"] = True
    if y_ids:
        extra += (
            f"\n\nเมื่อวานโพสต์แล้ว project_ids: {', '.join(y_ids[:15])} — "
            "ถ้าสอดคล้องกับ analytics ด้านบน ให้ต่อยอดธีมคลิปเหล่านี้"
        )

    ideas, src = brainstorm_structured_briefs_from_navy(
        logger, count=count, tier="marketing", extra_context=extra
    )
    if meta["digest_used"]:
        tag = "Navy analytics (views) + เมื่อวาน"
    elif y_ids:
        tag = "ต่อยอดหลังโพสต์เมื่อวาน (schedule)"
    else:
        tag = "เทรนด์วันนี้ (Navy)"
    for idea in ideas:
        base = (idea.get("extra_notes") or "").strip()
        prefix = f"{tag}: {(meta.get('analytics_label') or line_y)[:120]}"
        idea["extra_notes"] = (prefix + (" | " + base if base else ""))[:500]
    summary = f"วันนี้มี {len(ideas)} ไอเดีย — {meta.get('analytics_label') or 'Navy'}. {line_y}"
    return ideas, src, summary, meta
