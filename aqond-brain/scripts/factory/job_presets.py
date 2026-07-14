"""
Job presets — extract & reuse successful Flow 2/3 settings (Phase 4).
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from factory import media_db

logger = logging.getLogger("job_presets")

SCENARIO_LABELS: dict[str, str] = {
    "repair": "ช่างซ่อม",
    "maid": "แม่บ้าน",
    "driver": "คนขับ",
    "friend": "เพื่อนแนะนำ",
    "insurance": "พรบ./ประกัน",
    "matchjob": "MatchJob",
    "advance_job": "Advance Job",
    "video_feed": "Video Feed",
}


def _parse_json_list(raw: str | None) -> list[Any]:
    if not raw or not str(raw).strip().startswith("["):
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        m = re.search(r"\[[\s\S]*\]", str(raw))
        if m:
            try:
                data = json.loads(m.group())
                return data if isinstance(data, list) else []
            except json.JSONDecodeError:
                pass
    return []


def build_job_preset(job: dict[str, Any]) -> dict[str, Any]:
    """Build a reusable preset dict from any media job."""
    flow = (job.get("flow_type") or "").strip()
    outputs = job.get("outputs") or {}
    if isinstance(outputs, str):
        try:
            outputs = json.loads(outputs)
        except json.JSONDecodeError:
            outputs = {}

    jid = int(job.get("id") or 0)
    qc = float(job.get("qc_score") or 0)
    topic = (job.get("topic") or outputs.get("topic") or "").strip()
    brief = (job.get("user_brief") or "").strip()

    preset: dict[str, Any] = {
        "source_job_id": jid,
        "flow_type": flow,
        "topic": topic,
        "user_brief": brief,
        "qc_score": qc,
        "quality_summary": outputs.get("quality_summary") or {},
        "label": f"{flow} job #{jid}",
    }

    if flow == "flow2":
        scenario = (outputs.get("scenario") or job.get("theme") or "repair").strip()
        character = (outputs.get("character") or "man").strip()
        board = outputs.get("storyboard") or _parse_json_list(job.get("script_text"))
        scen_label = SCENARIO_LABELS.get(scenario, scenario)
        preset.update(
            {
                "scenario": scenario,
                "character": character,
                "attach_subtitles": outputs.get("attach_subtitles", True),
                "attach_watermark": bool(outputs.get("watermark_meta", {}).get("watermark")),
                "storyboard": board,
                "label": f"Reel · {scen_label} · {character} · QC {qc:.0f}",
            }
        )
    elif flow == "flow3":
        story = (outputs.get("story") or topic or brief).strip()
        character = (outputs.get("character") or "man_narrator").strip()
        screenplay = outputs.get("screenplay") or outputs.get("acts") or _parse_json_list(
            job.get("script_text")
        )
        preset.update(
            {
                "story": story,
                "character": character,
                "screenplay": screenplay,
                "label": f"Cinema · {story[:36] or 'เรื่องสำเร็จ'} · QC {qc:.0f}",
            }
        )
    elif flow == "flow1":
        theme = (outputs.get("theme") or job.get("theme") or "matchjob").strip()
        preset.update(
            {
                "theme": theme,
                "compose_options": outputs.get("compose_options") or {},
                "label": f"Post · {theme} · QC {qc:.0f}",
            }
        )

    qs = preset.get("quality_summary") or {}
    if qs.get("uses_stock_fallback"):
        preset["warning"] = "งานต้นแบบใช้ stock fallback — อาจไม่เหมาะเป็นต้นแบบคุณภาพสูง"

    return preset


def get_preset_from_job(job_id: int) -> dict[str, Any] | None:
    job = media_db.get_job(job_id)
    if not job:
        return None
    status = (job.get("status") or "").strip()
    if status not in ("completed", "success_library", "published", "preview_ready", "partial"):
        return None
    preset = build_job_preset(job)
    preset["ok"] = True
    return preset


def get_preset_from_success(success_id: int) -> dict[str, Any] | None:
    examples = media_db.list_success_examples(limit=200)
    ex = next((e for e in examples if int(e.get("id", 0)) == success_id), None)
    if not ex:
        return None
    stored = ex.get("preset") or ex.get("preset_json")
    if isinstance(stored, str):
        try:
            stored = json.loads(stored)
        except json.JSONDecodeError:
            stored = None
    if isinstance(stored, dict) and stored.get("source_job_id"):
        stored["success_id"] = success_id
        stored["ok"] = True
        return stored
    job_id = ex.get("job_id")
    if job_id:
        p = get_preset_from_job(int(job_id))
        if p:
            p["success_id"] = success_id
            p["tags"] = ex.get("tags") or []
            return p
    return None


def preset_few_shot_block(flow_type: str, limit: int = 2) -> str:
    """Rich few-shot for storyboard/screenplay from success library presets."""
    examples = media_db.list_success_examples(flow_type=flow_type, limit=limit)
    if not examples:
        return ""

    lines = ["=== ตัวอย่างงานสำเร็จ (ลอกโครงสร้าง + สไตล์ ไม่ copy ข้อความตรงๆ) ==="]
    for ex in examples:
        preset_raw = ex.get("preset") or ex.get("preset_json")
        if isinstance(preset_raw, str):
            try:
                preset_raw = json.loads(preset_raw)
            except json.JSONDecodeError:
                preset_raw = None
        if not isinstance(preset_raw, dict):
            jid = ex.get("job_id")
            if jid:
                job = media_db.get_job(int(jid))
                if job:
                    preset_raw = build_job_preset(job)
            else:
                continue

        if flow_type == "flow2":
            board = preset_raw.get("storyboard") or []
            if not board:
                continue
            lines.append(f"- สถานการณ์ {preset_raw.get('scenario')} · เสียง {preset_raw.get('character')}")
            for i, sc in enumerate(board[:5]):
                if isinstance(sc, dict):
                    lines.append(
                        f"  ฉาก{i+1} vo: {(sc.get('vo') or '')[:60]} | visual: {(sc.get('visual') or '')[:80]}"
                    )
        elif flow_type == "flow3":
            script = preset_raw.get("screenplay") or []
            if not script:
                continue
            lines.append(f"- เรื่อง: {(preset_raw.get('story') or '')[:80]}")
            for i, act in enumerate(script[:3]):
                if isinstance(act, dict):
                    lines.append(
                        f"  Act{i+1} {(act.get('title') or '')[:40]} — {(act.get('narration') or '')[:70]}"
                    )
        else:
            tags = ex.get("tags") or []
            lines.append(f"- tags: {', '.join(tags[:6])}")

    return "\n".join(lines) if len(lines) > 1 else ""


def merge_run_fields(
    preset: dict[str, Any] | None,
    *,
    topic: str = "",
    user_brief: str = "",
    scenario: str = "",
    character: str = "",
    story: str = "",
    attach_subtitles: bool | None = None,
) -> dict[str, Any]:
    """Apply preset as defaults; non-empty caller values win."""
    out = {
        "topic": (topic or "").strip(),
        "user_brief": (user_brief or "").strip(),
        "scenario": (scenario or "").strip(),
        "character": (character or "").strip(),
        "story": (story or "").strip(),
        "attach_subtitles": attach_subtitles,
        "preset": preset,
        "preset_source_job_id": None,
    }
    if not preset:
        return out

    out["preset_source_job_id"] = preset.get("source_job_id")
    if not out["topic"]:
        out["topic"] = (preset.get("topic") or preset.get("story") or "").strip()
    if not out["user_brief"]:
        out["user_brief"] = (preset.get("user_brief") or "").strip()
    if not out["scenario"]:
        out["scenario"] = (preset.get("scenario") or "").strip()
    if not out["character"]:
        out["character"] = (preset.get("character") or "").strip()
    if not out["story"]:
        out["story"] = (preset.get("story") or preset.get("topic") or "").strip()
    if out["attach_subtitles"] is None and "attach_subtitles" in preset:
        out["attach_subtitles"] = bool(preset.get("attach_subtitles"))
    return out
