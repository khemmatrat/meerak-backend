"""
Trust layer — image source classification, QC scoring, pre-flight checks.
"""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from factory.hook_factory import load_env
from factory.local_image import image_provider_policy, ping_local_image, should_try_local

logger = logging.getLogger("studio_trust")

# ---------------------------------------------------------------------------
# Source classification
# ---------------------------------------------------------------------------

def classify_image_source(source: str | None) -> str:
    """premium | local | compose | stock | grok | failed | other"""
    s = (source or "").strip().lower()
    if not s or s == "failed":
        return "failed"
    if s.startswith("stock"):
        return "stock"
    if s.startswith("compose"):
        return "compose"
    if s == "grok" or s.startswith("grok"):
        return "grok"
    if any(x in s for x in ("openai", "gpt-image", "dall-e")):
        return "premium"
    if any(x in s for x in ("a1111", "ollama")):
        return "local"
    return "other"


def source_badge_label(source: str | None) -> str:
    tier = classify_image_source(source)
    src = (source or "").strip()
    labels = {
        "premium": "OpenAI",
        "grok": "Grok",
        "local": "A1111" if "a1111" in src.lower() else "Local",
        "compose": "Compose",
        "stock": "Stock ⚠️",
        "failed": "Failed",
        "other": "Other",
    }
    return labels.get(tier, "Other")


def _scene_points(tier: str) -> float:
    return {
        "premium": 14.0,
        "grok": 14.0,
        "local": 13.0,
        "compose": 13.0,
        "stock": 8.0,
        "failed": 0.0,
        "other": 10.0,
    }.get(tier, 10.0)


def summarize_flow2_outputs(outputs: dict[str, Any]) -> dict[str, Any]:
    scenes = outputs.get("scenes") or []
    tiers: list[str] = []
    badges: list[str] = []
    warnings: list[str] = []

    for sc in scenes:
        src = (sc.get("image_meta") or {}).get("source")
        tier = classify_image_source(src)
        tiers.append(tier)
        badge = source_badge_label(src)
        if badge not in badges:
            badges.append(badge)

    stock_n = tiers.count("stock")
    failed_n = tiers.count("failed")
    premium_n = sum(1 for t in tiers if t in ("premium", "grok", "local"))

    if stock_n:
        warnings.append(
            f"{stock_n}/{len(scenes)} ฉากใช้รูป stock สำเร็จรูป — ไม่ใช่ AI gen ใหม่"
        )
    if failed_n:
        warnings.append(f"{failed_n} ฉากสร้างภาพไม่สำเร็จ")

    if stock_n >= len(scenes) // 2 and len(scenes) > 0:
        primary = "stock"
    elif premium_n >= max(1, len(scenes) - 1):
        primary = "premium"
    elif "compose" in tiers:
        primary = "mixed"
    else:
        primary = tiers[0] if tiers else "unknown"

    return {
        "badges": badges,
        "primary_source": primary,
        "warnings": warnings,
        "stock_scenes": stock_n,
        "premium_scenes": premium_n,
        "failed_scenes": failed_n,
        "uses_stock_fallback": stock_n > 0,
    }


def compute_flow2_qc(outputs: dict[str, Any], clip_count: int = 0) -> float:
    scenes = outputs.get("scenes") or []
    tiers = [
        classify_image_source((s.get("image_meta") or {}).get("source"))
        for s in scenes
    ]

    img_pts = sum(_scene_points(t) for t in tiers)
    img_pts = min(70.0, img_pts)

    clips = clip_count or sum(1 for s in scenes if s.get("video"))
    video_pts = 15.0 if clips >= 5 else min(15.0, clips * 3.0)

    copy_pts = 15.0 if (outputs.get("copy") or {}).get("facebook") else 0.0

    qc = img_pts + video_pts + copy_pts

    stock_n = tiers.count("stock")
    failed_n = tiers.count("failed")

    if stock_n > 0:
        qc = min(qc, 60.0)
    if failed_n > 0:
        qc = min(qc, 45.0)
    if stock_n == 0 and failed_n == 0 and clips >= 5 and (outputs.get("copy") or {}).get("facebook"):
        premium_n = sum(1 for t in tiers if t in ("premium", "grok", "local", "compose"))
        if premium_n >= 4:
            qc = max(qc, 85.0)

    return min(100.0, round(qc, 1))


def summarize_flow1_outputs(outputs: dict[str, Any]) -> dict[str, Any]:
    src = (outputs.get("image_meta") or {}).get("source")
    tier = classify_image_source(src)
    warnings: list[str] = []
    if tier == "stock":
        warnings.append("ใช้รูป stock สำเร็จรูป — ไม่ใช่ AI gen ใหม่")
    if tier == "failed":
        warnings.append("สร้างภาพไม่สำเร็จ")
    return {
        "badges": [source_badge_label(src)],
        "primary_source": tier,
        "warnings": warnings,
        "uses_stock_fallback": tier == "stock",
    }


def compute_flow1_qc(outputs: dict[str, Any], has_image: bool) -> float:
    copy = outputs.get("copy") or {}
    img_meta = outputs.get("image_meta") or {}
    tier = classify_image_source(img_meta.get("source"))

    score = 25.0
    if copy.get("facebook"):
        score += 15.0
    if copy.get("instagram"):
        score += 10.0
    if copy.get("headline"):
        score += 10.0
    if has_image:
        score += {"premium": 25, "grok": 25, "local": 22, "compose": 20, "stock": 12, "other": 15}.get(tier, 10)
    if tier == "stock":
        score = min(score, 60.0)
    if tier == "failed":
        score = min(score, 40.0)
    if tier in ("premium", "grok", "local") and has_image and copy.get("facebook"):
        score = max(score, 85.0)
    return min(100.0, round(score, 1))


def summarize_flow3_outputs(outputs: dict[str, Any]) -> dict[str, Any]:
    acts = outputs.get("acts") or []
    warnings: list[str] = []
    grok_n = sum(1 for a in acts if a.get("grok_raw"))
    if grok_n < len(acts) and acts:
        warnings.append(f"Grok Video สำเร็จ {grok_n}/{len(acts)} acts")
    badges = ["Grok Video"] if grok_n else ["Grok ⚠️"]
    return {
        "badges": badges,
        "primary_source": "grok_video" if grok_n >= len(acts) // 2 else "partial",
        "warnings": warnings,
        "uses_stock_fallback": False,
        "grok_acts": grok_n,
    }


def compute_flow3_qc(outputs: dict[str, Any]) -> float:
    acts = outputs.get("acts") or []
    grok_n = sum(1 for a in acts if a.get("video"))
    total = max(len(acts), 1)
    qc = grok_n / total * 70.0
    if outputs.get("final_video"):
        qc += 20.0
    if grok_n >= total:
        qc = max(qc, 85.0)
    if grok_n < total // 2:
        qc = min(qc, 55.0)
    return min(100.0, round(qc, 1))


def enrich_job_outputs(flow_type: str, outputs: dict[str, Any], clip_count: int = 0) -> dict[str, Any]:
    """Attach quality_summary + qc_score to outputs (idempotent)."""
    if not outputs:
        return outputs

    ft = (flow_type or "").strip().lower()
    if ft == "flow2":
        outputs["quality_summary"] = summarize_flow2_outputs(outputs)
        outputs["qc_score_computed"] = compute_flow2_qc(outputs, clip_count)
    elif ft == "flow1":
        has_img = bool(outputs.get("image_path"))
        outputs["quality_summary"] = summarize_flow1_outputs(outputs)
        outputs["qc_score_computed"] = compute_flow1_qc(outputs, has_img)
    elif ft == "flow3":
        outputs["quality_summary"] = summarize_flow3_outputs(outputs)
        outputs["qc_score_computed"] = compute_flow3_qc(outputs)
    return outputs


# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------

def _check(name: str, label: str, status: str, detail: str) -> dict[str, str]:
    return {"id": name, "label": label, "status": status, "detail": detail}


def _ping_tts(env: dict[str, str]) -> dict[str, str]:
    base = (
        env.get("AQOND_TTS_URL")
        or env.get("LOCAL_TTS_URL")
        or "http://127.0.0.1:8000"
    ).rstrip("/")
    health_urls = [
        f"{base}/health" if not base.endswith("/api/v1") else f"{base.replace('/api/v1', '')}/health",
        f"{base}/api/v1/health" if "/api/v1" not in base else f"{base}/health",
        base,
    ]
    for url in health_urls:
        try:
            req = Request(url, method="GET")
            with urlopen(req, timeout=4) as resp:
                if resp.status < 500:
                    return _check("tts", "AQOND TTS", "ok", f"พร้อม ({base})")
        except Exception:
            continue
    # POST probe is heavy — try GET on generate-voice parent
    try:
        root = base.split("/api/")[0] if "/api/" in base else base
        req = Request(f"{root}/", method="GET")
        with urlopen(req, timeout=3) as resp:
            if resp.status < 500:
                return _check("tts", "AQOND TTS", "ok", f"server ตอบ ({root})")
    except Exception:
        pass
    return _check(
        "tts",
        "AQOND TTS",
        "error",
        "ไม่ตอบ — เปิด app_voice_api.py พอร์ต 8000",
    )


def _check_openai(env: dict[str, str]) -> dict[str, str]:
    key = env.get("OPENAI_API_KEY", "").strip()
    if not key:
        return _check("openai", "OpenAI Image", "error", "ไม่มี OPENAI_API_KEY ใน .env")
    try:
        req = Request(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {key}"},
            method="GET",
        )
        with urlopen(req, timeout=8) as resp:
            if resp.status == 200:
                return _check("openai", "OpenAI Image", "ok", "API key ใช้งานได้")
    except HTTPError as e:
        if e.code == 401:
            return _check("openai", "OpenAI Image", "error", "API key ไม่ถูกต้อง (401)")
        if e.code == 429:
            return _check("openai", "OpenAI Image", "warn", "Rate limit — ลองใหม่ภายหลัง")
        return _check("openai", "OpenAI Image", "warn", f"HTTP {e.code}")
    except URLError as e:
        return _check("openai", "OpenAI Image", "warn", f"เชื่อมต่อไม่ได้: {e.reason}")
    except Exception as e:
        return _check("openai", "OpenAI Image", "warn", str(e)[:80])
    return _check("openai", "OpenAI Image", "warn", "ตรวจไม่ครบ — ลอง gen ได้แต่อาจ fail")


def _check_xai(env: dict[str, str]) -> dict[str, str]:
    key = env.get("XAI_API_KEY", "").strip()
    if not key:
        return _check("xai", "Grok Video", "error", "ไม่มี XAI_API_KEY")
    return _check("xai", "Grok Video", "ok", "API key ตั้งแล้ว")


def _check_gemini(env: dict[str, str]) -> dict[str, str]:
    key = env.get("GEMINI_API_KEY", "").strip()
    if not key:
        return _check("gemini", "Gemini (บท)", "warn", "ไม่มี GEMINI_API_KEY — ใช้บทสำรอง")
    return _check("gemini", "Gemini (บท)", "ok", "พร้อมเขียนบท")


def _check_ffmpeg() -> dict[str, str]:
    if shutil.which("ffmpeg"):
        return _check("ffmpeg", "FFmpeg", "ok", "พบใน PATH")
    return _check("ffmpeg", "FFmpeg", "error", "ไม่พบ ffmpeg — ติดตั้งก่อน gen วิดีโอ")


def _check_a1111() -> dict[str, str]:
    li = ping_local_image()
    a = li.get("a1111") or {}
    policy = image_provider_policy()
    if a.get("ok"):
        return _check("a1111", "A1111 Local", "ok", f"SD WebUI {a.get('url', '')}")
    if should_try_local() and "a1111" in (li.get("backends") or []):
        return _check("a1111", "A1111 Local", "off", "offline — ไม่เปิด START_A1111.bat")
    return _check("a1111", "A1111 Local", "skip", f"ไม่ใช้ ({policy})")


def run_preflight(flow: str = "flow2") -> dict[str, Any]:
    env = load_env()
    ft = (flow or "flow2").strip().lower()
    checks: list[dict[str, str]] = []
    warnings: list[str] = []
    errors: list[str] = []

    checks.append(_check_ffmpeg())

    if ft in ("flow2", "flow3", "flow4"):
        checks.append(_ping_tts(env))

    if ft in ("flow1", "flow2"):
        checks.append(_check_openai(env))
        checks.append(_check_a1111())

    if ft == "flow3":
        checks.append(_check_xai(env))
        checks.append(_check_gemini(env))

    policy = image_provider_policy()
    openai_st = next((c for c in checks if c["id"] == "openai"), None)
    a1111_st = next((c for c in checks if c["id"] == "a1111"), None)
    tts_st = next((c for c in checks if c["id"] == "tts"), None)

    if ft in ("flow1", "flow2"):
        if policy == "local_first" and a1111_st and a1111_st["status"] == "off":
            if openai_st and openai_st["status"] != "ok":
                warnings.append(
                    "A1111 ปิด + OpenAI ไม่พร้อม → อาจได้รูป stock สำเร็จรูป (ไม่ใช่ AI gen ใหม่)"
                )
            elif openai_st and openai_st["status"] == "ok":
                warnings.append(
                    "A1111 ปิด — จะใช้ OpenAI (เสีย credit) หาก billing หมดจะ fallback stock"
                )
        if policy == "openai_first" and openai_st and openai_st["status"] != "ok":
            errors.append("ตั้ง openai_first แต่ OpenAI ไม่พร้อม")

    if ft == "flow3" and next((c for c in checks if c["id"] == "xai"), {}).get("status") == "error":
        errors.append("Flow 3 ต้องมี XAI_API_KEY สำหรับ Grok Video")

    for c in checks:
        if c["status"] == "error":
            errors.append(f"{c['label']}: {c['detail']}")
        elif c["status"] == "warn":
            warnings.append(f"{c['label']}: {c['detail']}")

    blocking = [c for c in checks if c["status"] == "error"]
    if ft in ("flow2", "flow3", "flow4") and tts_st and tts_st["status"] == "error":
        can_proceed = False
    elif blocking:
        can_proceed = False
    else:
        can_proceed = True

    ready = can_proceed and not warnings and not errors

    rec_parts: list[str] = []
    if ft in ("flow1", "flow2") and a1111_st and a1111_st["status"] == "off":
        rec_parts.append("เปิด A1111 หรือเติม OpenAI credit")
    if ft == "flow3":
        rec_parts.append("เผาเวลา ~10–15 นาที/ฉาก Grok")
    recommendation = " · ".join(rec_parts) if rec_parts else "พร้อมสร้าง"

    return {
        "flow": ft,
        "ready": ready,
        "can_proceed": can_proceed,
        "image_policy": policy,
        "checks": checks,
        "warnings": warnings,
        "errors": errors,
        "recommendation": recommendation,
    }
