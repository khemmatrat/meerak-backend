"""
Flow 3 — Story Cinema 1:40–3:00, 6 Acts 16:9
Screenplay → Grok Video clips → AQOND TTS narration → FFmpeg assembly

มาตรฐานอ้างอิงคลิปใน grokVideo/ (Grok Imagine Video + เสียงบรรยายไทย)
"""

from __future__ import annotations

import json
import logging
import re
import subprocess
from pathlib import Path
from typing import Any

from factory import media_db, studio_context
from factory.grok_video_api import generate_video_clip
from factory.hook_factory import (
    create_subtitles_srt,
    generate_voice_aqond_tts,
    get_audio_duration,
    load_env,
    setup_logger,
)
from factory.prompt_expander import clean_prompt_structure, GROK_PROMPT_MAX_CHARS
from factory.reel_factory import _concat_scenes
from factory.studio_trust import compute_flow3_qc, enrich_job_outputs
from factory.preview_utils import preview_narration
from factory.job_presets import merge_run_fields
from factory.success_library import resolve_preset
from factory.rocky_editor_api import _validate_media_file

OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent / "output" / "media_studio" / "flow3"

ACTS = [
    {"act": 1, "name": "Hook — ปัญหา"},
    {"act": 2, "name": "ตัวละคร"},
    {"act": 3, "name": "ความขัดแย้ง"},
    {"act": 4, "name": "จุดเปลี่ยน AQOND"},
    {"act": 5, "name": "ผลลัพธ์"},
    {"act": 6, "name": "CTA ปิดท้าย"},
]

CINEMA_STYLE_SUFFIX = (
    "Cinematic 16:9 short film, expressive Thai characters, natural lighting, "
    "believable environment, dynamic camera movement, emotional storytelling, "
    "photoreal human motion, no on-screen text, no logos, no subtitles."
)


def _flow3_int(env: dict[str, str], key: str, default: int, lo: int, hi: int) -> int:
    try:
        v = int((env.get(key) or str(default)).strip())
    except ValueError:
        v = default
    return max(lo, min(hi, v))


def _flow3_bool(env: dict[str, str], key: str, default: bool = True) -> bool:
    raw = (env.get(key) or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def _update_progress(
    job_id: int,
    outputs: dict[str, Any],
    step: str,
    logger: logging.Logger,
) -> None:
    outputs["progress"] = step
    try:
        media_db.update_job(job_id, outputs_json=outputs)
    except Exception as e:
        logger.debug("[Flow3] progress: %s", e)


def _screenplay(story: str, context: str, logger: logging.Logger) -> list[dict[str, Any]]:
    env = load_env()
    act_count = _flow3_int(env, "FLOW3_ACT_COUNT", 6, 3, 12)
    clip_dur = _flow3_int(env, "FLOW3_CLIP_DURATION", 12, 5, 15)

    prompt = f"""เขียนบท Story Cinema ภาษาไทย {act_count} Acts สำหรับ AQOND (รวม 2-3 นาทีเมื่อพากย์)
เรื่อง: {story}
{context}

สไตล์อ้างอิง: หนังสั้นไวรัลไทย — มีอารมณ์ขัน/drama/heartwarming ตัวละครมีชีวิต ฉากเปลี่ยนชัดเจน
Acts 1-3: ปัญหาและความขัดแย้ง | Act 4-5: จุดเปลี่ยน/ผลลัพธ์ (ถ้าเรื่องเกี่ยว AQOND ให้ Act 4 แนะนำแอปอย่างเป็นธรรมชาติ) | Act 6: CTA อบอุ่น

JSON array {act_count} acts:
[
  {{
    "act": 1,
    "title": "ชื่อ act",
    "narration": "บทบรรยายไทย 2-4 ประโยค อ่านออกเสียงได้",
    "visual": "English scene description for AI video — who, where, action, emotion, camera",
    "duration_sec": {clip_dur}
  }}
]

visual ต้องเป็นภาษาอังกฤษ ไม่ใส่ข้อความบนจอ ไม่ใส่โลโก้
duration_sec ใช้ {clip_dur} หรือ 10-15 ตามจังหวะฉาก"""

    gemini_key = env.get("GEMINI_API_KEY", "").strip()
    if gemini_key:
        try:
            import google.generativeai as genai

            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel(env.get("GEMINI_MODEL", "gemini-1.5-flash"))
            resp = model.generate_content(prompt)
            text = (resp.text or "").strip()
            m = re.search(r"\[[\s\S]*\]", text)
            if m:
                data = json.loads(m.group())
                if isinstance(data, list) and data:
                    return data[:act_count]
        except Exception as e:
            logger.warning("[Flow3] screenplay failed: %s", e)

    return [
        {
            "act": a["act"],
            "title": a["name"],
            "narration": f"Act {a['act']}: {story[:80]} — {a['name']}",
            "visual": f"Cinematic Thai short film scene, {a['name']}, {story[:60]}, emotional storytelling",
            "duration_sec": clip_dur,
        }
        for a in ACTS[:act_count]
    ]


def _adapt_screenplay_from_preset(
    script: list[dict[str, Any]],
    story: str,
    context: str,
    logger: logging.Logger,
) -> list[dict[str, Any]] | None:
    """Rewrite narration/visual from a successful preset for a new story."""
    primary = (story or "").strip()
    if not primary or not script:
        return None

    env = load_env()
    act_count = min(len(script), _flow3_int(env, "FLOW3_ACT_COUNT", 6, 3, 12))
    sample = json.dumps(script[:act_count], ensure_ascii=False)[:3000]
    prompt = f"""ปรับ screenplay Story Cinema {act_count} Acts จากต้นแบบที่สำเร็จแล้ว ให้เข้ากับเรื่องใหม่

เรื่องใหม่: {primary}
{context}

ต้นแบบ (JSON):
{sample}

กฎ:
- คงจำนวน act และโครง drama เดิม
- เปลี่ยน narration เป็นภาษาไทยใหม่ให้เข้ากับเรื่อง (ไม่ copy ตรงๆ)
- visual ปรับเป็นภาษาอังกฤษให้สอดคล้องเรื่องใหม่
- ส่ง JSON array เท่านั้น"""

    gemini_key = env.get("GEMINI_API_KEY", "").strip()
    if gemini_key:
        try:
            import google.generativeai as genai

            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel(env.get("GEMINI_MODEL", "gemini-1.5-flash"))
            resp = model.generate_content(prompt)
            text = (resp.text or "").strip()
            m = re.search(r"\[[\s\S]*\]", text)
            if m:
                data = json.loads(m.group())
                if isinstance(data, list) and len(data) >= 3:
                    return data[:act_count]
        except Exception as e:
            logger.warning("[Flow3] preset screenplay adapt failed: %s", e)
    return None


def generate_screenplay(
    story: str,
    context: str,
    logger: logging.Logger,
    preset_screenplay: list[dict[str, Any]] | None = None,
    preset_story: str = "",
) -> list[dict[str, Any]]:
    if preset_screenplay and isinstance(preset_screenplay, list) and len(preset_screenplay) >= 3:
        same_story = not (story or "").strip() or (story or "").strip() == (preset_story or "").strip()
        if same_story:
            logger.info("[Flow3] Reusing preset screenplay (%d acts)", len(preset_screenplay))
            return preset_screenplay
        adapted = _adapt_screenplay_from_preset(preset_screenplay, story, context, logger)
        if adapted:
            logger.info("[Flow3] Adapted preset screenplay for new story")
            return adapted
        logger.info("[Flow3] Preset adapt failed — reuse preset structure")
        return preset_screenplay
    return _screenplay(story, context, logger)


def _expand_cinema_visual(
    visual: str,
    story: str,
    act: int,
    title: str,
    narration: str,
    total: int,
    creativity: str,
    logger: logging.Logger,
) -> str:
    """ขยาย visual เป็น Grok Video prompt แบบ cinema (ไม่ใช่ cyberpunk fantasy)."""
    env = load_env()
    grok_key = env.get("XAI_API_KEY", "").strip()
    is_aqond_beat = act >= 4 and "aqond" in story.lower()

    if grok_key:
        expansion_prompt = f"""Write ONE concise TEXT-TO-VIDEO motion prompt in English for Grok Imagine Video.

Scene beat: "{visual.strip()}"
Story: "{story[:200]}"
Act {act}/{total}: {title}
Narration mood (Thai): "{narration[:160]}"

AQOND Story Cinema style (reference: Thai viral short films, natural comedy/drama):
- 16:9 cinematic, expressive Thai people, realistic environments (home, office, street, nature)
- Camera: tracking shot, dolly, reaction close-ups, smooth motion
- Emotional arc: humor, tension, relief — avoid cyberpunk/neon unless the story requires it
- Photoreal human motion; NO on-screen text, logos, QR, or subtitles
{"- This beat introduces AQOND app solution naturally (phone in hand, relief smile) — still cinematic not UI mockup" if is_aqond_beat else ""}

Creativity: {creativity}. Max 120 words — motion and emotion first."""

        payload = {
            "model": env.get("GROK_MODEL", "grok-3"),
            "messages": [{"role": "user", "content": expansion_prompt}],
            "max_tokens": 350,
            "temperature": 0.65 if creativity in ("high", "extreme") else 0.5,
        }
        try:
            from urllib.request import Request, urlopen

            req = Request(
                "https://api.x.ai/v1/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {grok_key}",
                    "Content-Type": "application/json",
                },
            )
            with urlopen(req, timeout=45) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            expanded = (
                result.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
                .strip()
            )
            if expanded:
                out = clean_prompt_structure(f"{expanded} {CINEMA_STYLE_SUFFIX}", GROK_PROMPT_MAX_CHARS)
                logger.info("[Flow3] Expanded act %d prompt (%d chars)", act, len(out))
                return out
        except Exception as e:
            logger.warning("[Flow3] Grok expand failed act %d: %s", act, e)

    fallback = (
        f"{visual.strip()}. {CINEMA_STYLE_SUFFIX} "
        f"Act {act} of {total}: {title}. Thai characters, cinematic camera movement."
    )
    return clean_prompt_structure(fallback, GROK_PROMPT_MAX_CHARS)


def _generate_act_grok(
    prompt: str,
    duration: int,
    creativity: str,
    ref_path: str | None,
    job_id: int,
    act_index: int,
    logger: logging.Logger,
) -> Path | None:
    env = load_env()
    try:
        min_bytes = int((env.get("GROK_VIDEO_MIN_BYTES") or "120000").strip())
    except ValueError:
        min_bytes = 120_000

    for attempt in range(1, 3):
        clip = generate_video_clip(
            prompt,
            duration,
            creativity,
            logger,
            reference_image_path=ref_path,
            project_id=f"flow3_{job_id}",
            scene_index=act_index,
        )
        if clip and Path(clip).is_file():
            p = Path(clip)
            if p.stat().st_size >= min_bytes and _validate_media_file(str(p), logger):
                return p
        logger.warning("[Flow3] Grok act %d attempt %d failed", act_index + 1, attempt)
    return None


def _escape_ffmpeg_path(path: Path) -> str:
    p = str(path.resolve()).replace("\\", "/")
    if len(p) >= 2 and p[1] == ":":
        p = p[0] + "\\:" + p[2:]
    return p.replace("'", r"\'")


def _merge_act_video(
    grok_clip: Path,
    audio_path: Path,
    srt_path: Path | None,
    output_path: Path,
    logger: logging.Logger,
    *,
    attach_subtitles: bool = True,
) -> bool:
    duration = max(1.0, get_audio_duration(audio_path))
    vf = (
        "scale=1920:1080:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2"
    )
    if attach_subtitles and srt_path and srt_path.is_file():
        srt_esc = _escape_ffmpeg_path(srt_path)
        vf += (
            f",subtitles='{srt_esc}':force_style="
            "'FontSize=26,PrimaryColour=&H00FFFFFF,Outline=2,OutlineColour=&H00000000,"
            "Alignment=2,MarginV=70'"
        )

    cmd = [
        "ffmpeg", "-y",
        "-stream_loop", "-1", "-i", str(grok_clip),
        "-i", str(audio_path),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "22",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-map", "0:v:0", "-map", "1:a:0",
        "-t", str(duration),
        "-movflags", "+faststart",
        str(output_path),
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            logger.error("[Flow3] merge act ffmpeg: %s", (r.stderr or r.stdout)[-600:])
            return False
        ok = output_path.is_file() and output_path.stat().st_size > 5000
        if ok:
            logger.info("[Flow3] Act merged → %s (%.1f s)", output_path.name, duration)
        return ok
    except Exception as e:
        logger.error("[Flow3] merge act exception: %s", e)
        return False


def _render_flow3_act(
    act: dict[str, Any],
    act_index: int,
    *,
    work: Path,
    story: str,
    total_acts: int,
    job_id: int,
    character: str,
    creativity: str,
    attach_subtitles: bool,
    use_grok: bool,
    env: dict[str, str],
    logger: logging.Logger,
    prev_grok: Path | None,
    narration_override: str | None = None,
    skip_grok: bool = False,
    grok_duration_override: int | None = None,
) -> tuple[dict[str, Any], Path | None, Path | None]:
    """Returns act record, merged clip path (if ok), grok raw path for continuity."""
    act_num = int(act.get("act", act_index + 1))
    narration_full = (act.get("narration") or "").strip()
    narration = narration_override if narration_override is not None else narration_full
    visual = (act.get("visual") or story).strip()
    title = act.get("title", f"Act {act_index + 1}")
    dur = _flow3_int(env, "FLOW3_CLIP_DURATION", 12, 5, 15)
    if grok_duration_override is not None:
        dur = grok_duration_override
    else:
        try:
            dur = max(5, min(15, int(act.get("duration_sec", dur))))
        except (TypeError, ValueError):
            pass

    grok_raw = work / f"act_{act_index + 1}_grok.mp4"
    aud = work / f"act_{act_index + 1}.mp3"
    srt = work / f"act_{act_index + 1}.srt"
    clip = work / f"act_{act_index + 1}.mp4"

    expanded = _expand_cinema_visual(
        visual, story, act_num, title, narration_full, total_acts, creativity, logger
    )

    grok_ok = False
    new_prev: Path | None = prev_grok
    if skip_grok and grok_raw.is_file():
        grok_ok = True
        new_prev = grok_raw
    elif use_grok:
        ref = str(prev_grok.resolve()) if prev_grok and prev_grok.is_file() else None
        grok_path = _generate_act_grok(
            expanded, dur, creativity, ref, job_id, act_index, logger
        )
        if grok_path:
            grok_raw.write_bytes(Path(grok_path).read_bytes())
            new_prev = grok_raw
            grok_ok = True

    tts_ok = bool(narration) and generate_voice_aqond_tts(
        narration, aud, character, logger
    )

    merged = False
    if grok_ok and tts_ok and aud.is_file() and aud.stat().st_size > 100:
        if attach_subtitles:
            create_subtitles_srt(narration, get_audio_duration(aud), srt)
        merged = _merge_act_video(
            grok_raw,
            aud,
            srt if attach_subtitles else None,
            clip,
            logger,
            attach_subtitles=attach_subtitles,
        )

    act_entry = {
        "act": act_num,
        "title": title,
        "narration": narration_full,
        "visual": visual,
        "grok_prompt": expanded[:500],
        "grok_raw": str(grok_raw) if grok_ok else "",
        "audio": str(aud) if tts_ok else "",
        "video": str(clip) if merged else "",
        "preview_narration": narration if narration != narration_full else "",
    }
    return act_entry, clip if merged else None, new_prev


def run_flow3_preview(
    story: str = "",
    user_brief: str = "",
    job_id: int | None = None,
    character: str = "man_narrator",
    preset_job_id: int | None = None,
    success_id: int | None = None,
) -> dict[str, Any]:
    """Phase 3 — screenplay + Grok act 1 + short preview clip."""
    logger = setup_logger("cinema_factory")
    media_db.init_db()
    env = load_env()
    character = character or env.get("FLOW3_DEFAULT_CHARACTER") or env.get("HOOK_DEFAULT_CHARACTER", "man_narrator")
    creativity = (env.get("FLOW3_CREATIVITY") or "medium").strip().lower()
    attach_subtitles = _flow3_bool(env, "FLOW3_SUBTITLES", True)
    use_grok = _flow3_bool(env, "FLOW3_USE_GROK", True)
    preview_grok_dur = _flow3_int(env, "FLOW3_PREVIEW_GROK_DURATION", 8, 5, 12)

    preset = resolve_preset(preset_job_id=preset_job_id, success_id=success_id)
    merged = merge_run_fields(
        preset,
        story=story,
        user_brief=user_brief,
        character=character,
    )
    story = merged["story"]
    user_brief = merged["user_brief"]
    character = merged["character"] or character

    ctx = studio_context.build_agent_prompt(
        "flow3",
        "คุณคือ AI ผู้กำกับ Story Cinema AQOND Flow 3",
        f"เรื่อง: {story or user_brief}",
    )
    if not story:
        story = user_brief or "คนทำงานโดนเบี้ยวเงิน แล้วเจอ AQOND MatchJob"

    if job_id is None:
        job_id = media_db.create_job("flow3", topic=story, user_brief=user_brief)

    work = OUTPUT_DIR / f"job_{job_id}"
    work.mkdir(parents=True, exist_ok=True)

    outputs: dict[str, Any] = {
        "acts": [],
        "final_video": "",
        "duration_target": "1:40-3:00",
        "engine": "grok_video" if use_grok else "slideshow",
        "character": character,
        "story": story,
        "progress": "preview_screenplay",
        "preview_mode": True,
        "preview_ready": False,
    }
    if preset:
        outputs["preset_from_job_id"] = preset.get("source_job_id")
        if preset.get("success_id"):
            outputs["preset_from_success_id"] = preset.get("success_id")

    try:
        if use_grok and not env.get("XAI_API_KEY", "").strip():
            raise RuntimeError("FLOW3 preview ต้องมี XAI_API_KEY")

        script = generate_screenplay(
            story,
            ctx,
            logger,
            preset_screenplay=preset.get("screenplay") if preset else None,
            preset_story=(preset.get("story") or "") if preset else "",
        )
        if not script:
            raise RuntimeError("screenplay ว่าง")

        act0 = script[0]
        snippet = preview_narration(act0.get("narration") or story)
        _update_progress(job_id, outputs, "preview_act_1", logger)

        act_entry, clip_path, _ = _render_flow3_act(
            act0,
            0,
            work=work,
            story=story,
            total_acts=len(script),
            job_id=job_id,
            character=character,
            creativity=creativity,
            attach_subtitles=attach_subtitles,
            use_grok=use_grok,
            env=env,
            logger=logger,
            prev_grok=None,
            narration_override=snippet,
            grok_duration_override=preview_grok_dur,
        )
        outputs["acts"] = [act_entry]
        outputs["screenplay"] = script

        preview_clip = work / "preview_act_1.mp4"
        if clip_path and clip_path.is_file():
            preview_clip.write_bytes(clip_path.read_bytes())
            outputs["preview_video"] = str(preview_clip)

        ok = bool(outputs.get("preview_video"))
        outputs["preview_ready"] = ok
        outputs["preview_snippet"] = snippet
        outputs["progress"] = "preview_done"

        enrich_job_outputs("flow3", outputs)
        qc = float(outputs.get("qc_score_computed") or 0)
        status = "preview_ready" if ok else "failed"

        media_db.update_job(
            job_id,
            status=status,
            script_text=json.dumps(script, ensure_ascii=False),
            outputs_json=outputs,
            qc_score=qc,
        )
        studio_context.save_assistant_message(
            f"Flow3 Preview #{job_id} Act1 QC={qc:.0f}",
            "flow3",
        )
        return {"ok": ok, "job_id": job_id, "outputs": outputs, "qc_score": qc, "preview": True}
    except Exception as e:
        logger.exception("[Flow3] preview failed")
        outputs["error"] = str(e)
        media_db.update_job(job_id, status="failed", error=str(e), outputs_json=outputs)
        return {"ok": False, "job_id": job_id, "error": str(e)}


def run_flow3(
    story: str = "",
    user_brief: str = "",
    job_id: int | None = None,
    character: str = "man_narrator",
    continue_from_preview: bool = False,
    preset_job_id: int | None = None,
    success_id: int | None = None,
) -> dict[str, Any]:
    logger = setup_logger("cinema_factory")
    media_db.init_db()
    env = load_env()
    character = character or env.get("FLOW3_DEFAULT_CHARACTER") or env.get("HOOK_DEFAULT_CHARACTER", "man_narrator")
    creativity = (env.get("FLOW3_CREATIVITY") or "medium").strip().lower()
    attach_subtitles = _flow3_bool(env, "FLOW3_SUBTITLES", True)
    use_grok = _flow3_bool(env, "FLOW3_USE_GROK", True)

    preset = resolve_preset(preset_job_id=preset_job_id, success_id=success_id)
    merged = merge_run_fields(
        preset,
        story=story,
        user_brief=user_brief,
        character=character,
    )
    story = merged["story"]
    user_brief = merged["user_brief"]
    character = merged["character"] or character

    ctx = studio_context.build_agent_prompt(
        "flow3",
        "คุณคือ AI ผู้กำกับ Story Cinema AQOND Flow 3 — สไตล์ grokVideo คลิปไวรัลไทย",
        f"เรื่อง: {story or user_brief}",
    )

    if not story:
        story = user_brief or "คนทำงานโดนเบี้ยวเงิน แล้วเจอ AQOND MatchJob"

    if job_id is None:
        job_id = media_db.create_job("flow3", topic=story, user_brief=user_brief)

    work = OUTPUT_DIR / f"job_{job_id}"
    work.mkdir(parents=True, exist_ok=True)

    outputs: dict[str, Any] = {
        "acts": [],
        "final_video": "",
        "duration_target": "1:40-3:00",
        "engine": "grok_video" if use_grok else "slideshow",
        "character": character,
        "story": story,
        "progress": "screenplay",
        "preview_mode": False,
        "preview_approved": continue_from_preview,
        "continued_from_preview": continue_from_preview,
    }
    if preset:
        outputs["preset_from_job_id"] = preset.get("source_job_id")
        if preset.get("success_id"):
            outputs["preset_from_success_id"] = preset.get("success_id")

    existing_script: list[dict[str, Any]] | None = None
    if continue_from_preview and job_id:
        row = media_db.get_job(job_id)
        if row and row.get("status") == "preview_ready":
            ex = row.get("outputs") or {}
            outputs["preview_video"] = ex.get("preview_video", "")
            existing_script = ex.get("screenplay") or []
            if isinstance(row.get("script_text"), str) and row["script_text"].strip().startswith("["):
                try:
                    existing_script = existing_script or json.loads(row["script_text"])
                except json.JSONDecodeError:
                    pass

    try:
        if use_grok and not env.get("XAI_API_KEY", "").strip():
            raise RuntimeError("FLOW3 ต้องมี XAI_API_KEY สำหรับ Grok Video (ดู grokVideo/ เป็นตัวอย่าง)")

        if continue_from_preview and existing_script:
            script = existing_script
            logger.info("[Flow3] Continue from preview #%s — reuse screenplay + act 1 grok", job_id)
            outputs["progress"] = "continue_preview"
        else:
            script = generate_screenplay(
                story,
                ctx,
                logger,
                preset_screenplay=preset.get("screenplay") if preset else None,
                preset_story=(preset.get("story") or "") if preset else "",
            )

        total_acts = len(script)
        acts_out: list[dict[str, Any]] = []
        clip_paths: list[Path] = []
        prev_grok: Path | None = None

        media_db.update_job(
            job_id,
            status="running",
            script_text=json.dumps(script, ensure_ascii=False),
            outputs_json=outputs,
        )

        for i, act in enumerate(script):
            _update_progress(job_id, outputs, f"act_{i + 1}_prompt", logger)
            skip_grok = continue_from_preview and i == 0
            if skip_grok:
                prev_path = work / "act_1_grok.mp4"
                if prev_path.is_file():
                    prev_grok = prev_path

            act_entry, clip_path, prev_grok = _render_flow3_act(
                act,
                i,
                work=work,
                story=story,
                total_acts=total_acts,
                job_id=job_id,
                character=character,
                creativity=creativity,
                attach_subtitles=attach_subtitles,
                use_grok=use_grok,
                env=env,
                logger=logger,
                prev_grok=prev_grok if i > 0 else None,
                skip_grok=skip_grok,
            )
            if clip_path:
                clip_paths.append(clip_path)

            acts_out.append(act_entry)
            outputs["acts"] = acts_out
            _update_progress(job_id, outputs, f"act_{i + 1}_done", logger)

        _update_progress(job_id, outputs, "concat", logger)
        final = OUTPUT_DIR / f"CINEMA_{job_id}.mp4"
        ok_final = _concat_scenes(clip_paths, final, logger) if clip_paths else False

        outputs["final_video"] = str(final) if ok_final else ""
        outputs["progress"] = "done"
        outputs["acts_completed"] = len(clip_paths)
        outputs["acts_total"] = total_acts
        outputs["screenplay"] = script

        enrich_job_outputs("flow3", outputs)
        qc = float(outputs.get("qc_score_computed") or compute_flow3_qc(outputs))

        status = "completed" if ok_final and len(clip_paths) >= max(3, total_acts // 2) else (
            "partial" if clip_paths else "failed"
        )

        media_db.update_job(
            job_id,
            status=status,
            script_text=json.dumps(script, ensure_ascii=False),
            outputs_json=outputs,
            qc_score=qc,
        )

        studio_context.save_assistant_message(
            f"Flow3 Cinema '{story[:40]}' — {len(clip_paths)}/{total_acts} acts Grok QC={qc:.0f}",
            "flow3",
        )

        return {
            "ok": ok_final or bool(clip_paths),
            "job_id": job_id,
            "outputs": outputs,
            "qc_score": qc,
        }
    except Exception as e:
        logger.exception("[Flow3] failed")
        outputs["progress"] = "failed"
        outputs["error"] = str(e)
        media_db.update_job(job_id, status="failed", error=str(e), outputs_json=outputs)
        return {"ok": False, "job_id": job_id, "error": str(e)}


def list_acts() -> list[dict[str, Any]]:
    return ACTS
