"""
Prompt Expander — แปลงบทธรรมดา → Fantasy Cinematic Prompts
Dynamic expansion (ไม่ hard-code)
"""

from __future__ import annotations

import json
import logging
import random
import re
from pathlib import Path
from urllib.request import Request, urlopen

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent

# ขีดจำกัดความยาว prompt หลังบีบอัด whitespace (Grok Imagine / Video)
GROK_PROMPT_MAX_CHARS = 4096


def clean_prompt_structure(text: str, max_len: int = GROK_PROMPT_MAX_CHARS) -> str:
    """
    Pinky-style string hygiene: ลบ newline ซ้ำ ลด whitespace ให้เหลือช่องเดียวระหว่างคำ
    แล้วตัดให้ไม่เกิน max_len (ค่าเริ่มต้น 4096) สำหรับ Grok Imagine integration
    """
    if not text or not str(text).strip():
        return ""
    s = str(text).replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"\n+", " ", s)
    s = re.sub(r"[ \t\u00a0]+", " ", s)
    s = s.strip()
    if len(s) <= max_len:
        return s
    s = s[:max_len].rstrip()
    if " " in s:
        s = s[: s.rfind(" ")].rstrip()
    return s + "…"


FANTASY_KEYWORDS = [
    "fantasy world",
    "ethereal lighting",
    "unreal engine 5 render",
    "highly detailed",
    "cinematic movement",
    "magical atmosphere",
    "8K resolution",
    "volumetric lighting",
    "particle effects",
    "holographic interfaces",
    "neon-lit environment",
    "futuristic Bangkok cityscape",
    "floating architecture",
    "digital aura",
    "cyberpunk aesthetic",
    "dreamlike quality"
]

CHARACTER_TRAITS = [
    "expressive Thai character",
    "visionary entrepreneur",
    "confident young professional",
    "passionate innovator",
    "ambitious startup founder"
]

FASHION_STYLE = [
    "modern tech-wear",
    "stylish casual professional",
    "contemporary business casual with fantasy elements",
    "sleek futuristic outfit"
]


def expand_prompt_with_fantasy(
    simple_description: str,
    creativity_level: str = "medium",
    logger: logging.Logger | None = None,
    *,
    identity_locked: bool = False,
) -> str:
    """
    ขยาย prompt แบบ dynamic
    
    Args:
        simple_description: บทธรรมดาจาก Minnie (เช่น "คนนั่งทำงานที่คาเฟ่")
        creativity_level: "low" | "medium" | "high" | "extreme"
        logger: Logger
    
    Returns:
        Expanded fantasy prompt
    """
    log = logger or logging.getLogger("prompt_expander")
    
    # กำหนดจำนวน keywords ตาม creativity level
    keyword_counts = {
        "low": 3,
        "medium": 5,
        "high": 8,
        "extreme": 12
    }
    
    num_keywords = keyword_counts.get(creativity_level, 5)
    
    # Random sample keywords (ไม่ซ้ำ)
    selected_keywords = random.sample(FANTASY_KEYWORDS, min(num_keywords, len(FANTASY_KEYWORDS)))
    if identity_locked:
        selected_character = "the same brand ambassador (face and body locked to the reference image)"
        selected_fashion = "wardrobe consistent with the reference — do not redesign the person"
    else:
        selected_character = random.choice(CHARACTER_TRAITS)
        selected_fashion = random.choice(FASHION_STYLE)
    
    # Build expanded prompt
    expanded = f"{simple_description.strip()}. "
    expanded += f"Visual style: {selected_character} wearing {selected_fashion}, "
    expanded += f"{', '.join(selected_keywords)}. "
    expanded += "Shot composition: cinematic camera movement with dynamic angles."
    
    log.info("[Prompt Expander] Creativity: %s (%d keywords)", creativity_level, num_keywords)

    return clean_prompt_structure(expanded)


def expand_prompt_with_ai(
    simple_description: str,
    creativity_level: str = "medium",
    logger: logging.Logger | None = None,
    *,
    campaign_brief: str = "",
    scene_index: int = 0,
    total_scenes: int = 1,
    identity_locked: bool = False,
) -> str:
    """
    ใช้ AI (Grok) ขยาย prompt แบบ dynamic (ไม่ใช้ template)
    
    Args:
        simple_description: บทธรรมดา
        creativity_level: ระดับความ fantasy
        logger: Logger
    
    Returns:
        AI-expanded prompt
    """
    log = logger or logging.getLogger("prompt_expander")
    
    env = {}
    env_file = AQOND_BRAIN / ".env"
    if env_file.exists():
        for line in open(env_file, "r", encoding="utf-8"):
            line = line.split("#")[0].strip()
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    
    grok_key = env.get("XAI_API_KEY", "").strip()
    
    if not grok_key:
        log.warning("[AI Expander] No Grok key — using template")
        return expand_prompt_with_fantasy(
            simple_description, creativity_level, logger, identity_locked=identity_locked
        )

    brief_ctx = (campaign_brief or "").strip()[:900]
    is_finale = total_scenes >= 1 and scene_index >= total_scenes - 1

    if identity_locked:
        expansion_prompt = f"""You write a concise IMAGE-TO-VIDEO motion prompt (English OK).

Scene beat from script: "{simple_description}"
Campaign brief (use ONLY for messaging / outro / on-screen text ideas): "{brief_ctx}"

CRITICAL — brand character:
- A reference still defines the person's face, age, hair, skin tone, and body. NEVER invent a different person.
- Do NOT describe their facial features or change wardrobe identity — only motion, environment, props, camera, light.
- Same recognizable ambassador in every shot for brand recall.

Scene position: {scene_index + 1} of {total_scenes}.
{"This is the FINAL beat: end with a clear Aqond app brand moment (logo / tagline / CTA concept) aligned with the campaign brief, still the SAME person on camera." if is_finale else "Build narrative toward the campaign goal; keep the same person."}

Creativity: {creativity_level}. Output ONE paragraph, max 130 words — motion and cinema first, no face re-description."""
    else:
        expansion_prompt = f"""Transform this simple scene description into an epic fantasy cinematic prompt:

Original: "{simple_description}"

Requirements:
- Creativity level: {creativity_level}
- Include: fantasy world, ethereal lighting, unreal engine quality, magical atmosphere
- Include: expressive Thai character with modern fantasy fashion
- Include: futuristic Bangkok elements (floating architecture, neon, holograms)
- Style: cinematic, 8K, highly detailed, dynamic camera movement

Output ONLY the expanded prompt (1-2 sentences, max 200 words). Be creative and avoid templates."""
    
    payload = {
        "model": "grok-3",
        "messages": [{"role": "user", "content": expansion_prompt}],
        "max_tokens": 400,
        "temperature": 0.55 if identity_locked else (0.9 if creativity_level in ["high", "extreme"] else 0.7),
    }
    
    try:
        req = Request(
            "https://api.x.ai/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {grok_key}",
                "Content-Type": "application/json"
            }
        )
        
        with urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            expanded = result.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            
            if expanded:
                out = clean_prompt_structure(expanded)
                log.info(
                    "[AI Expander] Expanded (%d → %d chars, cleaned len=%d)",
                    len(simple_description),
                    len(expanded),
                    len(out),
                )
                return out

    except Exception as e:
        log.warning("[AI Expander] Grok failed: %s — using template", e)

    # Fallback (expand_prompt_with_fantasy คืนค่า clean แล้ว)
    return expand_prompt_with_fantasy(
        simple_description, creativity_level, logger, identity_locked=identity_locked
    )


def get_creativity_multiplier(creativity_level: str) -> float:
    """
    คืน multiplier สำหรับ Grok Video API parameters
    
    Returns:
        temperature-like multiplier (0.5 - 1.5)
    """
    multipliers = {
        "low": 0.6,
        "medium": 0.9,
        "high": 1.2,
        "extreme": 1.5
    }
    return multipliers.get(creativity_level, 0.9)
