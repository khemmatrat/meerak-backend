"""
Flow 2 — Video Reel ~20s, 5 scenes 9:16
Storyboard → images → AQOND TTS → FFmpeg (subtitle + zoom) → concat
"""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path
from typing import Any

from factory import media_db, studio_context
from factory.flow2_reel_compose import apply_reel_watermark, compose_reel_end_scene
from factory.local_image import uses_sd_webui
from factory.hook_factory import (
    compile_hook_video,
    create_subtitles_srt,
    generate_voice_aqond_tts,
    get_audio_duration,
    load_env,
    setup_logger,
)
from factory.reel_copy import generate_reel_copy
from factory.reel_image import generate_reel_scene_image
from factory.job_presets import merge_run_fields
from factory.reel_storyboard import generate_storyboard
from factory.studio_trust import compute_flow2_qc, enrich_job_outputs
from factory.preview_utils import preview_narration
from factory.success_library import resolve_preset

OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent / "output" / "media_studio" / "flow2"

SCENARIOS = [
    {"id": "repair", "label": "ช่างซ่อม — โดนเบี้ยวค่าจ้าง"},
    {"id": "maid", "label": "แม่บ้าน — นายจ้างไม่จ่าย"},
    {"id": "driver", "label": "คนขับ — งานไม่ชัดเจน"},
    {"id": "friend", "label": "เพื่อนแนะนำ AQOND"},
    {"id": "insurance", "label": "พรบ. / ประกัน — ส่วนลดในแอป"},
    {"id": "matchjob", "label": "MatchJob — ตรวจงานก่อนรับ"},
    {"id": "advance_job", "label": "Advance Job — Job Board รับเหมา + ตัวกลางเงิน"},
    {"id": "video_feed", "label": "Video Feed Hiring — จ้างงานผ่านคลิปโชว์ฝีมือ"},
]

CHARACTERS = [
    {"id": "man", "label": "ผู้ชาย (สุขุม นุ่มลึก)"},
    {"id": "man_young", "label": "ผู้ชาย (หนุ่ม กระตือรือร้น)"},
    {"id": "man_narrator", "label": "ผู้ชาย (ผู้บรรยาย ทางการ)"},
    {"id": "man_warm", "label": "ผู้ชาย (อบอุ่น เป็นกันเอง)"},
    {"id": "woman", "label": "ผู้หญิง (อ่อนหวาน นุ่มนวล)"},
    {"id": "woman_bright", "label": "ผู้หญิง (สดใส เป็นมิตร)"},
    {"id": "woman_mature", "label": "ผู้หญิง (ผู้ใหญ่ มั่นคง)"},
    {"id": "woman_soft", "label": "ผู้หญิง (นุ่มนวล ช้าๆ)"},
    {"id": "kid", "label": "เด็ก (น่ารัก สดใส)"},
    {"id": "elder", "label": "ผู้สูงอายุ (สงบ ช้า ลึก)"},
]

VOICE_SAMPLE_TEXT = "สวัสดีครับ นี่คือตัวอย่างเสียงพากย์ AQOND ช่วยตรวจงานก่อนรับ"

def _concat_scenes(clips: list[Path], out: Path, logger: logging.Logger) -> bool:
    if not clips:
        return False
    list_file = out.parent / "concat_list.txt"
    list_file.write_text(
        "\n".join(f"file '{c.resolve().as_posix()}'" for c in clips),
        encoding="utf-8",
    )

    for mode in ("copy", "reencode"):
        out_tmp = out.parent / f"_concat_{out.name}"
        if mode == "copy":
            cmd = [
                "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                "-i", str(list_file), "-c", "copy", str(out_tmp),
            ]
        else:
            cmd = [
                "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                "-i", str(list_file),
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart",
                str(out_tmp),
            ]
        r = subprocess.run(cmd, capture_output=True, timeout=300)
        if r.returncode == 0 and out_tmp.is_file() and out_tmp.stat().st_size > 5000:
            out_tmp.replace(out)
            list_file.unlink(missing_ok=True)
            logger.info("[Flow2] Concat OK (%s)", mode)
            return True
        out_tmp.unlink(missing_ok=True)
        logger.warning("[Flow2] Concat %s failed", mode)

    list_file.unlink(missing_ok=True)
    return False


def _update_progress(job_id: int, outputs: dict[str, Any], step: str, logger: logging.Logger) -> None:
    outputs["progress"] = step
    try:
        media_db.update_job(job_id, outputs_json=outputs)
    except Exception as e:
        logger.debug("[Flow2] progress update: %s", e)


def _render_flow2_scene(
    sc: dict[str, Any],
    scene_num: int,
    *,
    work: Path,
    scenario: str,
    topic: str,
    job_id: int,
    character: str,
    attach_subtitles: bool,
    logger: logging.Logger,
    vo_override: str | None = None,
    skip_image: bool = False,
) -> tuple[dict[str, Any], Path | None]:
    """Generate image (optional skip), TTS, clip for one scene. Returns record + clip path."""
    vo_full = (sc.get("vo") or "").strip()
    vo = (vo_override if vo_override is not None else vo_full).strip()
    visual = sc.get("visual") or topic

    img = work / f"scene_{scene_num}.png"
    aud = work / f"scene_{scene_num}.mp3"
    srt = work / f"scene_{scene_num}.srt"
    clip = work / f"scene_{scene_num}.mp4"

    img_meta: dict[str, Any] = {"source": None, "skipped": skip_image}
    if skip_image and img.is_file():
        img_meta["source"] = "preview:reuse"
    elif not skip_image:
        img_meta = generate_reel_scene_image(
            visual,
            vo_full,
            scenario,
            scene_num,
            job_id,
            topic,
            img,
            logger,
            attach_subtitles=attach_subtitles,
        )
        if scene_num == 5 and img.is_file():
            end_meta = compose_reel_end_scene(img, vo=vo_full, topic=topic, logger=logger)
            img_meta["end_compose"] = end_meta

    logger.info("[Flow2] Scene %s TTS: %s", scene_num, vo[:80])
    tts_ok = bool(vo) and generate_voice_aqond_tts(vo, aud, character, logger)

    clip_ok = False
    err_parts: list[str] = []
    if not img.is_file():
        err_parts.append("no_image")
    if not tts_ok:
        err_parts.append("no_tts")
    if img.is_file() and aud.is_file() and aud.stat().st_size > 100:
        dur = get_audio_duration(aud)
        if attach_subtitles:
            create_subtitles_srt(vo, dur, srt)
        clip_ok = compile_hook_video(
            img, aud, srt, clip, logger, attach_subtitles=attach_subtitles
        )
        if not clip_ok:
            err_parts.append("ffmpeg_fail")

    scene_rec = {
        "scene": scene_num,
        "vo": vo_full,
        "visual": visual,
        "image": str(img) if img.is_file() else "",
        "audio": str(aud) if aud.is_file() else "",
        "video": str(clip) if clip.is_file() else "",
        "image_meta": img_meta,
        "errors": err_parts,
        "preview_vo": vo if vo != vo_full else "",
    }
    return scene_rec, clip if clip_ok else None


def run_flow2_preview(
    topic: str = "",
    scenario: str = "repair",
    user_brief: str = "",
    job_id: int | None = None,
    character: str = "man",
    attach_subtitles: bool = True,
    preset_job_id: int | None = None,
    success_id: int | None = None,
) -> dict[str, Any]:
    """Phase 3 — storyboard + scene 1 image + ~5s preview clip only."""
    logger = setup_logger("reel_factory")
    media_db.init_db()
    character = character or load_env().get("HOOK_DEFAULT_CHARACTER", "man")

    preset = resolve_preset(preset_job_id=preset_job_id, success_id=success_id)
    merged = merge_run_fields(
        preset,
        topic=topic,
        user_brief=user_brief,
        scenario=scenario,
        character=character,
        attach_subtitles=attach_subtitles,
    )
    topic = merged["topic"]
    brief = merged["user_brief"]
    scenario = merged["scenario"] or "repair"
    character = merged["character"] or character
    if merged["attach_subtitles"] is not None:
        attach_subtitles = bool(merged["attach_subtitles"])
    preset = merged.get("preset")

    ctx = studio_context.build_agent_prompt(
        "flow2",
        "คุณคือ AI โปรดิวเซอร์ Reel AQOND Flow 2",
        f"หัวข้อ: {topic or brief}\nสถานการณ์: {scenario}",
    )
    if not topic:
        topic = brief[:120] if brief else "AQOND — app.aqond.com"

    if job_id is None:
        job_id = media_db.create_job("flow2", topic=topic, theme=scenario, user_brief=brief)

    work = OUTPUT_DIR / f"job_{job_id}"
    work.mkdir(parents=True, exist_ok=True)

    if uses_sd_webui() and not attach_subtitles:
        attach_subtitles = True

    outputs: dict[str, Any] = {
        "scenes": [],
        "final_video": "",
        "scenario": scenario,
        "topic": topic,
        "character": character,
        "attach_subtitles": attach_subtitles,
        "progress": "preview_starting",
        "preview_mode": True,
        "preview_ready": False,
    }
    if preset:
        outputs["preset_from_job_id"] = preset.get("source_job_id")
        if preset.get("success_id"):
            outputs["preset_from_success_id"] = preset.get("success_id")

    try:
        _update_progress(job_id, outputs, "storyboard", logger)
        board = generate_storyboard(
            topic,
            scenario,
            brief,
            ctx,
            job_id,
            logger,
            preset_storyboard=preset.get("storyboard") if preset else None,
            preset_brief=(preset.get("user_brief") or "") if preset else "",
        )
        outputs["storyboard"] = board
        if not board:
            raise RuntimeError("storyboard ว่าง")

        sc0 = board[0]
        snippet = preview_narration(sc0.get("vo") or topic)
        _update_progress(job_id, outputs, "preview_scene_1", logger)

        scene_rec, clip_path = _render_flow2_scene(
            sc0,
            1,
            work=work,
            scenario=scenario,
            topic=topic,
            job_id=job_id,
            character=character,
            attach_subtitles=attach_subtitles,
            logger=logger,
            vo_override=snippet,
        )
        outputs["scenes"] = [scene_rec]
        preview_clip = work / "preview_scene_1.mp4"
        if clip_path and clip_path.is_file():
            preview_clip.write_bytes(clip_path.read_bytes())
            outputs["preview_video"] = str(preview_clip)

        ok = bool(outputs.get("preview_video")) and scene_rec.get("image")
        outputs["preview_ready"] = ok
        outputs["preview_snippet"] = snippet
        outputs["progress"] = "preview_done"

        enrich_job_outputs("flow2", outputs, clip_count=1 if ok else 0)
        qc = float(outputs.get("qc_score_computed") or 0)

        status = "preview_ready" if ok else "failed"
        media_db.update_job(
            job_id,
            status=status,
            script_text=json.dumps(board, ensure_ascii=False),
            outputs_json=outputs,
            qc_score=qc,
        )
        studio_context.save_assistant_message(
            f"Flow2 Preview #{job_id} ฉาก1 source={((scene_rec.get('image_meta') or {}).get('source'))} QC={qc:.0f}",
            "flow2",
        )
        return {"ok": ok, "job_id": job_id, "outputs": outputs, "qc_score": qc, "preview": True}
    except Exception as e:
        logger.exception("[Flow2] preview failed")
        outputs["error"] = str(e)
        media_db.update_job(job_id, status="failed", error=str(e), outputs_json=outputs)
        return {"ok": False, "job_id": job_id, "error": str(e)}


def run_flow2(
    topic: str = "",
    scenario: str = "repair",
    user_brief: str = "",
    job_id: int | None = None,
    character: str = "man",
    attach_watermark: bool = False,
    attach_subtitles: bool = True,
    continue_from_preview: bool = False,
    preset_job_id: int | None = None,
    success_id: int | None = None,
) -> dict[str, Any]:
    logger = setup_logger("reel_factory")
    media_db.init_db()
    env = load_env()
    character = character or env.get("HOOK_DEFAULT_CHARACTER", "man")

    preset = resolve_preset(preset_job_id=preset_job_id, success_id=success_id)
    merged = merge_run_fields(
        preset,
        topic=topic,
        user_brief=user_brief,
        scenario=scenario,
        character=character,
        attach_subtitles=attach_subtitles,
    )
    topic = merged["topic"]
    brief = merged["user_brief"]
    scenario = merged["scenario"] or "repair"
    character = merged["character"] or character
    if merged["attach_subtitles"] is not None:
        attach_subtitles = bool(merged["attach_subtitles"])
    preset = merged.get("preset")

    ctx = studio_context.build_agent_prompt(
        "flow2",
        "คุณคือ AI โปรดิวเซอร์ Reel AQOND Flow 2",
        f"หัวข้อ: {topic or user_brief}\nสถานการณ์: {scenario}",
    )

    if not topic:
        topic = brief[:120] if brief else "AQOND — app.aqond.com"

    if job_id is None:
        job_id = media_db.create_job("flow2", topic=topic, theme=scenario, user_brief=brief)

    work = OUTPUT_DIR / f"job_{job_id}"
    work.mkdir(parents=True, exist_ok=True)

    existing: dict[str, Any] | None = None
    board: list[dict[str, Any]] = []
    if continue_from_preview and job_id:
        row = media_db.get_job(job_id)
        if row and row.get("status") == "preview_ready":
            existing = row.get("outputs") or {}
            board = existing.get("storyboard") or []
            if isinstance(row.get("script_text"), str) and row["script_text"].strip().startswith("["):
                try:
                    board = board or json.loads(row["script_text"])
                except json.JSONDecodeError:
                    pass

    outputs: dict[str, Any] = {
        "scenes": [],
        "final_video": "",
        "scenario": scenario,
        "topic": topic,
        "character": character,
        "attach_subtitles": attach_subtitles,
        "progress": "starting",
        "preview_mode": False,
        "preview_approved": continue_from_preview,
        "continued_from_preview": continue_from_preview,
    }
    if continue_from_preview and existing:
        outputs["preview_video"] = existing.get("preview_video", "")
    if preset:
        outputs["preset_from_job_id"] = preset.get("source_job_id")
        if preset.get("success_id"):
            outputs["preset_from_success_id"] = preset.get("success_id")

    if uses_sd_webui() and not attach_subtitles:
        attach_subtitles = True
        outputs["attach_subtitles"] = True
        logger.info("[Flow2] A1111/SD mode — forcing subtitles on (local SD cannot render Thai text)")

    try:
        if continue_from_preview and board:
            logger.info("[Flow2] Continue from preview job #%s — reuse storyboard + scene 1 image", job_id)
            _update_progress(job_id, outputs, "continue_preview", logger)
        else:
            _update_progress(job_id, outputs, "storyboard", logger)
            board = generate_storyboard(
                topic,
                scenario,
                brief,
                ctx,
                job_id,
                logger,
                preset_storyboard=preset.get("storyboard") if preset else None,
                preset_brief=(preset.get("user_brief") or "") if preset else "",
            )
        outputs["storyboard"] = board

        scenes_out: list[dict[str, Any]] = []
        clip_paths: list[Path] = []

        for i, sc in enumerate(board[:5]):
            scene_num = i + 1
            _update_progress(job_id, outputs, f"scene_{scene_num}", logger)

            skip_image = continue_from_preview and scene_num == 1
            scene_rec, clip_path = _render_flow2_scene(
                sc,
                scene_num,
                work=work,
                scenario=scenario,
                topic=topic,
                job_id=job_id,
                character=character,
                attach_subtitles=attach_subtitles,
                logger=logger,
                skip_image=skip_image,
            )
            if clip_path:
                clip_paths.append(clip_path)

            scenes_out.append(scene_rec)
            outputs["scenes"] = scenes_out

        _update_progress(job_id, outputs, "concat", logger)
        final = OUTPUT_DIR / f"REEL_{job_id}.mp4"
        ok_final = _concat_scenes(clip_paths, final, logger) if clip_paths else False

        if ok_final and attach_watermark:
            _update_progress(job_id, outputs, "watermark", logger)
            wm_meta = apply_reel_watermark(final, logger)
            outputs["watermark_meta"] = wm_meta

        if ok_final:
            outputs["final_video"] = str(final)
            _update_progress(job_id, outputs, "video_ready", logger)

        _update_progress(job_id, outputs, "copy", logger)
        try:
            copy = generate_reel_copy(topic, scenario, ctx, job_id, brief, board, logger)
        except Exception as e:
            logger.warning("[Flow2] Copy failed — using empty caption: %s", e)
            copy = {}
        outputs["copy"] = copy

        enrich_job_outputs("flow2", outputs, clip_count=len(clip_paths))
        qc = outputs.get("qc_score_computed") or compute_flow2_qc(outputs, len(clip_paths))

        outputs["progress"] = "done"
        status = "completed" if ok_final and len(clip_paths) >= 3 else ("partial" if clip_paths else "failed")

        media_db.update_job(
            job_id,
            status=status,
            script_text=json.dumps(board, ensure_ascii=False),
            outputs_json=outputs,
            qc_score=qc,
        )

        studio_context.save_assistant_message(
            f"Flow2 Reel '{topic[:40]}' — {len(clip_paths)}/5 ฉาก QC={qc:.0f}",
            "flow2",
        )

        return {"ok": ok_final or bool(clip_paths), "job_id": job_id, "outputs": outputs, "qc_score": qc}
    except Exception as e:
        logger.exception("[Flow2] failed")
        media_db.update_job(job_id, status="failed", error=str(e))
        return {"ok": False, "job_id": job_id, "error": str(e)}


def list_scenarios() -> list[dict[str, str]]:
    return SCENARIOS


def list_characters() -> list[dict[str, str]]:
    return CHARACTERS


def get_voice_sample_text() -> str:
    return VOICE_SAMPLE_TEXT
