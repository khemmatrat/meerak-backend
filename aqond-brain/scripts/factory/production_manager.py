"""
ProductionManager — State Machine สำหรับโปรดักชั่นวิดีโอแต่ละคลิป
States: draft -> scripting -> visual_gen -> editing -> qc -> approved -> publishing -> done
รองรับ asyncio และ retry logic
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent
STATE_DIR = AQOND_BRAIN / "output" / "production_states"
PREVIEW_DIR = AQOND_BRAIN / "output" / "previews"
FINAL_DIR = AQOND_BRAIN / "output" / "final"


class ProductionState(str, Enum):
    DRAFT = "draft"
    SCRIPTING = "scripting"
    SCRIPT_PAUSED = "script_paused"  # Paused: waiting for user approval on script
    SCRIPT_REJECTED = "script_rejected"  # Pinky rejected script
    VISUAL_GEN = "visual_gen"
    VISUAL_PAUSED = "visual_paused"  # Paused: waiting for scene approval
    EDITING = "editing"
    EDIT_REJECTED = "edit_rejected"  # Pinky rejected video
    QC = "qc"
    PINKY_REVIEW = "pinky_review"  # Under Pinky's review
    APPROVED = "approved"
    PUBLISHING = "publishing"
    DONE = "done"
    FAILED = "failed"
    REJECTED = "rejected"


@dataclass
class ProductionProject:
    """แทน 1 video project ที่ผ่าน pipeline"""

    project_id: str
    state: ProductionState = ProductionState.DRAFT
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    # Inputs
    brief: str = ""
    spy_report: dict[str, Any] = field(default_factory=dict)
    structured_brief: dict[str, Any] = field(default_factory=dict)

    # Outputs
    script_md: str = ""
    audio_narration_path: str = ""
    raw_clips: list[str] = field(default_factory=list)
    edited_video_path: str = ""
    qc_notes: str = ""
    publish_urls: dict[str, str] = field(default_factory=dict)

    # Retries
    retry_count: int = 0
    max_retries: int = 3
    error_log: list[str] = field(default_factory=list)
    
    # Pinky QC
    pinky_script_review: dict[str, Any] = field(default_factory=dict)
    pinky_video_review: dict[str, Any] = field(default_factory=dict)
    pinky_approved: bool = False
    rework_count: int = 0

    # Creative settings (set at project creation)
    tone: str = "professional"          # funny / professional / sci-fi / warm
    tier: str = "marketing"             # marketing / tutorial
    beat_sync: bool = True
    edu_overlay: bool = False

    # Multi-Variant render results (A=fantasy, B=tutorial, C=viral)
    render_variants: dict[str, str] = field(default_factory=dict)
    selected_variant: str = ""          # which variant the boss approved

    # Rocky: which A/B/C variants to render (checkboxes) + optional auto pipeline after Grok clips
    variants_render_enabled: dict[str, bool] = field(
        default_factory=lambda: {"variant_a": True, "variant_b": True, "variant_c": True}
    )
    auto_render_variants_after_visual: bool = False

    # Thomas / Rocky: รอบเรนเดอร์ล่าสุด (สำหรับกรอง variant ใน UI)
    last_render_session_id: str = ""
    last_render_at: str = ""
    last_render_variant_keys: list[str] = field(default_factory=list)

    # Regen All — โน้ตสั้น + ประวัติย่อ
    last_regen_all_note: str = ""
    regen_all_history: list[dict[str, Any]] = field(default_factory=list)

    # Reference images (paths relative to aqond-brain repo root, e.g. output/refs/prod_xxx/character.jpg)
    character_ref_rel: str = ""
    scene_ref_rel: dict[str, str] = field(default_factory=dict)

    # Multi-shot production (Production Manager)
    shots: list[dict[str, Any]] = field(default_factory=list)
    director_preset: str = "corporate"  # tiktok_fast | cinematic_slow | corporate
    production_wizard_step: int = 0
    target_shot_count: int = 0  # 0 = auto from script markers
    multi_shot_mode: bool = True
    reference_anchor_rel: str = ""  # last continuity frame (first frame of previous shot)
    credit_estimate_units: float = 0.0
    # Per-scene takes: "0" -> { variant_a, variant_b, variant_c, selected }
    shot_variants: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "project_id": self.project_id,
            "state": self.state.value if isinstance(self.state, ProductionState) else self.state,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "brief": self.brief,
            "spy_report": self.spy_report,
            "structured_brief": self.structured_brief,
            "script_md": self.script_md,
            "audio_narration_path": self.audio_narration_path,
            "raw_clips": self.raw_clips,
            "edited_video_path": self.edited_video_path,
            "qc_notes": self.qc_notes,
            "publish_urls": self.publish_urls,
            "retry_count": self.retry_count,
            "max_retries": self.max_retries,
            "error_log": self.error_log,
            "pinky_script_review": self.pinky_script_review,
            "pinky_video_review": self.pinky_video_review,
            "pinky_approved": self.pinky_approved,
            "rework_count": self.rework_count,
            "tone": self.tone,
            "tier": self.tier,
            "beat_sync": self.beat_sync,
            "edu_overlay": self.edu_overlay,
            "render_variants": self.render_variants,
            "selected_variant": self.selected_variant,
            "variants_render_enabled": self.variants_render_enabled,
            "auto_render_variants_after_visual": self.auto_render_variants_after_visual,
            "last_render_session_id": self.last_render_session_id,
            "last_render_at": self.last_render_at,
            "last_render_variant_keys": self.last_render_variant_keys,
            "last_regen_all_note": self.last_regen_all_note,
            "regen_all_history": self.regen_all_history,
            "character_ref_rel": self.character_ref_rel,
            "scene_ref_rel": self.scene_ref_rel,
            "shots": self.shots,
            "director_preset": self.director_preset,
            "production_wizard_step": self.production_wizard_step,
            "target_shot_count": self.target_shot_count,
            "multi_shot_mode": self.multi_shot_mode,
            "reference_anchor_rel": self.reference_anchor_rel,
            "credit_estimate_units": self.credit_estimate_units,
            "shot_variants": self.shot_variants if isinstance(self.shot_variants, dict) else {},
        }

    @classmethod
    def from_dict(cls, data: dict) -> ProductionProject:
        state_val = data.get("state", "draft")
        state = ProductionState(state_val) if isinstance(state_val, str) else ProductionState.DRAFT
        _vdef = {"variant_a": True, "variant_b": True, "variant_c": True}
        _vr = dict(_vdef)
        raw_ve = data.get("variants_render_enabled")
        if isinstance(raw_ve, dict):
            for k in _vdef:
                if k in raw_ve:
                    _vr[k] = bool(raw_ve[k])
        return cls(
            project_id=data.get("project_id", ""),
            state=state,
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", ""),
            brief=data.get("brief", ""),
            spy_report=data.get("spy_report", {}),
            structured_brief=data.get("structured_brief", {}) or {},
            script_md=data.get("script_md", ""),
            audio_narration_path=data.get("audio_narration_path", ""),
            raw_clips=data.get("raw_clips", []),
            edited_video_path=data.get("edited_video_path", ""),
            qc_notes=data.get("qc_notes", ""),
            publish_urls=data.get("publish_urls", {}),
            retry_count=data.get("retry_count", 0),
            max_retries=data.get("max_retries", 3),
            error_log=data.get("error_log", []),
            pinky_script_review=data.get("pinky_script_review", {}),
            pinky_video_review=data.get("pinky_video_review", {}),
            pinky_approved=data.get("pinky_approved", False),
            rework_count=data.get("rework_count", 0),
            tone=data.get("tone", "professional"),
            tier=data.get("tier", "marketing"),
            beat_sync=data.get("beat_sync", True),
            edu_overlay=data.get("edu_overlay", False),
            render_variants=data.get("render_variants", {}),
            selected_variant=data.get("selected_variant", ""),
            variants_render_enabled=_vr,
            auto_render_variants_after_visual=bool(data.get("auto_render_variants_after_visual", False)),
            last_render_session_id=str(data.get("last_render_session_id", "") or ""),
            last_render_at=str(data.get("last_render_at", "") or ""),
            last_render_variant_keys=list(data.get("last_render_variant_keys", []) or []),
            last_regen_all_note=str(data.get("last_regen_all_note", "") or ""),
            regen_all_history=list(data.get("regen_all_history", []) or []),
            character_ref_rel=data.get("character_ref_rel", ""),
            scene_ref_rel=data.get("scene_ref_rel", {}) or {},
            shots=list(data.get("shots", []) or []),
            director_preset=str(data.get("director_preset", "corporate") or "corporate"),
            production_wizard_step=int(data.get("production_wizard_step", 0) or 0),
            target_shot_count=int(data.get("target_shot_count", 0) or 0),
            multi_shot_mode=bool(data.get("multi_shot_mode", True)),
            reference_anchor_rel=str(data.get("reference_anchor_rel", "") or ""),
            credit_estimate_units=float(data.get("credit_estimate_units", 0.0) or 0.0),
            shot_variants=dict(data.get("shot_variants", {}) or {}),
        )


class ProductionManager:
    def __init__(self, logger: logging.Logger | None = None):
        self.logger = logger or logging.getLogger("production_manager")
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
        FINAL_DIR.mkdir(parents=True, exist_ok=True)

    def create_project(
        self,
        brief: str,
        spy_report: dict[str, Any] | None = None,
        tone: str = "professional",
        tier: str = "marketing",
        structured_brief: dict[str, Any] | None = None,
    ) -> ProductionProject:
        """สร้าง project ใหม่"""
        import time
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        project_id = f"prod_{ts}_{int(time.time() * 1000) % 100000}"
        proj = ProductionProject(
            project_id=project_id,
            brief=brief,
            spy_report=spy_report or {},
            tone=tone,
            tier=tier,
            structured_brief=dict(structured_brief or {}),
        )
        self._save(proj)
        self.logger.info("[ProductionManager] สร้าง project: %s", project_id)
        return proj

    def load_project(self, project_id: str) -> ProductionProject | None:
        """โหลด project จาก state file"""
        path = STATE_DIR / f"{project_id}.json"
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return ProductionProject.from_dict(data)
        except Exception as e:
            self.logger.exception("โหลด project ไม่ได้: %s", e)
            return None

    def _save(self, proj: ProductionProject) -> None:
        proj.updated_at = datetime.now(timezone.utc).isoformat()
        path = STATE_DIR / f"{proj.project_id}.json"
        path.write_text(json.dumps(proj.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")

    def update_state(self, proj: ProductionProject, new_state: ProductionState) -> None:
        """เปลี่ยน state และบันทึก"""
        proj.state = new_state
        self._save(proj)
        self.logger.info("[ProductionManager] %s -> %s", proj.project_id, new_state.value)

    def record_error(self, proj: ProductionProject, error_msg: str) -> None:
        """บันทึก error และเพิ่ม retry count"""
        proj.error_log.append(f"{datetime.now(timezone.utc).isoformat()}: {error_msg}")
        proj.retry_count += 1
        self._save(proj)
        self.logger.warning("[ProductionManager] %s error (retry %d/%d): %s", proj.project_id, proj.retry_count, proj.max_retries, error_msg[:200])

    def should_retry(self, proj: ProductionProject) -> bool:
        """เช็กว่าควร retry หรือไม่"""
        return proj.retry_count < proj.max_retries

    def sync_shots(self, proj: ProductionProject) -> None:
        """Rebuild `proj.shots` from script + raw_clips + QC."""
        from factory.script_segmentation import shots_for_generation
        from factory.shot_qc import assess_shot_clip
        from factory.shot_takes import master_clip_path_for_index, migrate_shot_variants_from_raw_clips

        migrate_shot_variants_from_raw_clips(proj)
        from factory.script_segmentation import segment_script_to_shots

        raw_n = len(segment_script_to_shots(proj.script_md or ""))
        tgt = int(getattr(proj, "target_shot_count", 0) or 0)
        if raw_n >= 2 and tgt == 1:
            proj.target_shot_count = raw_n

        specs = shots_for_generation(
            proj.script_md or "",
            target_count=proj.target_shot_count or 0,
            max_shots=12,
        )
        out: list[dict[str, Any]] = []
        min_b = 50_000
        try:
            import os

            min_b = int((os.getenv("SCENE_VIDEO_MIN_BYTES") or "100000").strip())
        except ValueError:
            min_b = 100_000

        sv = proj.shot_variants if isinstance(proj.shot_variants, dict) else {}

        for i, spec in enumerate(specs):
            idx = i
            rp = master_clip_path_for_index(proj, idx)
            qc = assess_shot_clip(rp, min_bytes=min_b) if (rp or "").strip() else {}
            if not qc:
                qc = {
                    "resolution_ok": False,
                    "duration_ok": False,
                    "badge": "pending",
                    "detail": "no_clip",
                }
            if qc.get("badge") == "pass":
                status = "locked"
            elif rp and Path(rp).is_file():
                status = "gen"
            else:
                status = "draft"
            vsel = ""
            if str(idx) in sv and isinstance(sv[str(idx)], dict):
                vsel = str(sv[str(idx)].get("selected") or "")
            vp = (spec.get("visual_prompt") or spec.get("description") or "").strip()
            vo = (spec.get("voiceover") or "").strip()
            out.append(
                {
                    "shot_id": f"s{idx}",
                    "index": idx,
                    "block": spec.get("block", "value"),
                    "prompt": vp,
                    "visual_prompt": vp,
                    "voiceover": vo,
                    "duration_sec": int(spec.get("duration_sec", 10)),
                    "status": status,
                    "variant_selected": vsel,
                    "frame_hint": spec.get("frame_hint", ""),
                    "qc": qc,
                }
            )
        proj.shots = out
        self._save(proj)

    def list_projects(self, state: ProductionState | None = None) -> list[ProductionProject]:
        """List ทั้งหมดหรือกรองตาม state"""
        out = []
        for p in STATE_DIR.glob("prod_*.json"):
            proj = self.load_project(p.stem)
            if proj and (state is None or proj.state == state):
                out.append(proj)
        return sorted(out, key=lambda x: x.updated_at, reverse=True)
