"""Flow 2 scene images — 9:16 vertical, Thai UI text + negative prompt"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

from factory.hook_factory import load_env
from factory.local_image import generate_local_image, should_try_openai, uses_sd_webui
from factory.post_image import _grok_image, get_reference_context
from factory.flow2_reel_compose import create_reel_end_background

REEL_W, REEL_H = 1080, 1920
REEL_RATIO = REEL_W / REEL_H  # 9:16

# Negative prompt รวม — ฝังใน prompt ก่อนเรียก API
REEL_NEGATIVE_PROMPT = (
    "AVOID / NEGATIVE: garbled unreadable text, wrong alphabet, fake Thai glyphs, "
    "broken vowels or tone marks, English-only UI when Thai is required, "
    "Chinese Japanese Korean characters on Thai app screen, random letters, "
    "misspelled Thai words, blurry phone screen text, watermark logo, "
    "deformed hands extra fingers, distorted faces, low resolution, "
    "cartoon anime unless requested, cluttered messy UI, duplicate limbs"
)

SCENARIO_THAI_UI: dict[str, list[str]] = {
    "advance_job": [
        "รับเหมาโดนเบี้ยวเงิน?",
        "Advance Job · Job Board",
        "เงินปลอดภัย · ตัวกลางดูแล",
        "โปรแกรมเมอร์ · การตลาด · ดูแลผู้สูงอายุ",
        "app.aqond.com · สมัครฟรี",
    ],
    "video_feed": [
        "โชว์ฝีมือผ่านคลิป",
        "Video Feed Hiring",
        "อัปคลิปรับงานเร็วขึ้น",
        "นายจ้างดูคลิปก่อนจ้าง",
        "app.aqond.com · ลงทะเบียนฟรี",
    ],
    "matchjob": [
        "กลัวโดนนายจ้างโกง?",
        "MatchJob · ตรวจก่อนรับ",
        "รีวิวจริง · ยืนยันตัวตน",
        "ปลอดภัยกว่าเดิม",
        "app.aqond.com",
    ],
    "insurance": [
        "พรบ. หมดอายุ?",
        "ต่อ พรบ. ในแอป",
        "ส่วนลดพิเศษ",
        "ทำในแอปเดียวจบ",
        "app.aqond.com",
    ],
    "repair": [
        "ช่างโดนเบี้ยวค่าจ้าง?",
        "ตรวจนายจ้างก่อนรับงาน",
        "มีสัญญา · มีหลักฐาน",
        "รับงานมั่นใจขึ้น",
        "app.aqond.com",
    ],
    "maid": [
        "ทำงานแล้วไม่ได้เงินครบ?",
        "สัญญางานชัดเจน",
        "บันทึกเวลาทำงาน",
        "แม่บ้านไว้ใจ AQOND",
        "app.aqond.com",
    ],
    "driver": [
        "รับงานแล้วไม่แน่ใจ?",
        "รู้ราคาก่อนออกรถ",
        "ตรวจงานในแอป",
        "จบงานรับเงินตรง",
        "app.aqond.com",
    ],
    "friend": [
        "รับงานออนไลน์ยังไง?",
        "เพื่อนแนะนำ AQOND",
        "ตรวจก่อนรับงาน",
        "ปลอดภัยกว่าเดิม",
        "app.aqond.com",
    ],
}

DEFAULT_THAI_UI = [
    "รับงานกลัวโดนโกง?",
    "AQOND ตรวจงานก่อนรับ",
    "เงินปลอดภัย มีสัญญา",
    "คนไทยไว้ใจ AQOND",
    "app.aqond.com · ดาวน์โหลดฟรี",
]


def _thai_ui_text(scenario: str, scene_num: int, vo: str) -> str:
    lines = SCENARIO_THAI_UI.get(scenario) or DEFAULT_THAI_UI
    idx = min(scene_num - 1, len(lines) - 1)
    primary = lines[idx]
    snippet = vo[:40].strip() if vo else ""
    return (
        f'On-screen Thai text (ภาษาไทย อ่านได้ชัด ตัวอักษรถูกต้อง): "{primary}"'
        + (f' และข้อความรอง: "{snippet}"' if snippet and snippet not in primary else "")
    )


def _build_end_scene_prompt(
    visual: str,
    vo: str,
    scenario: str,
    job_id: int,
    topic: str,
    seed: int,
) -> str:
    """ฉาก 5 — พื้นหลังสะอาด โลโก้+QR จะวางทับจากไฟล์จริงหลัง gen"""
    parts = [
        "Native vertical 9:16 (1080×1920) CLOSING CARD for Thai app AQOND marketing reel.",
        "Full frame 9:16 — keep composition inside safe margins for post overlays.",
        f"Scenario: {scenario} | Campaign: {topic}",
        f"Visual mood (background only): {visual}",
        f"Emotional tone from voiceover: {vo[:120]}",
        f"Creative seed {seed}.",
        "Thai professional smiling confidently OR soft premium gradient brand background.",
        "Photorealistic, trustworthy, clean composition.",
        "",
        "=== CRITICAL — DO NOT RENDER ===",
        "NO text, NO letters, NO QR codes, NO barcodes, NO logos, NO watermarks, NO app UI mockup.",
        "Logo, QR code and Thai CTA text will be added in post-production — keep corners clean.",
        "Leave top-right corner clear (for logo overlay).",
        "Leave bottom-right corner clear (for QR overlay).",
        "Leave bottom-left area clear (for CTA text panel).",
        "",
        "=== NEGATIVE PROMPT ===",
        REEL_NEGATIVE_PROMPT,
        "EXTRA: fake QR code, scannable barcode, company logo, readable text, typography",
    ]
    return "\n".join(parts)


# English-only visuals for SD 1.5 — ห้ามอ้าง phone/UI/text (subtitle ใส่ทีหลัง)
SCENARIO_SD_SCENE: dict[str, list[str]] = {
    "driver": [
        "POV from sedan car driver seat at night, hands on steering wheel, city street lights through windshield, cinematic moody blue lighting, photorealistic",
        "Asian male rideshare driver standing beside white sedan at night, worried expression, street lamp, wet pavement reflections, cinematic portrait",
        "confident Asian driver smiling inside modern sedan car, golden hour sunlight through window, clean car interior, portrait photography",
        "happy Asian driver relaxed in parked sedan, daylight, satisfied expression, shallow depth of field, no devices visible",
    ],
    "matchjob": [
        "young Thai professional looking at laptop in modern office, concerned expression, soft window light, photorealistic",
        "office worker reading documents with skeptical expression, cinematic lighting, corporate environment",
        "Thai professional smiling at desk, confident posture, bright modern workspace, natural light",
        "happy Thai employee handshake with colleague, successful meeting, warm office lighting",
    ],
    "advance_job": [
        "freelancer at home desk looking worried at empty wallet concept, moody lighting, photorealistic",
        "contractor reviewing papers with uncertain expression, construction site background blur",
        "professional smiling at organized desk, secure confident mood, bright lighting",
        "freelancer celebrating completed project, laptop closed, satisfied expression, golden hour",
    ],
    "video_feed": [
        "content creator holding camera in studio, confident smile, ring light, photorealistic portrait",
        "person recording video on tripod, focused expression, modern room, cinematic",
        "creator reviewing footage on monitor from behind, screen content not visible, bright studio",
        "successful creator thumbs up, professional studio setup, warm lighting",
    ],
    "friend": [
        "two young Thai friends chatting at cafe, one explaining something, warm ambient light",
        "person listening skeptically at coffee shop, casual clothing, natural light",
        "friends smiling together outdoors, friendly trustworthy mood, daylight",
        "person recommending something to friend, happy gesture, urban park background",
    ],
}


def _sd_scene_visual(scenario: str, scene_num: int, visual: str) -> str:
    lines = SCENARIO_SD_SCENE.get(scenario)
    if lines and 1 <= scene_num <= len(lines):
        return lines[scene_num - 1]
    return (
        f"professional photorealistic marketing photo, {scenario} theme, "
        "cinematic lighting, Southeast Asia, trustworthy mood, no text no logo no devices"
    )


def _build_sd_scene_prompt(
    visual: str,
    vo: str,
    scenario: str,
    scene_num: int,
    job_id: int,
    topic: str,
    attach_subtitles: bool = True,
) -> str:
    """Prompt สำหรับ SD 1.5 — English-only, ไม่มี UI/ข้อความ (subtitle ใส่ทีหลัง)"""
    ref_brief, _, _ = get_reference_context("flow2")
    sd_visual = _sd_scene_visual(scenario, scene_num, visual)

    parts = [
        sd_visual,
        "vertical 9:16 portrait composition, full body or medium shot,",
        "shot on Sony A7IV, 35mm f/1.8, shallow depth of field, natural colors,",
        "NO text, NO letters, NO phone, NO screen, NO UI, NO logo, NO watermark, NO QR.",
    ]
    if attach_subtitles:
        parts.append("Leave bottom 18% relatively clear and uncluttered for subtitle overlay.")
    if ref_brief:
        parts.append("Reference:\n" + ref_brief[:800])
    parts.extend(["", "=== NEGATIVE ===", REEL_NEGATIVE_PROMPT])
    return "\n".join(parts)


def build_reel_scene_prompt(
    visual: str,
    vo: str,
    scenario: str,
    scene_num: int,
    job_id: int,
    topic: str,
    attach_subtitles: bool = True,
    *,
    sd_local: bool = False,
) -> str:
    ref_brief, _, _ = get_reference_context("flow2")
    seed = job_id * 7919 + scene_num * 997 + int(time.time()) % 1000

    if scene_num == 5:
        return _build_end_scene_prompt(visual, vo, scenario, job_id, topic, seed)

    if sd_local:
        return _build_sd_scene_prompt(
            visual, vo, scenario, scene_num, job_id, topic, attach_subtitles
        )

    thai_ui = _thai_ui_text(scenario, scene_num, vo)

    parts = [
        "Native vertical 9:16 portrait (1080×1920) marketing frame for Thai app AQOND.",
        "Composition MUST fit full 9:16 canvas — keep all Thai text inside center 84% safe zone, "
        "away from top/bottom/left/right edges (8% margin).",
        f"Scene {scene_num}/5 — scenario: {scenario}",
        f"Campaign: {topic}",
        f"Visual direction: {visual}",
        f"Mood from voiceover: {vo[:180]}",
        f"Creative seed {seed} — visually distinct from other scenes.",
        "Thai professional context, trustworthy, premium lighting, photorealistic.",
        "",
        "=== THAI TEXT ON IMAGE (สำคัญ) ===",
        thai_ui,
        "If showing smartphone/app UI: render crisp legible Thai script (ภาษาไทย) "
        "with correct vowels and tone marks — looks like real Thai app screenshot.",
        "Typography: modern Thai sans-serif, high contrast on screen, sharp not blurry.",
        "Do NOT use English-only labels on app screens unless paired with Thai.",
        "",
        "=== BRAND RULES ===",
        "Small AQOND branding acceptable on phone mockup only.",
        "NO random watermarks, NO stock photo logos, NO QR codes.",
    ]

    if attach_subtitles:
        parts.append("Leave bottom 15% relatively clear for optional subtitle overlay.")
    else:
        parts.append("Full frame composition OK — no subtitle bar needed.")

    if ref_brief:
        parts.append("Reference from uploads (creative direction only):\n" + ref_brief[:1500])

    parts.extend(["", "=== NEGATIVE PROMPT ===", REEL_NEGATIVE_PROMPT])
    return "\n".join(parts)


def generate_reel_scene_image(
    visual: str,
    vo: str,
    scenario: str,
    scene_num: int,
    job_id: int,
    topic: str,
    output_path: Path,
    logger: logging.Logger,
    attach_subtitles: bool = True,
) -> dict[str, Any]:
    sd_mode = uses_sd_webui()
    if sd_mode and not attach_subtitles:
        attach_subtitles = True
        logger.info("[Flow2] A1111 mode — subtitles enabled (SD cannot render Thai text)")

    if sd_mode and scene_num == 5:
        meta: dict[str, Any] = {
            "source": None,
            "error": None,
            "prompt_preview": "end_scene:compose_bg",
            "thai_ui": _thai_ui_text(scenario, scene_num, vo)[:120],
        }
        if create_reel_end_background(
            output_path, scenario=scenario, visual=visual, logger=logger
        ):
            meta["source"] = "compose:end_bg"
            meta["fit"] = "native_1080x1920"
            return meta
        meta["error"] = "end_bg_failed"

    prompt = build_reel_scene_prompt(
        visual, vo, scenario, scene_num, job_id, topic, attach_subtitles, sd_local=sd_mode
    )
    meta: dict[str, Any] = {
        "source": None,
        "error": None,
        "prompt_preview": prompt[:300],
        "thai_ui": _thai_ui_text(scenario, scene_num, vo)[:120],
    }

    local_ok, local_detail = generate_local_image(
        prompt,
        output_path,
        logger,
        negative=REEL_NEGATIVE_PROMPT,
        flow="flow2",
    )
    if local_ok:
        fit = _fit_to_reel_916(output_path, output_path, crop_anchor="center")
        meta["source"] = local_detail
        meta["fit"] = fit
        return meta
    meta["error"] = local_detail

    if should_try_openai():
        openai_prompt = (
            build_reel_scene_prompt(
                visual, vo, scenario, scene_num, job_id, topic, attach_subtitles, sd_local=False
            )
            if sd_mode
            else prompt
        )
        ok, detail, fit = _openai_reel_image(openai_prompt, output_path, logger, load_env())
        if ok:
            meta["source"] = f"openai:{detail}"
            meta["fit"] = fit
            return meta
        meta["error"] = detail
    elif not local_ok:
        meta["error"] = meta.get("error") or "openai:skipped_by_policy"

    if _grok_image(prompt, output_path, logger):
        fit = _fit_to_reel_916(output_path, output_path, crop_anchor="top")
        meta["source"] = "grok"
        meta["fit"] = fit
        return meta

    try:
        from factory.stock_images import download_stock_image, get_stock_image_url

        idx = (job_id * 7 + scene_num * 3 + abs(hash(visual)) % 20) % 50
        url = get_stock_image_url(idx)
        if download_stock_image(url, str(output_path)):
            fit = _fit_to_reel_916(output_path, output_path, crop_anchor="center")
            meta["source"] = f"stock:{idx}"
            meta["fit"] = fit
            logger.warning("[Flow2] Scene %s used stock fallback idx=%s", scene_num, idx)
            return meta
    except Exception as e:
        meta["error"] = str(e)

    meta["source"] = "failed"
    return meta


def _openai_reel_image(
    prompt: str,
    output_path: Path,
    logger: logging.Logger,
    env: dict[str, str],
) -> tuple[bool, str, str]:
    """Gen ภาพ 9:16 โดยตรง — หลีกเลี่ยง square ที่ตัดข้อความ"""
    key = env.get("OPENAI_API_KEY", "").strip()
    if not key:
        return False, "no OPENAI_API_KEY", ""

    preferred = env.get("FLOW2_IMAGE_MODEL") or env.get("FLOW1_IMAGE_MODEL", "gpt-image-1")
    # ลำดับ: 9:16 จริงก่อน → portrait ใกล้เคียง → square สุดท้าย (crop เน้นบน)
    size_plan: list[tuple[str, str, str]] = [
        ("dall-e-3", "1024x1792", "resize_only"),
        (preferred, "1024x1536", "resize_only"),
        ("gpt-image-1", "1024x1536", "resize_only"),
        ("dall-e-3", "1024x1024", "crop_top"),
        (preferred, "1024x1024", "crop_top"),
    ]
    seen: set[tuple[str, str]] = set()
    ordered: list[tuple[str, str, str]] = []
    for model, size, fit in size_plan:
        key_pair = (model, size)
        if key_pair not in seen:
            seen.add(key_pair)
            ordered.append((model, size, fit))

    try:
        from openai import OpenAI

        client = OpenAI(api_key=key)
    except Exception as e:
        return False, str(e), ""

    last_err = ""
    for model, size, fit_mode in ordered:
        try:
            kwargs: dict[str, Any] = {"model": model, "prompt": prompt[:4000], "n": 1, "size": size}
            if model == "dall-e-3":
                kwargs["quality"] = "standard"
            resp = client.images.generate(**kwargs)
            if not resp.data:
                continue
            item = resp.data[0]
            tmp = output_path.parent / f"_tmp_{output_path.name}"
            from factory.post_image import _save_b64_or_url

            if not _save_b64_or_url(item, tmp):
                last_err = f"{model}: empty"
                continue

            anchor = "top" if fit_mode == "crop_top" else "center"
            fit = _fit_to_reel_916(tmp, output_path, crop_anchor=anchor)
            tmp.unlink(missing_ok=True)

            if output_path.stat().st_size > 5000:
                logger.info("[Flow2] Scene image OpenAI %s %s → %s", model, size, fit)
                return True, f"{model}:{size}", fit
            last_err = f"{model}: too small"
        except Exception as e:
            last_err = f"{model}/{size}: {e}"
            logger.warning("[Flow2] OpenAI %s %s failed: %s", model, size, e)
    return False, last_err, ""


def _fit_to_reel_916(
    src: Path,
    dest: Path,
    crop_anchor: str = "center",
) -> str:
    """ปรับเป็น 1080×1920 (9:16) — resize ถ้าสัดส่วนใกล้เคียง, crop น้อยที่สุดถ้าจำเป็น"""
    try:
        from PIL import Image

        img = Image.open(src).convert("RGB")
        w, h = img.size
        current = w / h
        tolerance = 0.025

        if abs(current - REEL_RATIO) <= tolerance:
            img = img.resize((REEL_W, REEL_H), Image.Resampling.LANCZOS)
            dest.parent.mkdir(parents=True, exist_ok=True)
            img.save(dest, format="PNG", optimize=True)
            return f"resize_native_{w}x{h}"

        if current > REEL_RATIO:
            new_w = int(h * REEL_RATIO)
            left = max(0, (w - new_w) // 2)
            img = img.crop((left, 0, left + new_w, h))
            mode = "crop_sides"
        else:
            new_h = int(w / REEL_RATIO)
            if crop_anchor == "top":
                top = 0
            elif crop_anchor == "bottom":
                top = max(0, h - new_h)
            else:
                top = max(0, (h - new_h) // 2)
            img = img.crop((0, top, w, top + new_h))
            mode = f"crop_{crop_anchor}"

        img = img.resize((REEL_W, REEL_H), Image.Resampling.LANCZOS)
        dest.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest, format="PNG", optimize=True)
        return f"{mode}_{w}x{h}"
    except Exception:
        if src != dest:
            src.replace(dest)
        return "fallback_copy" if dest.is_file() else "failed"
