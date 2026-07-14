"""
Flow 1 image generation — Qwen brief + OpenAI gpt-image-1 (รูปใหม่ทุก job)
"""

from __future__ import annotations

import base64
import logging
import random
import time
from pathlib import Path
from typing import Any
from urllib.request import urlopen

from factory import media_db
from factory.hook_factory import load_env
from factory.local_image import generate_local_image, should_try_openai
from factory.stock_images import download_stock_image, get_stock_image_url

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

STYLE_VARIATIONS = [
    "cinematic wide shot, warm golden hour lighting",
    "clean minimalist corporate, cool blue tones",
    "dynamic action angle, high contrast",
    "soft natural daylight, friendly approachable mood",
    "dramatic side lighting, premium brand feel",
    "aerial perspective, modern urban Thailand",
    "close-up emotional portrait, shallow depth of field",
    "documentary style, authentic workplace moment",
]


def get_reference_context(flow_type: str = "flow1") -> tuple[str, Path | None, list[dict[str, Any]]]:
    """รวม Qwen vision จาก uploads — ใช้เป็นแนวทาง prompt เท่านั้น"""
    uploads = media_db.list_uploads(limit=15)
    brief_parts: list[str] = []
    ref_path: Path | None = None
    labels: list[dict[str, Any]] = []

    for u in uploads:
        summary = (u.get("vision_summary") or "").strip()
        path = Path(u.get("path") or "")
        if path.is_file() and path.suffix.lower() in IMAGE_EXT and ref_path is None:
            ref_path = path
        if not summary or "vision offline" in summary or "vision error" in summary:
            continue
        fname = u.get("filename", path.name)
        brief_parts.append(f"[อ้างอิง {fname}]: {summary}")
        labels.append({"file": fname, "summary": summary})

    return "\n".join(brief_parts), ref_path, labels


def build_flow1_image_prompt(
    topic: str,
    theme: str,
    job_id: int,
    chat_context: str,
    reserve_overlay_space: bool = False,
    overlay_hint: str = "",
) -> str:
    ref_brief, _, _ = get_reference_context("flow1")
    style = STYLE_VARIATIONS[job_id % len(STYLE_VARIATIONS)]
    seed = job_id * 9973 + int(time.time()) % 10000

    theme_hint = ""
    if theme == "insurance" or "พรบ" in topic or "ประกัน" in topic:
        theme_hint = "Thai car owner, vehicle document, insurance renewal, discount promotion, urgent limited offer."

    parts = [
        "Create a brand NEW square 1:1 marketing photo for Thai app AQOND (app.aqond.com).",
        f"Subject / campaign: {topic}",
        f"Theme category: {theme}",
        theme_hint,
        f"Visual style for this version: {style}",
        f"Creative seed {seed} — must be visually DISTINCT from any previous generation.",
        "Thai professional context, trustworthy, modern.",
    ]
    parts.extend([
        "CRITICAL: NO text, NO logos, NO watermarks, NO QR codes on the generated photo.",
        "Photorealistic or high-quality marketing photography.",
    ])
    if reserve_overlay_space:
        parts.extend([
            f"Campaign mood only (overlays added separately): {overlay_hint[:200]}",
            "Leave bottom-left and bottom-right corners relatively clear for post-processing overlays.",
            "Center subject in frame, blurred office or lifestyle background.",
        ])
    if ref_brief:
        parts.append(
            "Use ONLY as creative direction (do NOT copy layout literally):\n"
            + ref_brief[:2000]
        )
    if chat_context:
        parts.append("Additional user brief:\n" + chat_context[-1200:])
    return "\n".join(parts)


def _save_b64_or_url(item: Any, output_path: Path) -> bool:
    url = getattr(item, "url", None)
    b64 = getattr(item, "b64_json", None)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if b64:
        output_path.write_bytes(base64.b64decode(b64))
        return output_path.stat().st_size > 5000
    if url:
        with urlopen(url, timeout=90) as r:
            output_path.write_bytes(r.read())
        return output_path.stat().st_size > 5000
    return False


def _openai_image(prompt: str, output_path: Path, logger: logging.Logger) -> tuple[bool, str]:
    env = load_env()
    key = env.get("OPENAI_API_KEY", "").strip()
    if not key:
        return False, "no OPENAI_API_KEY"

    preferred = env.get("FLOW1_IMAGE_MODEL", "gpt-image-1").strip()
    models = [preferred]
    for m in ("gpt-image-1", "dall-e-3", "dall-e-2"):
        if m not in models:
            models.append(m)

    try:
        from openai import OpenAI

        client = OpenAI(api_key=key)
    except Exception as e:
        return False, str(e)

    last_err = ""
    for model in models:
        try:
            kwargs: dict[str, Any] = {
                "model": model,
                "prompt": prompt[:4000],
                "n": 1,
            }
            if model in ("dall-e-3", "dall-e-2", "gpt-image-1"):
                kwargs["size"] = "1024x1024"
            if model == "dall-e-3":
                kwargs["quality"] = "standard"

            resp = client.images.generate(**kwargs)
            if resp.data and _save_b64_or_url(resp.data[0], output_path):
                logger.info("[Flow1] Image from OpenAI %s → %s", model, output_path.name)
                return True, model
            last_err = f"{model}: empty response"
        except Exception as e:
            last_err = f"{model}: {e}"
            logger.warning("[Flow1] OpenAI %s failed: %s", model, e)

    return False, last_err


def _grok_image(prompt: str, output_path: Path, logger: logging.Logger) -> bool:
    try:
        from factory.visual_upgrade import generate_image_with_grok

        grok_path = generate_image_with_grok(prompt, logger)
        if grok_path and Path(grok_path).is_file():
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(Path(grok_path).read_bytes())
            return output_path.stat().st_size > 5000
    except Exception as e:
        logger.warning("[Flow1] Grok image failed: %s", e)
    return False


def _crop_square_1080(src: Path, dest: Path, offset: float = 0.5) -> bool:
    try:
        from PIL import Image, ImageEnhance

        img = Image.open(src).convert("RGB")
        w, h = img.size
        side = min(w, h)
        left = int((w - side) * offset)
        top = int((h - side) * offset)
        left = max(0, min(left, w - side))
        top = max(0, min(top, h - side))
        img = img.crop((left, top, left + side, top + side))
        img = img.resize((1080, 1080), Image.Resampling.LANCZOS)
        enhancer = ImageEnhance.Brightness(img)
        img = enhancer.enhance(0.95 + (offset - 0.5) * 0.2)
        dest.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest, format="PNG", optimize=True)
        return dest.is_file() and dest.stat().st_size > 5000
    except Exception:
        return False


def _stock_image(topic: str, theme: str, job_id: int, output_path: Path, logger: logging.Logger) -> bool:
    seed = f"{job_id}:{topic}:{theme}:{int(time.time())}"
    idx = abs(hash(seed)) % 8
    tmp = output_path.with_suffix(".stock.jpg")
    if not download_stock_image(get_stock_image_url(idx), str(tmp)):
        return False
    offset = 0.3 + (job_id % 5) * 0.1
    if _crop_square_1080(tmp, output_path, offset=offset):
        tmp.unlink(missing_ok=True)
        logger.info("[Flow1] Stock+variation idx=%s job=%s", idx, job_id)
        return True
    return False


def generate_flow1_image(
    topic: str,
    theme: str,
    job_id: int,
    output_path: Path,
    chat_context: str,
    logger: logging.Logger,
    reserve_overlay_space: bool = False,
    overlay_hint: str = "",
) -> dict[str, Any]:
    """
    ลำดับ: local (Ollama/A1111) → OpenAI → Grok → stock
    """
    ref_brief, ref_path, _ = get_reference_context("flow1")
    prompt = build_flow1_image_prompt(
        topic, theme, job_id, chat_context, reserve_overlay_space, overlay_hint
    )

    meta: dict[str, Any] = {
        "prompt_preview": prompt[:400],
        "reference_in_prompt": ref_path.name if ref_path else None,
        "qwen_brief_len": len(ref_brief),
        "reserve_overlay_space": reserve_overlay_space,
        "source": None,
        "error": None,
    }

    local_ok, local_detail = generate_local_image(
        prompt,
        output_path,
        logger,
        flow="flow1",
    )
    if local_ok:
        _crop_square_1080(output_path, output_path, offset=random.random())
        meta["source"] = local_detail
        return meta
    meta["error"] = local_detail

    if should_try_openai():
        ok, detail = _openai_image(prompt, output_path, logger)
        if ok:
            meta["source"] = f"openai:{detail}"
            return meta
        meta["error"] = detail

    if _grok_image(prompt, output_path, logger):
        meta["source"] = "grok"
        return meta

    env = load_env()
    if env.get("FLOW1_USE_UPLOAD_AS_IMAGE", "").strip() == "1" and ref_path:
        if _crop_square_1080(ref_path, output_path, offset=random.random()):
            meta["source"] = "upload_crop"
            return meta

    if _stock_image(topic, theme, job_id, output_path, logger):
        meta["source"] = "stock_varied"
        return meta

    meta["source"] = "failed"
    return meta
