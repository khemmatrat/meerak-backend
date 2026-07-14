"""Success library — Qwen-tagged examples + reusable job presets (Phase 4)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from factory import media_db, qwen_vision, studio_context
from factory.job_presets import build_job_preset, get_preset_from_job, get_preset_from_success


def mark_job_success(
    job_id: int,
    engagement_score: float = 0.0,
    extra_tags: list[str] | None = None,
) -> dict[str, Any]:
    job = media_db.get_job(job_id)
    if not job:
        return {"ok": False, "error": "job not found"}

    flow_type = job.get("flow_type", "flow1")
    outputs = job.get("outputs") or {}
    media_paths: list[str] = []

    for key in ("image_path", "video_path", "final_video", "poster", "preview_video"):
        p = outputs.get(key)
        if p and Path(p).is_file():
            media_paths.append(str(p))

    scenes = outputs.get("scenes") or outputs.get("acts") or []
    if isinstance(scenes, list):
        for s in scenes:
            if isinstance(s, dict):
                for k in ("image", "video", "path"):
                    if s.get(k) and Path(str(s[k])).is_file():
                        media_paths.append(str(s[k]))

    qwen_labels: dict[str, Any] = {}
    all_tags: list[str] = list(extra_tags or [])

    for mp in media_paths[:3]:
        labels = qwen_vision.analyze_media(Path(mp), flow_type=flow_type)
        qwen_labels[Path(mp).name] = labels
        tags = labels.get("tags") or []
        if isinstance(tags, list):
            all_tags.extend(tags)

    chat_snapshot = studio_context.get_chat_context(flow_type=flow_type, limit=20)
    preset = build_job_preset(job)
    preset["engagement_score"] = engagement_score

    sid = media_db.add_success_example(
        flow_type=flow_type,
        job_id=job_id,
        tags=list(dict.fromkeys(all_tags)),
        qwen_labels=qwen_labels,
        media_paths=media_paths,
        chat_snapshot=chat_snapshot,
        engagement_score=engagement_score,
        preset_json=preset,
    )

    media_db.update_job(job_id, status="success_library")

    return {
        "ok": True,
        "success_id": sid,
        "tags": all_tags,
        "qwen_labels": qwen_labels,
        "media_paths": media_paths,
        "preset": preset,
    }


def list_for_ui(flow_type: str | None = None) -> list[dict[str, Any]]:
    rows = media_db.list_success_examples(flow_type=flow_type, limit=50)
    out: list[dict[str, Any]] = []
    for ex in rows:
        preset = ex.get("preset")
        if not isinstance(preset, dict):
            jid = ex.get("job_id")
            if jid:
                job = media_db.get_job(int(jid))
                if job:
                    preset = build_job_preset(job)
        item = dict(ex)
        item["preset"] = preset or {}
        item["preset_label"] = (preset or {}).get("label") or f"{ex.get('flow_type')} job #{ex.get('job_id')}"
        out.append(item)
    return out


def resolve_preset(
    *,
    preset_job_id: int | None = None,
    success_id: int | None = None,
) -> dict[str, Any] | None:
    if success_id:
        return get_preset_from_success(int(success_id))
    if preset_job_id:
        return get_preset_from_job(int(preset_job_id))
    return None
