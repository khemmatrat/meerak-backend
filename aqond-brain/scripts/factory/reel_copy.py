"""Flow 2 Reel — caption FB / IG / Reels"""

from __future__ import annotations

import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from factory import media_db
from factory.hook_factory import load_env
from factory.post_copy import CTA_VARIANTS, _diverse_fallback, _grok_copy, _parse_copy_json, _too_similar


def _recent_reel_copies(limit: int = 6) -> list[str]:
    jobs = media_db.list_jobs(flow_type="flow2", limit=limit)
    out: list[str] = []
    for j in jobs:
        fb = ((j.get("outputs") or {}).get("copy") or {}).get("facebook", "")
        if fb:
            out.append(fb[:300])
    return out


def _build_reel_copy_prompt(
    topic: str,
    scenario: str,
    context: str,
    job_id: int,
    user_brief: str,
    storyboard: list[dict[str, Any]],
) -> str:
    scenes = "\n".join(
        f"ฉาก{s.get('scene', i+1)}: {s.get('vo', '')[:80]}"
        for i, s in enumerate(storyboard[:5])
    )
    cta = CTA_VARIANTS[job_id % len(CTA_VARIANTS)]
    recent = _recent_reel_copies()
    avoid = ""
    if recent:
        avoid = "\nห้ามซ้ำ caption เหล่านี้:\n" + "\n---\n".join(recent[:4])

    primary = user_brief.strip() or topic.strip()
    return f"""เขียน caption สำหรับวิดีโอ Reel 20 วินาที AQOND (app.aqond.com)

=== Brief หลัก ===
{primary}
สถานการณ์: {scenario}

=== เนื้อหาในวิดีโอ ===
{scenes}

{context}
{avoid}

กฎ:
- facebook: 2-4 ประโยค เหมาะโพสต์วิดีโอ FB + emoji ได้
- instagram: สั้น มีขึ้นบรรทัด hashtag ท้ายโพสต์ (Reels)
- youtube_short: 1-2 ประโยค สำหรับ Shorts
- hashtags: 5-8 แท็ก
- headline: หัวข้อสั้นสำหรับ thumbnail/cover

CTA: {cta}

JSON เท่านั้น:
{{"facebook":"...","instagram":"...","youtube_short":"...","hashtags":"...","headline":"..."}}"""


def _gemini_copy(prompt: str, logger: logging.Logger, timeout_sec: int = 30) -> dict[str, str] | None:
    env = load_env()
    gemini_key = env.get("GEMINI_API_KEY", "").strip()
    if not gemini_key:
        return None

    def _call() -> dict[str, str] | None:
        import google.generativeai as genai

        genai.configure(api_key=gemini_key)
        model = genai.GenerativeModel(env.get("GEMINI_MODEL", "gemini-1.5-flash"))
        resp = model.generate_content(prompt)
        return _parse_copy_json((resp.text or "").strip())

    try:
        with ThreadPoolExecutor(max_workers=1) as ex:
            fut = ex.submit(_call)
            return fut.result(timeout=timeout_sec)
    except FuturesTimeout:
        logger.warning("[Flow2] Gemini copy timeout (%ss)", timeout_sec)
        return None
    except Exception as e:
        logger.warning("[Flow2] Gemini copy failed: %s", e)
        return None


def generate_reel_copy(
    topic: str,
    scenario: str,
    context: str,
    job_id: int,
    user_brief: str,
    storyboard: list[dict[str, Any]],
    logger: logging.Logger,
) -> dict[str, str]:
    prompt = _build_reel_copy_prompt(topic, scenario, context, job_id, user_brief, storyboard)
    recent = _recent_reel_copies()

    copy = _grok_copy(prompt, logger, temperature=0.9)
    if copy and not _too_similar(copy.get("facebook", ""), recent):
        logger.info("[Flow2] Copy from Grok job=%s", job_id)
        return copy

    parsed = _gemini_copy(prompt, logger, timeout_sec=30)
    if parsed and not _too_similar(parsed.get("facebook", ""), recent):
        logger.info("[Flow2] Copy from Gemini job=%s", job_id)
        return parsed

    logger.info("[Flow2] Using fallback copy job=%s", job_id)
    fb = _diverse_fallback(topic, job_id, user_brief)
    fb["instagram"] = f"🎬 Reel | {user_brief or topic}\n\n{fb.get('instagram', '')}"
    return fb
