"""
Lightweight per-shot QC for storyboard (resolution, duration, safe-zone hint).
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any


def _ffprobe_streams(path: str) -> dict[str, Any] | None:
    try:
        r = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height,duration",
                "-of",
                "json",
                path,
            ],
            capture_output=True,
            text=True,
            timeout=25,
        )
        if r.returncode != 0:
            return None
        data = json.loads(r.stdout or "{}")
        streams = data.get("streams") or []
        return streams[0] if streams else None
    except (OSError, json.JSONDecodeError, subprocess.TimeoutExpired):
        return None


def assess_shot_clip(clip_path: str, min_bytes: int = 100_000) -> dict[str, Any]:
    """
    Returns qc dict with badge: pass | warn | fail
    """
    p = Path(clip_path)
    out: dict[str, Any] = {
        "resolution_ok": False,
        "duration_ok": False,
        "safe_zone_hint": True,
        "blank_heuristic": False,
        "badge": "fail",
        "detail": "",
    }
    if not p.is_file():
        out["detail"] = "missing"
        return out
    sz = p.stat().st_size
    if sz < min_bytes:
        out["detail"] = f"small_file:{sz}"
        out["badge"] = "warn"
        return out

    st = _ffprobe_streams(str(p))
    if not st:
        out["detail"] = "ffprobe_failed"
        out["badge"] = "warn"
        return out

    w = int(st.get("width") or 0)
    h = int(st.get("height") or 0)
    out["resolution_ok"] = w >= 640 and h >= 360
    dur = float(st.get("duration") or 0.0)
    out["duration_ok"] = dur >= 0.4
    out["blank_heuristic"] = dur < 0.15

    if out["resolution_ok"] and out["duration_ok"] and not out["blank_heuristic"]:
        out["badge"] = "pass"
    elif out["resolution_ok"] or out["duration_ok"]:
        out["badge"] = "warn"
    else:
        out["badge"] = "fail"

    out["detail"] = f"{w}x{h}@{dur:.1f}s"
    return out
