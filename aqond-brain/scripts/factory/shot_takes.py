"""
Per-shot Take storage (Variant A/B/C) + master clip resolution for continuity.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent

TAKE_KEYS = ("variant_a", "variant_b", "variant_c")


def migrate_shot_variants_from_raw_clips(proj: Any) -> None:
    """Backfill shot_variants from legacy raw_clips only."""
    if not getattr(proj, "shot_variants", None):
        proj.shot_variants = {}
    if not isinstance(proj.shot_variants, dict):
        proj.shot_variants = {}
    raw = list(proj.raw_clips or [])
    for i, p in enumerate(raw):
        if not (p or "").strip():
            continue
        ap = Path(str(p))
        if not ap.is_file():
            continue
        key = str(i)
        if key in proj.shot_variants and (proj.shot_variants[key] or {}).get("variant_a"):
            continue
        proj.shot_variants[key] = {
            "variant_a": str(ap.resolve()),
            "variant_b": "",
            "variant_c": "",
            "selected": "variant_a",
        }


def master_clip_path_for_index(proj: Any, idx: int) -> str:
    """Resolved path for the selected take at index (for QC + continuity)."""
    migrate_shot_variants_from_raw_clips(proj)
    sv = (proj.shot_variants or {}).get(str(idx), {})
    if not isinstance(sv, dict):
        sv = {}
    sel = (sv.get("selected") or "variant_a").strip()
    for k in (sel, "variant_a", "variant_b", "variant_c"):
        p = (sv.get(k) or "").strip()
        if p and Path(p).is_file():
            return p
    raw = list(proj.raw_clips or [])
    if idx < len(raw) and (raw[idx] or "").strip():
        rp = str(raw[idx]).strip()
        if Path(rp).is_file():
            return rp
    return ""


def apply_clip_to_shot_take(
    proj: Any,
    scene_idx: int,
    take_key: str,
    abs_path: str,
    *,
    set_master: bool = True,
) -> None:
    """Store clip path under a take slot; optionally set as selected master."""
    if take_key not in TAKE_KEYS:
        take_key = "variant_a"
    if not getattr(proj, "shot_variants", None):
        proj.shot_variants = {}
    if not isinstance(proj.shot_variants, dict):
        proj.shot_variants = {}
    key = str(scene_idx)
    if key not in proj.shot_variants or not isinstance(proj.shot_variants[key], dict):
        proj.shot_variants[key] = {
            "variant_a": "",
            "variant_b": "",
            "variant_c": "",
            "selected": "variant_a",
        }
    slot = proj.shot_variants[key]
    slot[take_key] = str(Path(abs_path).resolve())
    if set_master:
        slot["selected"] = take_key
    rc = list(proj.raw_clips or [])
    while len(rc) <= scene_idx:
        rc.append("")
    if set_master:
        rc[scene_idx] = slot[take_key]
    proj.raw_clips = rc


def select_shot_take(proj: Any, scene_idx: int, take_key: str) -> bool:
    """Point master clip + raw_clips[scene_idx] at the chosen take."""
    if take_key not in TAKE_KEYS:
        return False
    migrate_shot_variants_from_raw_clips(proj)
    key = str(scene_idx)
    sv = (proj.shot_variants or {}).get(key, {})
    if not isinstance(sv, dict):
        return False
    p = (sv.get(take_key) or "").strip()
    if not p or not Path(p).is_file():
        return False
    sv["selected"] = take_key
    proj.shot_variants[key] = sv
    rc = list(proj.raw_clips or [])
    while len(rc) <= scene_idx:
        rc.append("")
    rc[scene_idx] = str(Path(p).resolve())
    proj.raw_clips = rc
    return True


def grok_generate_scene_clip(
    proj: Any,
    project_id: str,
    scene_idx: int,
    creativity_level: str,
    logger: Any,
    progress_callback: Any | None = None,
) -> str | None:
    """
    Single Grok Video call for one scene index. Used by regen, take gen, and batch queue.
    """
    from factory.grok_video_api import generate_video_clip
    from factory.prompt_expander import expand_prompt_with_ai
    from factory.script_segmentation import shots_for_generation
    from factory.rocky_editor_api import resolve_continuity_reference, _validate_media_file
    from factory.scene_cache import verify_output_wall_fresh
    from factory.production_manager import ProductionManager
    import time

    pm = ProductionManager(logger)
    fresh = pm.load_project(project_id)
    if fresh:
        proj = fresh

    script_md = proj.script_md or ""
    if not script_md.strip():
        return None

    specs = shots_for_generation(
        script_md,
        target_count=proj.target_shot_count or 0,
        max_shots=12,
    )
    if scene_idx < 0 or scene_idx >= len(specs):
        return None

    spec = specs[scene_idx]
    start = int(spec.get("start_sec", 0))
    end = int(spec.get("end_sec", 10))
    desc = (spec.get("visual_prompt") or spec.get("description") or "Scene").strip()
    dur = min(15, max(3, end - start))

    char_abs: str | None = None
    if proj.character_ref_rel:
        cp = AQOND_BRAIN / proj.character_ref_rel.replace("\\", "/")
        if cp.is_file():
            char_abs = str(cp)

    supp_rel = (proj.scene_ref_rel or {}).get(str(scene_idx), "")
    supp_path = AQOND_BRAIN / supp_rel.replace("\\", "/") if supp_rel else None

    ep = expand_prompt_with_ai(
        desc,
        creativity_level,
        logger,
        campaign_brief=(proj.brief or "").strip(),
        scene_index=scene_idx,
        total_scenes=len(specs),
        identity_locked=bool(char_abs),
    )
    if supp_path and supp_path.is_file():
        ep += (
            " Include supporting UI/product/layout from this campaign beat as described in the script; "
            "keep the main person unchanged."
        )

    ref_for_grok = char_abs
    if not ref_for_grok and scene_idx > 0 and project_id:
        prev = master_clip_path_for_index(proj, scene_idx - 1)
        if prev:
            anchor = resolve_continuity_reference(
                character_ref_abs=None,
                previous_clip_path=prev,
                project_id=project_id,
                shot_index=scene_idx,
                logger=logger,
            )
            if anchor:
                ref_for_grok = anchor

    wall_start = time.time()
    min_b = 50_000
    try:
        min_b = int((os.getenv("SCENE_VIDEO_MIN_BYTES") or "100000").strip())
    except ValueError:
        min_b = 100_000

    def _cb(meta: dict) -> None:
        if progress_callback:
            try:
                progress_callback(meta)
            except Exception:
                pass

    for attempt in range(2):
        new_clip = generate_video_clip(
            ep,
            dur,
            creativity_level,
            logger,
            reference_image_path=ref_for_grok,
            progress_callback=_cb,
            project_id=project_id,
            scene_index=scene_idx,
        )
        if new_clip and Path(new_clip).is_file():
            sz = Path(new_clip).stat().st_size
            if sz >= min_b and _validate_media_file(new_clip, logger):
                if verify_output_wall_fresh(new_clip, wall_start):
                    return str(Path(new_clip).resolve())
        logger.warning("[shot_takes] Grok attempt %d failed for scene %d", attempt + 1, scene_idx)
    return None
