"""Shared helpers for Phase 3 — scene 1 preview before full generation."""

from __future__ import annotations

import re
from typing import Any


def preview_narration(text: str, max_len: int = 55) -> str:
    """Short Thai/English snippet for ~5s preview TTS."""
    t = (text or "").strip()
    if not t:
        return "สวัสดีครับ นี่คือตัวอย่างฉากแรกจาก AQOND"
    for sep in ("。", ". ", ".", "!", "?", "！", "？", "\n"):
        if sep in t:
            part = t.split(sep)[0].strip()
            if len(part) >= 8:
                t = part
                break
    t = re.sub(r"\s+", " ", t).strip()
    if len(t) > max_len:
        t = t[:max_len].rstrip()
        if " " in t:
            t = t[: t.rfind(" ")].rstrip()
    return t or "สวัสดีครับ ตัวอย่างฉากแรก"


def preview_params_match(
    stored: dict[str, Any],
    *,
    scenario: str = "",
    topic: str = "",
    story: str = "",
    character: str = "",
) -> bool:
    """True if current form matches a preview job (reuse storyboard / act 1)."""
    if not stored.get("preview_ready"):
        return False
    char_ok = (stored.get("character") or "man") == (character or "man")
    if not char_ok:
        return False
    if scenario:
        return (stored.get("scenario") or "") == scenario and (
            (stored.get("topic") or "").strip() == (topic or "").strip()
        )
    return (stored.get("story") or stored.get("topic") or "").strip() == (
        story or topic or ""
    ).strip()
