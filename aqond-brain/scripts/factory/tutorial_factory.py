"""Flow 4 — Tutorial Video Generator (slide + TTS + FFmpeg 16:9)"""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path
from typing import Any

from factory import media_db, studio_context
from factory.hook_factory import (
    create_subtitles_srt,
    generate_voice_aqond_tts,
    get_audio_duration,
    load_env,
    setup_logger,
)
from factory.reel_factory import _concat_scenes
from factory.tutorial_slide import render_tutorial_slide
from factory.tutorial_topics import TOPICS, list_topics

OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent / "output" / "media_studio" / "flow4"


def _compile_slide_video(
    image_path: Path,
    audio_path: Path,
    srt_path: Path,
    output_path: Path,
    logger: logging.Logger,
) -> bool:
    duration = get_audio_duration(audio_path)
    srt_esc = str(srt_path.resolve()).replace("\\", "/").replace(":", "\\:")
    vf = (
        f"scale=1920:1080:force_original_aspect_ratio=decrease,"
        f"pad=1920:1080:(ow-iw)/2:(oh-ih)/2,"
        f"subtitles='{srt_esc}':force_style="
        f"'FontSize=24,PrimaryColour=&H00FFFFFF,Outline=2,OutlineColour=&H00000000,"
        f"Alignment=2,MarginV=80'"
    )
    cmd = [
        "ffmpeg", "-y", "-loop", "1", "-i", str(image_path),
        "-i", str(audio_path), "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart", "-t", str(duration), "-shortest",
        str(output_path),
    ]
    r = subprocess.run(cmd, capture_output=True, timeout=180)
    ok = r.returncode == 0 and output_path.is_file()
    if not ok:
        logger.warning("[Flow4] FFmpeg slide failed: %s", (r.stderr or b"")[-300:])
    return ok


def run_flow4(
    topic_id: str = "start",
    user_brief: str = "",
    job_id: int | None = None,
    character: str = "man",
) -> dict[str, Any]:
    logger = setup_logger("tutorial_factory")
    media_db.init_db()
    env = load_env()
    character = character or env.get("HOOK_DEFAULT_CHARACTER", "man")

    topic = TOPICS.get(topic_id) or TOPICS["start"]
    brief = (user_brief or "").strip()

    ctx = studio_context.build_agent_prompt(
        "flow4",
        "คุณคือ AI สร้าง Tutorial AQOND Flow 4",
        f"หัวข้อ: {topic['title']}\n{brief}",
    )

    if job_id is None:
        job_id = media_db.create_job(
            "flow4", topic=topic["title"], theme=topic_id, user_brief=brief
        )

    work = OUTPUT_DIR / f"job_{job_id}"
    work.mkdir(parents=True, exist_ok=True)

    script = topic["script"]
    outputs: dict[str, Any] = {
        "topic_id": topic_id,
        "slides": [],
        "final_video": "",
        "copy": {
            "facebook": topic["posts"]["facebook"],
            "instagram": topic["posts"]["instagram"],
            "youtube_short": topic["posts"]["youtube_short"],
            "hashtags": "#AQOND #Tutorial #สอนใช้งาน #แอปไทย",
            "headline": topic["title"],
        },
        "progress": "starting",
        "character": character,
    }

    try:
        clips: list[Path] = []
        slides_out: list[dict[str, Any]] = []

        for i, sc in enumerate(script):
            vo = sc["vo"]
            headline = sc.get("headline", topic["title"])
            outputs["progress"] = f"slide_{i + 1}"
            media_db.update_job(job_id, outputs_json=outputs)

            img = work / f"slide_{i}.png"
            aud = work / f"slide_{i}.mp3"
            srt = work / f"slide_{i}.srt"
            clip = work / f"slide_{i}.mp4"

            render_tutorial_slide(
                i, headline, topic.get("sub", ""), topic["title"], img, logger
            )
            tts_ok = generate_voice_aqond_tts(vo, aud, character, logger)
            clip_ok = False
            if img.is_file() and tts_ok and aud.stat().st_size > 100:
                create_subtitles_srt(vo, get_audio_duration(aud), srt)
                clip_ok = _compile_slide_video(img, aud, srt, clip, logger)
            if clip_ok:
                clips.append(clip)

            slides_out.append({
                "slide": i,
                "vo": vo,
                "headline": headline,
                "image": str(img) if img.is_file() else "",
                "video": str(clip) if clip.is_file() else "",
            })
            outputs["slides"] = slides_out

        final = OUTPUT_DIR / f"TUTORIAL_{job_id}.mp4"
        ok_final = _concat_scenes(clips, final, logger) if clips else False
        if ok_final:
            outputs["final_video"] = str(final)

        outputs["progress"] = "done"
        qc = min(100.0, 30 + len(clips) * 10 + (15 if ok_final else 0))
        status = "completed" if ok_final and len(clips) >= 5 else ("partial" if clips else "failed")

        media_db.update_job(
            job_id,
            status=status,
            script_text=json.dumps(script, ensure_ascii=False),
            outputs_json=outputs,
            qc_score=qc,
        )
        studio_context.save_assistant_message(
            f"Flow4 Tutorial '{topic['title'][:40]}' — {len(clips)} slides QC={qc:.0f}",
            "flow4",
        )
        return {"ok": ok_final, "job_id": job_id, "outputs": outputs, "qc_score": qc}
    except Exception as e:
        logger.exception("[Flow4] failed")
        media_db.update_job(job_id, status="failed", error=str(e))
        return {"ok": False, "job_id": job_id, "error": str(e)}
