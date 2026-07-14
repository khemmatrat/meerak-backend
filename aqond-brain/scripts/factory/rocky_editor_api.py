"""
Rocky (The Editor) — Professional Auto-Editor (Zero-Touch)
Options:
1. Pro Auto-Editor: Beat detection + transitions + effects (2 min/video)
2. Claude Timeline: AI-powered timeline (fallback)
3. Simple Concat: Direct concatenation (fastest)
"""

from __future__ import annotations

import json
import logging
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent
ENV_FILE = AQOND_BRAIN / ".env"
BGM_PATH = AQOND_BRAIN / "config" / "assets" / "bgm.mp3"


def extract_first_frame_jpeg(
    video_path: str,
    out_jpg: Path,
    logger: logging.Logger | None = None,
) -> bool:
    """
    Reference Anchor — export first frame for image-to-video continuity on the next shot.
    """
    log = logger or logging.getLogger("rocky_editor")
    vp = Path(video_path)
    if not vp.is_file():
        return False
    try:
        out_jpg.parent.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        log.warning("[Ref Anchor] mkdir: %s", e)
        return False
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(vp),
        "-vf",
        "select=eq(n\\,0)",
        "-vframes",
        "1",
        str(out_jpg),
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        if r.returncode != 0:
            log.debug("[Ref Anchor] ffmpeg: %s", (r.stderr or "")[-300:])
            return False
        return out_jpg.is_file() and out_jpg.stat().st_size > 800
    except (OSError, subprocess.TimeoutExpired) as e:
        log.warning("[Ref Anchor] failed: %s", e)
        return False


def resolve_continuity_reference(
    *,
    character_ref_abs: str | None,
    previous_clip_path: str | None,
    project_id: str,
    shot_index: int,
    logger: logging.Logger | None = None,
) -> str | None:
    """
    Priority: brand character ref → first-frame anchor from the previous Grok clip.
    """
    if character_ref_abs and Path(character_ref_abs).is_file():
        return character_ref_abs
    if shot_index <= 0 or not (previous_clip_path or "").strip():
        return None
    pp = Path(previous_clip_path.strip())
    if not pp.is_file():
        return None
    if not project_id:
        return None
    out = AQOND_BRAIN / "output" / "refs" / project_id / f"anchor_{shot_index - 1}.jpg"
    if extract_first_frame_jpeg(str(pp), out, logger):
        return str(out.resolve())
    return None
LOGO_PATH = AQOND_BRAIN / "config" / "assets" / "logo.png"
FONTS_DIR = AQOND_BRAIN / "config" / "fonts"

# subprocess cancelled by user (distinct from normal failure)
_CANCELLED_RC = -9


def _terminate_popen(proc: subprocess.Popen, logger: logging.Logger) -> None:
    try:
        proc.kill()
    except Exception as e:
        logger.warning("[Subprocess] kill failed: %s", e)
    try:
        proc.wait(timeout=20)
    except subprocess.TimeoutExpired:
        logger.warning("[Subprocess] still alive after kill")


def _run_subprocess_cancelable(
    args: list,
    *,
    timeout: float | None,
    cwd: str | None,
    logger: logging.Logger,
    cancel_event: threading.Event | None,
    capture_output: bool = True,
    text: bool = True,
    poll: float = 0.25,
) -> subprocess.CompletedProcess:
    """Run a subprocess; poll cancel_event and kill on cancel or total timeout."""
    if cancel_event and cancel_event.is_set():
        return subprocess.CompletedProcess(args, _CANCELLED_RC, "", "cancelled")

    popen_kw: dict = {}
    if sys.platform == "win32":
        popen_kw["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]

    proc = subprocess.Popen(
        args,
        cwd=cwd,
        stdout=subprocess.PIPE if capture_output else subprocess.DEVNULL,
        stderr=subprocess.PIPE if capture_output else subprocess.DEVNULL,
        text=text,
        **popen_kw,
    )
    deadline = time.monotonic() + timeout if timeout is not None else None
    while True:
        if cancel_event and cancel_event.is_set():
            logger.warning("[Subprocess] cancelled — killing: %s", " ".join(str(x) for x in args[:4]))
            _terminate_popen(proc, logger)
            return subprocess.CompletedProcess(args, _CANCELLED_RC, "", "cancelled")
        try:
            out, err = proc.communicate(timeout=poll)
            rc = proc.returncode if proc.returncode is not None else -1
            return subprocess.CompletedProcess(args, rc, out or "", err or "")
        except subprocess.TimeoutExpired:
            if deadline is not None and time.monotonic() >= deadline:
                logger.error("[Subprocess] timeout — killing: %s", " ".join(str(x) for x in args[:4]))
                _terminate_popen(proc, logger)
                raise subprocess.TimeoutExpired(cmd=args, timeout=timeout) from None
            continue


def _load_env() -> dict[str, str]:
    out = {}
    if not ENV_FILE.exists():
        return out
    for line in open(ENV_FILE, "r", encoding="utf-8"):
        line = line.split("#")[0].strip()
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        if v:
            out[k.strip()] = v
    return out


def edit_video_pro(
    raw_clips: list[str],
    script_md: str,
    project_id: str,
    audio_path: str | None = None,
    logger: logging.Logger | None = None,
    effect_preset: str = "fantasy",
    cancel_event: threading.Event | None = None,
) -> tuple[str | None, str | None]:
    """
    Professional Auto-Editor (NEW — Zero-Touch)
    
    Features:
    - Beat detection (sync to narration)
    - Smart transitions (crossfade)
    - Color grading (Fantasy, Sci-Fi, Cinematic)
    - Dynamic subtitles (Kanit)
    - FFmpeg effects (motion blur, bloom)
    
    Args:
        raw_clips: List of video clips
        script_md: Script markdown
        project_id: Project ID
        audio_path: Narration audio
        logger: Logger
        effect_preset: "fantasy", "scifi", "cinematic", "realistic"
    
    Returns:
        (output_path, error_message)
    """
    log = logger or logging.getLogger("rocky_editor_pro")

    if cancel_event and cancel_event.is_set():
        log.warning("[Rocky Pro] Cancelled before start")
        return (None, "cancelled")

    if not audio_path or not Path(audio_path).exists():
        log.warning("[Rocky Pro] No audio — fallback to old editor")
        if cancel_event and cancel_event.is_set():
            return (None, "cancelled")
        return edit_video_with_claude(
            raw_clips, script_md, project_id, audio_path, logger, cancel_event=cancel_event
        )

    try:
        from factory.pro_auto_editor import auto_edit_video

        output_path = f"output/previews/{project_id}.mp4"
        output_full = str(AQOND_BRAIN / output_path)

        log.info("[Rocky Pro] Starting professional auto-editing...")
        log.info("[Rocky Pro] Effect preset: %s", effect_preset)

        success = auto_edit_video(
            clips=raw_clips,
            audio_path=audio_path,
            script_md=script_md,
            output_path=output_full,
            logger=log,
            effect_preset=effect_preset,
            cancel_event=cancel_event,
            bgm_path=str(BGM_PATH) if BGM_PATH.is_file() else None,
        )

        if success:
            log.info("[Rocky Pro] ✅ Professional editing complete: %s", output_path)
            return (output_full, None)
        if cancel_event and cancel_event.is_set():
            log.warning("[Rocky Pro] Cancelled after auto_edit failure")
            return (None, "cancelled")
        log.error("[Rocky Pro] Failed — trying fallback")
        if cancel_event and cancel_event.is_set():
            return (None, "cancelled")
        return edit_video_with_claude(
            raw_clips, script_md, project_id, audio_path, logger, cancel_event=cancel_event
        )

    except Exception as e:
        log.error("[Rocky Pro] Error: %s — fallback to old editor", e)
        if cancel_event and cancel_event.is_set():
            return (None, "cancelled")
        return edit_video_with_claude(
            raw_clips, script_md, project_id, audio_path, logger, cancel_event=cancel_event
        )


def edit_video_with_claude(
    raw_clips: list[str],
    script_md: str,
    project_id: str,
    audio_path: str | None = None,
    logger: logging.Logger | None = None,
    cancel_event: threading.Event | None = None,
) -> tuple[str | None, str | None]:
    """
    ให้ Claude วาง timeline การตัดต่อ → FFmpeg ประมวลผล
    Fallback: ถ้า Claude ไม่มี credits → ใช้ simple timeline (ต่อคลิปตามลำดับ)
    คืน (preview_video_path, error_message)
    """
    log = logger or logging.getLogger("rocky_editor")
    if cancel_event and cancel_event.is_set():
        log.warning("[Rocky Editor] Cancelled before timeline")
        return (None, "cancelled")
    env = _load_env()
    api_key = env.get("ANTHROPIC_API_KEY", "").strip()

    timeline = None
    bgm_vol = 0.2
    overlays = []

    if api_key:
        if cancel_event and cancel_event.is_set():
            return (None, "cancelled")
        result = _call_claude_timeline_api(raw_clips, script_md, api_key, log)
        if cancel_event and cancel_event.is_set():
            return (None, "cancelled")
        if result[0]:  # timeline exists
            timeline, bgm_vol, overlays = result[0], result[1], result[2]
        else:
            err = result[3] if len(result) > 3 else ""
            if err and ("credit balance" in err.lower() or "quota" in err.lower()):
                log.warning("[Rocky Editor] Claude ไม่มี credits — ใช้ simple timeline")
                timeline = _generate_simple_timeline(raw_clips, log)
                bgm_vol = 0.2
                overlays = []
            else:
                return (None, err or "Claude timeline ล้มเหลว")
    else:
        log.info("[Rocky Editor] ไม่มี ANTHROPIC_API_KEY")
        if cancel_event and cancel_event.is_set():
            return (None, "cancelled")

        # Use audio-synced timeline (ถ้ามีเสียง)
        if audio_path and Path(audio_path).exists():
            from factory.audio_sync import sync_clips_to_audio
            timeline = sync_clips_to_audio(raw_clips, audio_path, log)
            log.info("[Rocky Editor] Audio-synced timeline: %d segments", len(timeline))
        else:
            timeline = _generate_simple_timeline(raw_clips, log)
            log.info("[Rocky Editor] Simple timeline (no audio)")
        
        bgm_vol = 0.2
        overlays = []

    if not timeline:
        return (None, "ไม่มี timeline")

    if cancel_event and cancel_event.is_set():
        return (None, "cancelled")

    final_path = _execute_ffmpeg_edit(
        raw_clips,
        timeline,
        bgm_vol,
        overlays,
        project_id,
        script_md,
        audio_path,
        log,
        cancel_event=cancel_event,
    )
    if cancel_event and cancel_event.is_set():
        return (None, "cancelled")
    if not final_path:
        return (None, "FFmpeg ประมวลผลล้มเหลว")

    return (final_path, None)


def _call_claude_timeline_api(
    raw_clips: list[str],
    script_md: str,
    api_key: str,
    logger: logging.Logger,
) -> tuple[list[dict] | None, float, list[str], str | None]:

    # Ask Claude for editing timeline
    system = """You are Rocky, a professional video editor for Aqond.
You receive raw clips and a script. Output ONLY valid JSON with this schema:
{
  "timeline": [
    {"clip_index": 0, "start_sec": 0, "end_sec": 3.5, "transition": "fade"},
    {"clip_index": 1, "start_sec": 0, "end_sec": 5.0, "transition": "cut"},
    ...
  ],
  "bgm_volume": 0.2,
  "overlay_text": ["Hook text here", "CTA text at end"]
}

Rules:
- Pick best clips from the raw list
- Keep total duration 30-60s
- Use 'fade' or 'cut' transitions
- overlay_text for Hook + CTA (max 2 items)
"""

    clips_info = "\n".join([f"Clip {i}: {Path(c).name}" for i, c in enumerate(raw_clips)])
    user_prompt = f"""Script:
---
{script_md[:8000]}
---

Available raw clips:
{clips_info}

Generate the editing timeline JSON now."""

    payload_json = json.dumps(
        {
            "model": "claude-sonnet-4-6",
            "max_tokens": 2000,
            "temperature": 0.4,
            "system": system,
            "messages": [{"role": "user", "content": user_prompt}],
        }
    ).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "User-Agent": "aqond-brain/rocky-editor",
    }

    req = Request("https://api.anthropic.com/v1/messages", data=payload_json, headers=headers, method="POST")

    try:
        with urlopen(req, timeout=150) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        content_blocks = data.get("content", [])
        text = ""
        for block in content_blocks:
            if block.get("type") == "text":
                text += block.get("text", "")
        
        text = text.strip()
        if text.startswith("```"):
            import re
            text = re.sub(r"^```\w*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
        
        timeline_data = json.loads(text)
        timeline = timeline_data.get("timeline", [])
        bgm_vol = timeline_data.get("bgm_volume", 0.2)
        overlays = timeline_data.get("overlay_text", [])

        if not timeline:
            return (None, 0.2, [], "Claude ไม่คืน timeline")

        logger.info("[Rocky Editor Claude] วาง timeline: %d segments", len(timeline))
        return (timeline, bgm_vol, overlays, None)

    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        msg = f"HTTP {e.code}: {body[:500]}"
        logger.error("[Rocky Editor Claude] %s", msg)
        return (None, 0.2, [], msg)
    except (URLError, json.JSONDecodeError, OSError) as e:
        msg = str(e)
        logger.error("[Rocky Editor Claude] %s", msg)
        return (None, 0.2, [], msg)


def _generate_simple_timeline(raw_clips: list[str], logger: logging.Logger) -> list[dict]:
    """Simple fallback: ต่อคลิปตามลำดับ ไม่ตัด (ใช้เต็มความยาว)"""
    timeline = []
    for idx, clip in enumerate(raw_clips):
        timeline.append({
            "clip_index": idx,
            "start_sec": 0,
            "end_sec": 999,  # ใช้เต็ม
            "transition": "fade" if idx > 0 else "cut",
        })
    logger.info("[Rocky Editor] Simple timeline: %d clips ต่อกันตามลำดับ", len(timeline))
    return timeline


def _probe_duration_sec(path: Path) -> float:
    r = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path.resolve()),
        ],
        capture_output=True,
        text=True,
        timeout=15,
    )
    if r.returncode != 0 or not (r.stdout or "").strip():
        return 0.0
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def _video_has_audio_stream(path: Path) -> bool:
    r = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=index",
            "-of",
            "csv=p=0",
            str(path.resolve()),
        ],
        capture_output=True,
        text=True,
        timeout=15,
    )
    return bool((r.stdout or "").strip()) and r.returncode == 0


def _concat_demuxer_line(path: Path) -> str:
    s = str(path.resolve()).replace("\\", "/")
    s = s.replace("'", "'\\''")
    return f"file '{s}'"


def _segment_uses_full_clip(seg: dict, clip_path: Path) -> bool:
    """ฉากใช้คลิปเต็มจากจุดเริ่ม (ไม่ตัดย่อย) → ต่อด้วย stream copy ได้"""
    try:
        start = float(seg.get("start_sec", 0) or 0)
    except (TypeError, ValueError):
        start = 0.0
    try:
        end_f = float(seg.get("end_sec", 999))
    except (TypeError, ValueError):
        end_f = 999.0
    if start > 0.08:
        return False
    if end_f >= 500:
        return True
    dur = _probe_duration_sec(clip_path)
    if dur <= 0.2:
        return False
    return end_f >= dur - 0.35


def _execute_ffmpeg_edit_preserve(
    valid_clips: list[str],
    timeline: list[dict],
    bgm_volume: float,
    project_id: str,
    script_md: str,
    audio_path: str | None,
    out_path: Path,
    logger: logging.Logger,
    cancel_event: threading.Event | None,
) -> str | None:
    """
    ต่อ scene 1→N แบบมาตรฐาน: concat + -c copy เมื่อทุกช่วงเป็นคลิปเต็ม
    ถ้ามีตัดย่อย → encode แต่ละช่วงครั้งเดียว (crf 18 / medium) แล้ว concat copy
    ไม่มี vignette / drawtext / encode ซ้ำหลายรอบ
    """
    logger.info("[Rocky Preserve] project_id=%s segments=%d", project_id, len(timeline))
    with tempfile.TemporaryDirectory(prefix="rocky_preserve_") as tmp_s:
        tmp = Path(tmp_s)
        merged = tmp / "merged.mp4"

        ordered: list[tuple[dict, Path]] = []
        for seg in timeline:
            ci = int(seg.get("clip_index", 0))
            if ci < 0 or ci >= len(valid_clips):
                continue
            p = Path(valid_clips[ci])
            if p.is_file():
                ordered.append((seg, p.resolve()))

        if not ordered:
            logger.error("[Rocky Preserve] ไม่มี segment ที่ใช้ได้")
            return None

        all_full = all(_segment_uses_full_clip(s, cp) for s, cp in ordered)

        if all_full:
            lst = tmp / "concat_full.txt"
            lst.write_text(
                "\n".join(_concat_demuxer_line(cp) for _, cp in ordered) + "\n",
                encoding="utf-8",
            )
            ok = _run_subprocess_cancelable(
                [
                    "ffmpeg",
                    "-y",
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    str(lst),
                    "-c",
                    "copy",
                    str(merged),
                ],
                timeout=600,
                cwd=None,
                logger=logger,
                cancel_event=cancel_event,
            )
            if ok.returncode == _CANCELLED_RC:
                return None
            if ok.returncode != 0 or not merged.is_file() or merged.stat().st_size < 2000:
                err = (ok.stderr or "")[:800]
                logger.warning(
                    "[Rocky Preserve] concat -c copy ล้มเหลว (codec/พารามิเตอร์คนละแบบ?) — สำรองแบบ encode ครั้งเดียว: %s",
                    err,
                )
                all_full = False

        if not all_full:
            trimmed: list[Path] = []
            for idx, (seg, src) in enumerate(ordered):
                start = float(seg.get("start_sec", 0) or 0)
                end = float(seg.get("end_sec", 999))
                trim_out = tmp / f"trim_{idx:02d}.mp4"
                has_a = _video_has_audio_stream(src)
                if end >= 500:
                    args = [
                        "ffmpeg",
                        "-y",
                        "-ss",
                        str(max(0.0, start)),
                        "-i",
                        str(src),
                        "-c:v",
                        "libx264",
                        "-preset",
                        "medium",
                        "-crf",
                        "18",
                        "-pix_fmt",
                        "yuv420p",
                    ]
                    if has_a:
                        args += ["-c:a", "aac", "-b:a", "192k"]
                    else:
                        args += ["-an"]
                    args += [str(trim_out)]
                else:
                    dur = max(0.5, end - start)
                    args = [
                        "ffmpeg",
                        "-y",
                        "-ss",
                        str(max(0.0, start)),
                        "-i",
                        str(src),
                        "-t",
                        str(dur),
                        "-c:v",
                        "libx264",
                        "-preset",
                        "medium",
                        "-crf",
                        "18",
                        "-pix_fmt",
                        "yuv420p",
                    ]
                    if has_a:
                        args += ["-c:a", "aac", "-b:a", "192k"]
                    else:
                        args += ["-an"]
                    args += [str(trim_out)]
                r = _run_subprocess_cancelable(
                    args,
                    timeout=300,
                    cwd=None,
                    logger=logger,
                    cancel_event=cancel_event,
                )
                if r.returncode == _CANCELLED_RC:
                    return None
                if r.returncode != 0 or not trim_out.is_file() or trim_out.stat().st_size < 1000:
                    logger.error("[Rocky Preserve] trim segment %d ล้มเหลว", idx)
                    return None
                trimmed.append(trim_out)

            lst = tmp / "concat_trim.txt"
            lst.write_text("\n".join(_concat_demuxer_line(p) for p in trimmed) + "\n", encoding="utf-8")
            r = _run_subprocess_cancelable(
                [
                    "ffmpeg",
                    "-y",
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    str(lst),
                    "-c",
                    "copy",
                    str(merged),
                ],
                timeout=600,
                cwd=None,
                logger=logger,
                cancel_event=cancel_event,
            )
            if r.returncode == _CANCELLED_RC:
                return None
            if r.returncode != 0 or not merged.is_file():
                r2 = _run_subprocess_cancelable(
                    [
                        "ffmpeg",
                        "-y",
                        "-f",
                        "concat",
                        "-safe",
                        "0",
                        "-i",
                        str(lst),
                        "-c:v",
                        "libx264",
                        "-preset",
                        "medium",
                        "-crf",
                        "18",
                        "-pix_fmt",
                        "yuv420p",
                        "-c:a",
                        "aac",
                        "-b:a",
                        "192k",
                        str(merged),
                    ],
                    timeout=600,
                    cwd=None,
                    logger=logger,
                    cancel_event=cancel_event,
                )
                if r2.returncode != 0 or not merged.is_file() or merged.stat().st_size < 2000:
                    logger.error("[Rocky Preserve] concat หลัง trim ล้มเหลว")
                    return None

        with_bgm = merged
        if BGM_PATH.exists():
            with_bgm = tmp / "with_bgm.mp4"
            if _video_has_audio_stream(merged):
                r = _run_subprocess_cancelable(
                    [
                        "ffmpeg",
                        "-y",
                        "-i",
                        str(merged),
                        "-i",
                        str(BGM_PATH),
                        "-filter_complex",
                        f"[1:a]volume={bgm_volume}[bgm];[0:a][bgm]amix=inputs=2:duration=shortest[aout]",
                        "-map",
                        "0:v",
                        "-map",
                        "[aout]",
                        "-c:v",
                        "copy",
                        "-c:a",
                        "aac",
                        str(with_bgm),
                    ],
                    timeout=300,
                    cwd=None,
                    logger=logger,
                    cancel_event=cancel_event,
                )
            else:
                r = _run_subprocess_cancelable(
                    [
                        "ffmpeg",
                        "-y",
                        "-i",
                        str(merged),
                        "-i",
                        str(BGM_PATH),
                        "-map",
                        "0:v",
                        "-map",
                        "1:a",
                        "-c:v",
                        "copy",
                        "-c:a",
                        "aac",
                        "-shortest",
                        str(with_bgm),
                    ],
                    timeout=300,
                    cwd=None,
                    logger=logger,
                    cancel_event=cancel_event,
                )
            if r.returncode == _CANCELLED_RC:
                return None
            if r.returncode != 0 or not with_bgm.is_file():
                logger.warning("[Rocky Preserve] ใส่ BGM ไม่สำเร็จ — ใช้วิดีโอไม่มี BGM")
                with_bgm = merged

        voiceover_mp3: Path | None = None
        if audio_path and Path(audio_path).exists():
            if _validate_media_file(audio_path, logger, cancel_event=cancel_event):
                voiceover_mp3 = Path(audio_path)
        if voiceover_mp3 is None:
            from factory.grok_tts_api import generate_tts

            voiceover_tmp = tmp / "voiceover.mp3"
            if generate_tts(
                script_md[:8000],
                str(voiceover_tmp),
                voice_id="ara",
                language="th",
                logger=logger,
            ) and _validate_media_file(str(voiceover_tmp), logger, cancel_event=cancel_event):
                voiceover_mp3 = voiceover_tmp

        current = with_bgm
        if voiceover_mp3 and voiceover_mp3.is_file():
            if _video_has_audio_stream(with_bgm):
                with_vo = tmp / "with_vo.mp4"
                r = _run_subprocess_cancelable(
                    [
                        "ffmpeg",
                        "-y",
                        "-i",
                        str(with_bgm),
                        "-i",
                        str(voiceover_mp3),
                        "-filter_complex",
                        f"[1:a]volume=1.0[vo];[0:a]volume={bgm_volume * 0.3}[bgm];[vo][bgm]amix=inputs=2:duration=longest[aout]",
                        "-map",
                        "0:v",
                        "-map",
                        "[aout]",
                        "-c:v",
                        "copy",
                        "-c:a",
                        "aac",
                        "-b:a",
                        "192k",
                        str(with_vo),
                    ],
                    timeout=300,
                    cwd=None,
                    logger=logger,
                    cancel_event=cancel_event,
                )
            else:
                with_vo = tmp / "with_vo.mp4"
                r = _run_subprocess_cancelable(
                    [
                        "ffmpeg",
                        "-y",
                        "-i",
                        str(with_bgm),
                        "-i",
                        str(voiceover_mp3),
                        "-map",
                        "0:v",
                        "-map",
                        "1:a",
                        "-c:v",
                        "copy",
                        "-c:a",
                        "aac",
                        "-b:a",
                        "192k",
                        "-shortest",
                        str(with_vo),
                    ],
                    timeout=300,
                    cwd=None,
                    logger=logger,
                    cancel_event=cancel_event,
                )
            if r.returncode == 0 and with_vo.is_file() and with_vo.stat().st_size > 2000:
                current = with_vo
                logger.info("[Rocky Preserve] ผสมเสียงพากย์แล้ว (วิดีโอ stream copy)")
            else:
                logger.warning("[Rocky Preserve] ผสม voiceover ไม่สำเร็จ — ส่งออกเฉพาะวิดีโอ")

        r_final = _run_subprocess_cancelable(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(current),
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                str(out_path),
            ],
            timeout=300,
            cwd=None,
            logger=logger,
            cancel_event=cancel_event,
        )
        if r_final.returncode == _CANCELLED_RC:
            return None
        if r_final.returncode != 0 or not out_path.is_file() or out_path.stat().st_size < 2000:
            logger.error("[Rocky Preserve] remux สุดท้ายล้มเหลว: %s", (r_final.stderr or "")[:600])
            return None

        logger.info(
            "[Rocky Preserve] เสร็จแล้ว (คุณภาพใกล้ต้นทาง): %s (%.1f KB)",
            out_path.name,
            out_path.stat().st_size / 1024,
        )
        return str(out_path)


def _validate_media_file(
    file_path: str,
    logger: logging.Logger,
    cancel_event: threading.Event | None = None,
) -> bool:
    """ตรวจสอบไฟล์ .mp4 หรือ .mp3 ว่าใช้งานได้"""
    p = Path(file_path).resolve()
    if not p.exists():
        logger.warning("[Validate] ไฟล์ไม่มี: %s", p.name)
        return False

    size = p.stat().st_size
    if size < 1000:  # < 1 KB
        logger.warning("[Validate] ไฟล์เล็กเกินไป (%d bytes): %s", size, p.name)
        return False

    try:
        r = _run_subprocess_cancelable(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(p.resolve()),
            ],
            timeout=5,
            cwd=None,
            logger=logger,
            cancel_event=cancel_event,
        )
        if r.returncode == _CANCELLED_RC:
            return False
        if r.returncode == 0 and r.stdout.strip():
            duration = float(r.stdout.strip())
            if duration > 0.5:
                return True
        logger.warning("[Validate] ffprobe ล้มเหลว (exit %d): %s", r.returncode, p.name)
        return False
    except subprocess.TimeoutExpired:
        logger.warning("[Validate] ffprobe timeout: %s", p.name)
        return False
    except Exception as e:
        logger.warning("[Validate] %s: %s", p.name, e)
        return False


def _clear_temp_files(logger: logging.Logger) -> None:
    """ล้างไฟล์ขยะใน output/.tmp_* (เก็บ .tmp_clips ไว้ก่อน)"""
    tmp_dirs = [d for d in (AQOND_BRAIN / "output").glob(".tmp_*") if d.name != ".tmp_clips"]
    for d in tmp_dirs:
        try:
            import shutil
            shutil.rmtree(d, ignore_errors=True)
            logger.info("[Clear Temp] ลบแล้ว: %s", d.name)
        except:
            pass


def _execute_ffmpeg_edit(
    raw_clips: list[str],
    timeline: list[dict],
    bgm_volume: float,
    overlays: list[str],
    project_id: str,
    script_md: str,
    audio_path: str | None,
    logger: logging.Logger,
    cancel_event: threading.Event | None = None,
) -> str | None:
    """
    ค่าเริ่มต้น: ต่อคลิปแบบรักษาคุณภาพ (concat + stream copy ถ้าเป็นคลิปเต็ม)
    ตั้ง ROCKY_EDITOR_LEGACY_FILTERS=1 เพื่อใช้เส้นทางเดิม (trim ultrafast + vignette + encode ซ้ำ)
    """
    _clear_temp_files(logger)

    valid_clips: list[str] = []
    for clip in raw_clips:
        if cancel_event and cancel_event.is_set():
            logger.warning("[Rocky Editor] Cancelled during clip validation")
            return None
        if _validate_media_file(clip, logger, cancel_event=cancel_event):
            valid_clips.append(clip)
        elif cancel_event and cancel_event.is_set():
            return None
        else:
            logger.warning("[Rocky Editor] ข้ามคลิปเสีย: %s", Path(clip).name)

    if not valid_clips:
        logger.error("[Rocky Editor] ไม่มีคลิปที่ใช้งานได้")
        return None

    if len(valid_clips) < len(raw_clips):
        logger.warning("[Rocky Editor] ใช้ได้เพียง %d/%d clips", len(valid_clips), len(raw_clips))

    preview_dir = AQOND_BRAIN / "output" / "previews"
    preview_dir.mkdir(parents=True, exist_ok=True)

    from datetime import datetime, timezone

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_path = preview_dir / f"{project_id}_{ts}.mp4"

    env = _load_env()
    if env.get("ROCKY_EDITOR_LEGACY_FILTERS", "").strip() == "1":
        logger.info("[Rocky Editor] ใช้โหมด LEGACY (vignette / encode หลายรอบ)")
        return _execute_ffmpeg_edit_legacy(
            valid_clips,
            timeline,
            bgm_volume,
            overlays,
            script_md,
            audio_path,
            out_path,
            logger,
            cancel_event,
        )

    logger.info("[Rocky Editor] โหมด preserve — ต่อคลิปใกล้คุณภาพต้นทาง (Grok/grokVideo)")
    return _execute_ffmpeg_edit_preserve(
        valid_clips,
        timeline,
        bgm_volume,
        project_id,
        script_md,
        audio_path,
        out_path,
        logger,
        cancel_event,
    )


def _execute_ffmpeg_edit_legacy(
    valid_clips: list[str],
    timeline: list[dict],
    bgm_volume: float,
    overlays: list[str],
    script_md: str,
    audio_path: str | None,
    out_path: Path,
    logger: logging.Logger,
    cancel_event: threading.Event | None,
) -> str | None:
    """เส้นทางเดิม: trim ultrafast + concat re-encode + vignette + final encode"""
    _ = overlays
    with tempfile.TemporaryDirectory(prefix="rocky_edit_") as tmp:
        tmp = Path(tmp)
        concat_list = tmp / "concat.txt"
        
        # 1) Trim clips ตาม timeline และสร้าง concat list
        trimmed = []
        for idx, seg in enumerate(timeline):
            clip_idx = seg.get("clip_index", 0)
            if clip_idx >= len(valid_clips):
                continue
            src = Path(valid_clips[clip_idx])
            if not src.exists():
                continue
            
            start = seg.get("start_sec", 0)
            end = seg.get("end_sec", 5)
            
            trim_out = tmp / f"trim_{idx:02d}.mp4"
            
            # ถ้า end = 999 หมายถึงใช้เต็มความยาว
            if end >= 500:
                args = [
                    "ffmpeg", "-y", "-ss", str(start), "-i", str(src),
                    "-c:v", "libx264", "-preset", "ultrafast",
                    "-c:a", "aac", str(trim_out)
                ]
            else:
                dur = max(0.5, end - start)
                args = [
                    "ffmpeg", "-y", "-ss", str(start), "-i", str(src),
                    "-t", str(dur), "-c:v", "libx264", "-preset", "ultrafast",
                    "-c:a", "aac", str(trim_out)
                ]
            
            try:
                r = _run_subprocess_cancelable(
                    args,
                    timeout=60,
                    cwd=None,
                    logger=logger,
                    cancel_event=cancel_event,
                )
                if r.returncode == _CANCELLED_RC:
                    logger.warning("[Rocky Editor] Trim cancelled")
                    return None
                if r.returncode == 0 and trim_out.exists() and trim_out.stat().st_size > 1000:
                    trimmed.append(trim_out)
                else:
                    logger.warning("[Rocky Editor] Trim %d ล้มเหลว (skip)", idx)
            except subprocess.TimeoutExpired:
                logger.warning("[Rocky Editor] Trim %d timeout (skip)", idx)

        if not trimmed:
            logger.error("[Rocky Editor] ไม่มีคลิปใด trim สำเร็จ")
            return None

        # 2) Concat clips
        with open(concat_list, "w", encoding="utf-8") as f:
            for t in trimmed:
                f.write(f"file '{t.name}'\n")

        merged = tmp / "merged.mp4"
        # Re-encode with SMART TIMEOUT (2 minutes max)
        args = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", str(concat_list),
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            str(merged)
        ]
        
        try:
            r = _run_subprocess_cancelable(
                args,
                timeout=120,
                cwd=str(tmp),
                logger=logger,
                cancel_event=cancel_event,
            )
        except subprocess.TimeoutExpired:
            logger.error("[Rocky Editor] concat TIMEOUT (>2 min) — kill process")
            return None

        if r.returncode == _CANCELLED_RC:
            logger.warning("[Rocky Editor] concat cancelled")
            return None

        if r.returncode != 0:
            stderr = (r.stderr or "")[:1000]
            logger.error("[Rocky Editor] concat ล้มเหลว: %s", stderr)
            return None
        if not merged.exists() or merged.stat().st_size < 1000:
            logger.error("[Rocky Editor] merged.mp4 เล็กเกินไป (%d bytes)", merged.stat().st_size if merged.exists() else 0)
            return None
        logger.info("[Rocky Editor] Concat สำเร็จ: %.1f KB", merged.stat().st_size / 1024)

        # 3) Add BGM (ถ้ามี)
        with_bgm = merged
        if BGM_PATH.exists():
            with_bgm = tmp / "with_bgm.mp4"
            args = [
                "ffmpeg", "-y", "-i", str(merged), "-i", str(BGM_PATH),
                "-filter_complex",
                f"[1:a]volume={bgm_volume}[bgm];[0:a][bgm]amix=inputs=2:duration=shortest[aout]",
                "-map", "0:v", "-map", "[aout]",
                "-c:v", "copy", "-c:a", "aac", str(with_bgm)
            ]
            r = _run_subprocess_cancelable(
                args,
                timeout=120,
                cwd=None,
                logger=logger,
                cancel_event=cancel_event,
            )
            if r.returncode == _CANCELLED_RC:
                logger.warning("[Rocky Editor] BGM step cancelled")
                return None
            if r.returncode != 0:
                with_bgm = merged

        # 4) Use pre-generated Grok TTS audio (from Minnie) + VALIDATE
        voiceover_mp3 = None
        
        if audio_path and Path(audio_path).exists():
            # Validate audio file
            if cancel_event and cancel_event.is_set():
                return None
            if _validate_media_file(audio_path, logger, cancel_event=cancel_event):
                voiceover_mp3 = Path(audio_path)
                logger.info("[Rocky Editor] ใช้ audio จาก Minnie (validated)")
            elif cancel_event and cancel_event.is_set():
                return None
            else:
                logger.warning("[Rocky Editor] Audio จาก Minnie เสีย — เจนใหม่")
                from factory.grok_tts_api import generate_tts
                voiceover_tmp = tmp / "voiceover_new.mp3"
                from factory.script_segmentation import gather_voiceover_text_for_tts

                vo_text = gather_voiceover_text_for_tts(script_md) or (script_md or "")[:8000]
                if generate_tts(vo_text, str(voiceover_tmp), voice_id="ara", language="th", logger=logger):
                    if _validate_media_file(str(voiceover_tmp), logger, cancel_event=cancel_event):
                        voiceover_mp3 = voiceover_tmp
                    elif cancel_event and cancel_event.is_set():
                        return None
        else:
            # Fallback: generate audio here
            from factory.grok_tts_api import generate_tts

            from factory.script_segmentation import gather_voiceover_text_for_tts

            voiceover_tmp = tmp / "voiceover.mp3"
            vo_text = gather_voiceover_text_for_tts(script_md) or (script_md or "")[:8000]
            vo_success = generate_tts(vo_text, str(voiceover_tmp), voice_id="ara", language="th", logger=logger)
            if vo_success and _validate_media_file(str(voiceover_tmp), logger, cancel_event=cancel_event):
                voiceover_mp3 = voiceover_tmp
                logger.info("[Rocky Editor] เจน Grok TTS (fallback) แล้ว")
            elif cancel_event and cancel_event.is_set():
                return None
        
        # 5) Mix voiceover with video + BGM (SMART TIMEOUT)
        if voiceover_mp3 and voiceover_mp3.exists():
            with_vo = tmp / "with_voiceover.mp4"
            # Voiceover (main) + BGM (soft background)
            args = [
                "ffmpeg", "-y", "-i", str(with_bgm), "-i", str(voiceover_mp3),
                "-filter_complex", f"[1:a]volume=1.0[vo];[0:a]volume={bgm_volume * 0.3}[bgm];[vo][bgm]amix=inputs=2:duration=longest[aout]",
                "-map", "0:v", "-map", "[aout]",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                str(with_vo)
            ]
            try:
                r = _run_subprocess_cancelable(
                    args,
                    timeout=120,
                    cwd=None,
                    logger=logger,
                    cancel_event=cancel_event,
                )
                if r.returncode == _CANCELLED_RC:
                    logger.warning("[Rocky Editor] Audio mix cancelled")
                    return None
                if r.returncode == 0 and with_vo.exists() and with_vo.stat().st_size > 5000:
                    with_bgm = with_vo
                    logger.info("[Rocky Editor] ผสม Grok TTS + BGM แล้ว")
                else:
                    logger.warning("[Rocky Editor] Audio mix ล้มเหลว (ใช้วิดีโอเดิม)")
            except subprocess.TimeoutExpired:
                logger.error("[Rocky Editor] Audio mix TIMEOUT (>2 min) — skip")

        # 6) Advanced FFmpeg filters: Vignette + Color Correction + Subtitles
        from factory.visual_upgrade import create_subtitle_file_utf8, get_kanit_font
        
        # Extract subtitle lines
        subtitle_lines = []
        for line in script_md.split("\n"):
            line = line.strip()
            if line and not line.startswith("#") and not line.startswith("**") and len(line) > 20:
                subtitle_lines.append(line[:120])
        
        # Build advanced video filter chain
        video_filters = []
        
        # 1) Vignette effect (cinematic dark edges)
        video_filters.append("vignette=PI/4")
        
        # 2) Color correction (vibrant + contrast)
        video_filters.append("eq=contrast=1.2:brightness=0.05:saturation=1.3")
        
        # 3) Unsharp mask (clarity)
        video_filters.append("unsharp=5:5:1.0:5:5:0.0")
        
        # 4) Subtitles (if available)
        srt_path = None
        if subtitle_lines:
            srt_path = tmp / "subtitles.srt"
            create_subtitle_file_utf8(subtitle_lines[:20], srt_path)
            
            kanit_font = get_kanit_font()
            
            if kanit_font and kanit_font.exists() and srt_path.exists():
                # Read subtitle lines
                sub_lines = []
                import re
                srt_text = srt_path.read_text(encoding="utf-8")
                for block in srt_text.split("\n\n"):
                    lines = block.strip().split("\n")
                    if len(lines) >= 3:
                        text_line = lines[2].strip()
                        if text_line:
                            sub_lines.append(text_line)
                
                # Use first 3 lines as samples
                if sub_lines[:3]:
                    texts_safe = [t.replace("'", "").replace('"', '').replace(':', '') for t in sub_lines[:3]]
                    sample_text = " / ".join(texts_safe)[:150]
                    
                    kanit_file = str(kanit_font).replace('\\', '/')
                    drawtext_filter = f"drawtext=fontfile='{kanit_file}':text='{sample_text}':fontsize=24:fontcolor=white@0.85:x=(w-text_w)/2:y=h-80:shadowcolor=black@0.6:shadowx=2:shadowy=2"
                    video_filters.append(drawtext_filter)
        
        # Apply all filters
        if video_filters:
            with_fx = tmp / "with_fx.mp4"
            filter_chain = ",".join(video_filters)
            
            args = [
                "ffmpeg", "-y", "-i", str(with_bgm),
                "-vf", filter_chain,
                "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                "-c:a", "copy",
                str(with_fx)
            ]
            try:
                r = _run_subprocess_cancelable(
                    args,
                    timeout=180,
                    cwd=None,
                    logger=logger,
                    cancel_event=cancel_event,
                )
                if r.returncode == _CANCELLED_RC:
                    logger.warning("[Rocky Editor] Filter chain cancelled")
                    return None
                if r.returncode == 0 and with_fx.exists() and with_fx.stat().st_size > 5000:
                    with_bgm = with_fx
                    logger.info("[Rocky Editor] Applied cinematic filters: vignette + color + clarity + subtitles")
                else:
                    stderr = (r.stderr or "")[:500]
                    logger.warning("[Rocky Editor] Filter chain failed: %s", stderr)
            except subprocess.TimeoutExpired:
                logger.error("[Rocky Editor] Filter chain TIMEOUT (>3 min) — skip")

        # 7) Final encode (SMART TIMEOUT)
        args = [
            "ffmpeg", "-y", "-i", str(with_bgm),
            "-c:v", "libx264", "-preset", "fast", "-crf", "22",
            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
            str(out_path)
        ]
        
        try:
            r = _run_subprocess_cancelable(
                args,
                timeout=120,
                cwd=None,
                logger=logger,
                cancel_event=cancel_event,
            )
        except subprocess.TimeoutExpired:
            logger.error("[Rocky Editor] Final encode TIMEOUT (>2 min) — kill process")
            return None

        if r.returncode == _CANCELLED_RC:
            logger.warning("[Rocky Editor] Final encode cancelled")
            return None

        if r.returncode != 0:
            stderr = (r.stderr or "")[:800]
            stdout = (r.stdout or "")[:800]
            logger.error("[Rocky Editor] final encode ล้มเหลว (exit %d)", r.returncode)
            logger.error("[Rocky Editor] stderr: %s", stderr)
            if "subtitles" in stderr.lower() or "filter" in stderr.lower():
                logger.error("[Rocky Editor] Subtitle filter error detected")
            return None
        
        if not out_path.exists():
            logger.error("[Rocky Editor] Output ไม่มี")
            return None
        
        if out_path.stat().st_size < 5000:
            logger.error("[Rocky Editor] Output เล็กเกินไป (%d bytes)", out_path.stat().st_size)
            return None

        logger.info("[Rocky Editor] เจนวิดีโอแล้ว: %s (%.1f KB)", out_path.name, out_path.stat().st_size / 1024)
        return str(out_path)


