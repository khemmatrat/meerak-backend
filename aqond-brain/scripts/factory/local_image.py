"""Free local image generation — Ollama (z-image-turbo / flux2-klein) + SD WebUI API."""

from __future__ import annotations

import base64
import json
import logging
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from factory.hook_factory import load_env
from factory.qwen_vision import ollama_base

DEFAULT_NEGATIVE = (
    "garbled text, unreadable letters, wrong alphabet, fake Thai glyphs, "
    "deformed hands, extra fingers, blurry, low quality, watermark, logo, "
    "duplicate limbs, distorted face"
)


def image_provider_policy() -> str:
    """local_first | local_only | openai_first"""
    env = load_env()
    return (env.get("IMAGE_PROVIDER") or "local_first").strip().lower()


def local_backends() -> list[str]:
    env = load_env()
    raw = (env.get("LOCAL_IMAGE_BACKEND") or "ollama,a1111").strip()
    return [b.strip().lower() for b in raw.split(",") if b.strip()]


def local_image_model() -> str:
    env = load_env()
    return (env.get("LOCAL_IMAGE_MODEL") or "x/z-image-turbo").strip()


def local_image_size(flow: str = "flow2") -> tuple[int, int]:
    env = load_env()
    if flow == "flow1":
        w = int(env.get("LOCAL_IMAGE_WIDTH_FLOW1") or env.get("LOCAL_IMAGE_WIDTH") or "1024")
        h = int(env.get("LOCAL_IMAGE_HEIGHT_FLOW1") or env.get("LOCAL_IMAGE_HEIGHT") or "1024")
    else:
        w = int(env.get("LOCAL_IMAGE_WIDTH") or "768")
        h = int(env.get("LOCAL_IMAGE_HEIGHT") or "1344")
    return max(256, w), max(256, h)


def local_image_steps() -> int:
    env = load_env()
    try:
        return max(4, min(60, int(env.get("LOCAL_IMAGE_STEPS") or "20")))
    except ValueError:
        return 20


def sd_webui_url() -> str:
    env = load_env()
    return (env.get("SD_WEBUI_URL") or "http://127.0.0.1:7860").rstrip("/")


def should_try_local() -> bool:
    policy = image_provider_policy()
    return policy in ("local_first", "local_only")


A1111_EXTRA_NEGATIVE = (
    "text, letters, words, typography, watermark, logo, qr code, barcode, "
    "signature, caption, subtitle, ui mockup, app interface, phone screen text, "
    "garbled text, unreadable letters, fake thai glyphs, "
    "cartoon, anime, illustration, painting, drawing, sketch, "
    "oversaturated, overexposed, underexposed, jpeg artifacts, "
    "bad anatomy, bad hands, missing fingers, extra digits, "
    "lowres, blurry, noisy, grainy, ugly, deformed"
)

SD_QUALITY_PREFIX = (
    "(masterpiece:1.2), (best quality:1.2), (photorealistic:1.15), "
    "ultra detailed, professional photography, cinematic lighting, "
    "sharp focus, natural colors, 8k uhd"
)


def sd_quality_high() -> bool:
    env = load_env()
    return (env.get("SD_WEBUI_QUALITY") or "high").strip().lower() in ("high", "1", "true", "max")


def sd_hires_enabled() -> bool:
    env = load_env()
    if (env.get("SD_WEBUI_HIRES") or "").strip().lower() in ("0", "false", "off"):
        return False
    return sd_quality_high() or (env.get("SD_WEBUI_HIRES") or "").strip().lower() in ("1", "true", "on")


def _sd_float(env: dict[str, str], key: str, default: float) -> float:
    try:
        return float(env.get(key) or default)
    except ValueError:
        return default


def _sd_int(env: dict[str, str], key: str, default: int) -> int:
    try:
        return int(env.get(key) or default)
    except ValueError:
        return default


def wrap_sd_prompt(prompt: str) -> str:
    """Prefix quality tags for SD 1.5 / Forge."""
    if not sd_quality_high():
        return prompt[:4000]
    body = prompt.strip()
    if body.lower().startswith("(masterpiece"):
        return body[:4000]
    return f"{SD_QUALITY_PREFIX}, {body}"[:4000]


def uses_sd_webui() -> bool:
    """True when SD WebUI (A1111) is a configured local backend."""
    if not should_try_local():
        return False
    return any(b in ("a1111", "sd", "webui") for b in local_backends())


def should_try_openai() -> bool:
    policy = image_provider_policy()
    if policy == "local_only":
        return False
    if policy == "openai_first":
        return True
    env = load_env()
    return bool(env.get("OPENAI_API_KEY", "").strip())


def _save_b64_image(b64_data: str, output_path: Path) -> bool:
    try:
        raw = b64_data.strip()
        if raw.startswith("data:"):
            raw = raw.split(",", 1)[-1]
        data = base64.b64decode(raw)
        if len(data) < 5000:
            return False
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(data)
        return output_path.stat().st_size > 5000
    except Exception:
        return False


def _ollama_generate(
    prompt: str,
    negative: str,
    output_path: Path,
    width: int,
    height: int,
    logger: logging.Logger,
) -> tuple[bool, str]:
    model = local_image_model()
    steps = local_image_steps()
    full_prompt = prompt
    if negative:
        full_prompt = f"{prompt}\n\nNegative: {negative[:500]}"

    payload: dict[str, Any] = {
        "model": model,
        "prompt": full_prompt[:4000],
        "stream": False,
        "width": width,
        "height": height,
        "steps": steps,
        "options": {"negative_prompt": negative[:500]} if negative else {},
    }
    url = f"{ollama_base()}/api/generate"
    try:
        req = Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=600) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        img_b64 = data.get("image") or ""
        if not img_b64:
            err = data.get("error") or "no image in response"
            return False, f"ollama:{err}"
        if _save_b64_image(img_b64, output_path):
            logger.info("[LocalImage] Ollama OK %s %dx%d", model, width, height)
            return True, f"ollama:{model}:{width}x{height}"
        return False, "ollama:empty_image"
    except HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")[:200]
        except Exception:
            pass
        logger.warning("[LocalImage] Ollama HTTP %s: %s", e.code, body)
        return False, f"ollama:http_{e.code}"
    except URLError as e:
        logger.warning("[LocalImage] Ollama unreachable: %s", e)
        return False, "ollama:offline"
    except Exception as e:
        logger.warning("[LocalImage] Ollama failed: %s", e)
        return False, f"ollama:{e}"


def _a1111_generate(
    prompt: str,
    negative: str,
    output_path: Path,
    width: int,
    height: int,
    logger: logging.Logger,
    *,
    allow_hires: bool = True,
) -> tuple[bool, str]:
    env = load_env()
    override = (env.get("SD_WEBUI_MODEL") or "").strip()
    high = sd_quality_high()
    steps = local_image_steps()
    if high and steps < 25:
        steps = _sd_int(env, "LOCAL_IMAGE_STEPS", 28)

    payload: dict[str, Any] = {
        "prompt": wrap_sd_prompt(prompt),
        "negative_prompt": (negative[:1200] if negative else DEFAULT_NEGATIVE),
        "width": width,
        "height": height,
        "steps": steps,
        "cfg_scale": _sd_float(env, "SD_WEBUI_CFG", 7.5 if high else 7.0),
        "sampler_name": env.get("SD_WEBUI_SAMPLER") or ("DPM++ 2M Karras" if high else "Euler a"),
        "batch_size": 1,
        "n_iter": 1,
        "restore_faces": False,
    }

    clip_skip = _sd_int(env, "SD_WEBUI_CLIP_SKIP", 2 if high else 1)
    override_settings: dict[str, Any] = {"CLIP_stop_at_last_layers": clip_skip}
    if override:
        override_settings["sd_model_checkpoint"] = override
    payload["override_settings"] = override_settings

    use_hires = allow_hires and sd_hires_enabled()
    hr_scale = _sd_float(env, "SD_WEBUI_HR_SCALE", 1.5)
    if use_hires:
        payload.update(
            {
                "enable_hr": True,
                "hr_scale": hr_scale,
                "hr_upscaler": env.get("SD_WEBUI_HR_UPSCALER") or "Latent",
                "hr_second_pass_steps": _sd_int(env, "SD_WEBUI_HR_STEPS", 12),
                "denoising_strength": _sd_float(env, "SD_WEBUI_HR_DENOISE", 0.42),
            }
        )
        detail_suffix = f"+hr{hr_scale}"
    else:
        detail_suffix = ""

    url = f"{sd_webui_url()}/sdapi/v1/txt2img"
    try:
        req = Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=900) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        images = data.get("images") or []
        if not images:
            return False, "a1111:no_images"
        if _save_b64_image(images[0], output_path):
            out_w = int(width * hr_scale) if use_hires else width
            out_h = int(height * hr_scale) if use_hires else height
            logger.info(
                "[LocalImage] A1111 OK %dx%d steps=%s hires=%s",
                out_w,
                out_h,
                steps,
                use_hires,
            )
            tag = "a1111-hq" if high else "a1111"
            return True, f"{tag}:{out_w}x{out_h}{detail_suffix}"
        return False, "a1111:empty_image"
    except HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            pass
        logger.warning("[LocalImage] A1111 HTTP %s: %s", e.code, body)
        if use_hires and e.code == 500 and ("memory" in body.lower() or "oom" in body.lower() or "cuda" in body.lower()):
            logger.warning("[LocalImage] A1111 hires OOM — retry without hires")
            return _a1111_generate(
                prompt, negative, output_path, width, height, logger, allow_hires=False
            )
        if use_hires and e.code == 500:
            logger.warning("[LocalImage] A1111 hires failed (%s) — retry without hires", body[:80])
            return _a1111_generate(
                prompt, negative, output_path, width, height, logger, allow_hires=False
            )
        return False, f"a1111:http_{e.code}"
    except URLError as e:
        logger.warning("[LocalImage] A1111 unreachable: %s", e)
        return False, "a1111:offline"
    except Exception as e:
        logger.warning("[LocalImage] A1111 failed: %s", e)
        return False, f"a1111:{e}"


def generate_local_image(
    prompt: str,
    output_path: Path,
    logger: logging.Logger,
    *,
    negative: str = "",
    width: int | None = None,
    height: int | None = None,
    flow: str = "flow2",
) -> tuple[bool, str]:
    """Try configured local backends in order (ollama, a1111)."""
    if not should_try_local():
        return False, "local:disabled_by_policy"

    neg = negative or DEFAULT_NEGATIVE
    w, h = local_image_size(flow)
    if width is not None:
        w = width
    if height is not None:
        h = height
    if uses_sd_webui():
        neg = f"{neg}, {A1111_EXTRA_NEGATIVE}"

    last_err = "local:no_backend"
    for backend in local_backends():
        if backend == "ollama":
            ok, detail = _ollama_generate(prompt, neg, output_path, w, h, logger)
        elif backend in ("a1111", "sd", "webui"):
            ok, detail = _a1111_generate(prompt, neg, output_path, w, h, logger)
        else:
            continue
        if ok:
            return True, detail
        last_err = detail

    return False, last_err


def ping_local_image() -> dict[str, Any]:
    """Health check for local image backends."""
    env = load_env()
    model = local_image_model()
    result: dict[str, Any] = {
        "policy": image_provider_policy(),
        "backends": local_backends(),
        "model": model,
        "size_flow2": f"{local_image_size('flow2')[0]}x{local_image_size('flow2')[1]}",
        "size_flow1": f"{local_image_size('flow1')[0]}x{local_image_size('flow1')[1]}",
        "ollama": {"ok": False, "model_pulled": False},
        "a1111": {"ok": False, "url": sd_webui_url()},
    }

    try:
        req = Request(f"{ollama_base()}/api/tags", method="GET")
        with urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        models = [m.get("name", "") for m in data.get("models", [])]
        result["ollama"]["ok"] = True
        result["ollama"]["models"] = models
        base_name = model.split(":")[0]
        result["ollama"]["model_pulled"] = any(
            m == model or m.startswith(base_name) for m in models
        )
    except Exception as e:
        result["ollama"]["error"] = str(e)

    try:
        req = Request(f"{sd_webui_url()}/sdapi/v1/sd-models", method="GET")
        with urlopen(req, timeout=5) as resp:
            models = json.loads(resp.read().decode("utf-8"))
        result["a1111"]["ok"] = True
        result["a1111"]["model_count"] = len(models) if isinstance(models, list) else 0
    except Exception as e:
        result["a1111"]["error"] = str(e)

    result["ready"] = (
        result["ollama"].get("model_pulled")
        or result["a1111"].get("ok")
    )
    return result
