"""
Professional Auto-Editor — Zero-Touch Video Editing
Features:
- Beat Detection: Sync clips to narration rhythm; optional BGM transient snapping
- Smart Transitions: Crossfade, smooth zoom (xfade zoomin), glitch-like slices, wipes
- Color Grading: LUT-style filters + Luxury (contrast, desat, sharpen)
- Dynamic Layouts: Full-bleed, split-screen, framed borders (Instories-style polish)
- Dynamic Subtitles: VO-driven lines, Thai-capable fonts, gold/neon stroke + short fade-in

Goal: 2 hours of manual editing → 2 minutes automated (no XAI required for assembly)
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path
import threading
import time
from collections.abc import Callable
from typing import Any  # noqa: TC003

from factory.scene_cache import verify_output_wall_fresh

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent
DEFAULT_BGM_PATH = AQOND_BRAIN / "config" / "assets" / "bgm.mp3"


def _pick_thai_font_for_drawtext() -> str | None:
    """
    FFmpeg drawtext ต้องใช้ฟอนต์ที่มี gly ph ไทย — Arial ไม่มี → กล่องสี่เหลี่ยม (tofu).
    ลำดับ: Kanit ใน repo → Tahoma / Leelawadee / Arial Unicode → None
    """
    env = (os.getenv("FFMPEG_THAI_FONT") or "").strip()
    if env:
        p = Path(env.replace("/", os.sep))
        if p.is_file():
            return str(p.resolve())
    try:
        from factory.visual_upgrade import get_kanit_font

        k = get_kanit_font()
        if k and k.is_file():
            return str(k.resolve())
    except Exception:
        pass
    windir = Path(os.environ.get("WINDIR", os.environ.get("SystemRoot", r"C:\Windows")))
    fonts = windir / "Fonts"
    if fonts.is_dir():
        for name in (
            "Tahoma.ttf",
            "tahoma.ttf",
            "LeelawUI.ttf",
            "LeelawadeeUI.ttf",
            "LeelaUIb.ttf",
            "arialuni.ttf",
            "NotoSansThai-Regular.ttf",
        ):
            p = fonts / name
            if p.is_file():
                return str(p.resolve())
    return None


def _ffmpeg_fontfile_for_filter(font_path: str) -> str:
    """สำหรับ drawtext=fontfile='...' บน Windows drive letter"""
    fp = str(Path(font_path).resolve()).replace("\\", "/")
    if len(fp) >= 2 and fp[1] == ":":
        return fp[0] + "\\:" + fp[2:]
    return fp


def _escape_drawtext_literal(text: str) -> str:
    """หลบอักขระที่ทำให้ drawtext พัง (รวม colon ในข้อความ)"""
    s = text.replace("\\", r"\\").replace("'", r"\'").replace(":", r"\:")
    return s[:200]


def detect_audio_beats(audio_path: str, logger: logging.Logger) -> list[float]:
    """
    Detect beat/rhythm points in audio for intelligent cutting
    
    Uses librosa for onset detection
    
    Returns:
        List of timestamps (in seconds) where beats occur
    """
    try:
        import librosa
        import numpy as np
        
        logger.info("[Auto-Editor] Analyzing audio beats: %s", Path(audio_path).name)
        
        # Load audio
        y, sr = librosa.load(audio_path, sr=22050)
        
        # Detect onsets (beats)
        onset_frames = librosa.onset.onset_detect(
            y=y,
            sr=sr,
            units='frames',
            hop_length=512,
            backtrack=True
        )
        
        # Convert frames to timestamps
        onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=512)
        
        logger.info("[Auto-Editor] Detected %d beats", len(onset_times))
        
        return onset_times.tolist()
    
    except Exception as e:
        logger.warning("[Auto-Editor] Beat detection failed: %s — using fallback", e)
        # Fallback: uniform cuts every 3 seconds
        return list(range(0, 60, 3))


def scene_timings_from_script_vo(
    script_md: str,
    total_duration: float,
    num_clips: int,
    logger: logging.Logger,
) -> list[tuple[float, float]] | None:
    """
    Split the narration timeline by shot using VO text length (and script duration hints).
    Aligns Grok clips to Thai VO so picture changes track speech — unlike raw beat detection.
    """
    if num_clips <= 0 or total_duration <= 0.2:
        return None
    try:
        from factory.script_segmentation import segment_script_to_shots
    except Exception:
        return None

    specs = segment_script_to_shots(script_md or "")
    if not specs:
        return None
    while len(specs) < num_clips:
        specs.append(specs[-1])
    specs = specs[:num_clips]

    weights: list[float] = []
    for s in specs:
        vo = (s.get("voiceover") or "").strip()
        if vo:
            weights.append(float(max(len(vo), 1)))
        else:
            weights.append(float(max(3, int(s.get("duration_sec", 8) or 8))))
    tw = sum(weights)
    if tw <= 0:
        return None

    timings: list[tuple[float, float]] = []
    acc = 0.0
    for i, w in enumerate(weights):
        if i == num_clips - 1:
            timings.append((acc, total_duration))
        else:
            seg = total_duration * (w / tw)
            nxt = min(acc + seg, total_duration)
            timings.append((acc, nxt))
            acc = nxt
    logger.info(
        "[Auto-Editor] Script/VO-weighted timings (%d clips, audio %.2fs)",
        num_clips,
        total_duration,
    )
    return timings


def calculate_scene_durations(
    beats: list[float],
    total_duration: float,
    num_scenes: int
) -> list[tuple[float, float]]:
    """
    Calculate start/end times for each scene based on audio beats
    
    Args:
        beats: Beat timestamps from audio
        total_duration: Total video duration
        num_scenes: Number of video clips
    
    Returns:
        List of (start_time, end_time) for each scene
    """
    if num_scenes <= 0:
        return []

    if not beats:
        td = total_duration if total_duration > 0 else float(num_scenes * 5)
        scene_length = td / num_scenes
        return [(i * scene_length, (i + 1) * scene_length) for i in range(num_scenes)]

    # Distribute scenes across beat segments
    beat_segments: list[tuple[float, float]] = []
    for i in range(len(beats) - 1):
        beat_segments.append((beats[i], beats[i + 1]))

    # Add final segment
    if beats[-1] < total_duration:
        beat_segments.append((beats[-1], total_duration))

    if not beat_segments:
        td = total_duration if total_duration > 0 else float(num_scenes * 5)
        scene_length = td / num_scenes
        return [(i * scene_length, (i + 1) * scene_length) for i in range(num_scenes)]

    scene_timings = []
    
    for seg_start, seg_end in beat_segments[:num_scenes]:
        scene_timings.append((seg_start, seg_end))
    
    # Fill remaining scenes if needed
    while len(scene_timings) < num_scenes:
        last_end = scene_timings[-1][1] if scene_timings else 0
        scene_timings.append((last_end, last_end + 3))
    
    return scene_timings[:num_scenes]


def snap_scene_boundaries_to_beats(
    timings: list[tuple[float, float]],
    beats: list[float],
    total_duration: float,
    *,
    max_shift_sec: float = 0.22,
    min_scene_sec: float = 0.35,
) -> list[tuple[float, float]]:
    """
    Nudge shot boundaries toward BGM onsets/transients without drifting far from VO timing.
    """
    if not timings or not beats or total_duration <= 0.2:
        return timings
    tb = sorted({float(b) for b in beats if 0.08 < float(b) < total_duration - 0.08})
    if not tb:
        return timings
    n = len(timings)
    boundaries = [0.0]
    for i in range(n - 1):
        orig_end = timings[i][1]
        nearest = min(tb, key=lambda x: abs(x - orig_end))
        adj = orig_end
        if abs(nearest - orig_end) <= max_shift_sec:
            adj = nearest
        adj = max(adj, boundaries[-1] + min_scene_sec)
        adj = min(adj, total_duration - min_scene_sec * (n - 1 - i))
        boundaries.append(adj)
    boundaries.append(total_duration)
    out: list[tuple[float, float]] = []
    for i in range(n):
        s = boundaries[i]
        e = boundaries[i + 1]
        if e <= s + 0.05:
            e = min(s + min_scene_sec, total_duration)
        out.append((s, e))
    return out


def infer_mood_transition_sequence(script_md: str, num_transitions: int) -> list[str]:
    """
    Map script tone to FFmpeg xfade transition names (no LLM — keyword/heuristic).
    """
    if num_transitions <= 0:
        return []
    s = (script_md or "").lower()
    if any(k in s for k in ("glitch", "error", "404", "crash", "bug", "แตก")):
        pool = ("hrslice", "hlwind", "diagtl", "fade")
    elif any(k in s for k in ("!", "ว้าว", "wow", "เร่ง", "รุด", "ระเบิด", "action")):
        pool = ("zoomin", "zoomin", "radial", "fade")
    elif any(k in s for k in ("relax", "ช้า", "calm", "gentle", "นุ่ม", "อ่อน")):
        pool = ("smoothleft", "fade", "smoothright", "fade")
    else:
        pool = ("zoomin", "fade", "smoothleft", "fade")
    return [pool[i % len(pool)] for i in range(num_transitions)]


def _layout_cycle_for_preset(p: dict[str, Any]) -> tuple[str, ...]:
    raw = p.get("layout_cycle")
    if isinstance(raw, (list, tuple)) and raw:
        return tuple(str(x) for x in raw)
    return ("split", "framed", "fullscreen")


def pick_layout_for_shot(clip_idx: int, preset: dict[str, Any]) -> str:
    mode = (preset.get("layout_mode") or "fullscreen").strip().lower()
    if mode in ("full", "fullscreen", "single"):
        return "fullscreen"
    if mode == "split":
        return "split"
    if mode == "framed":
        return "framed"
    if mode == "cycle":
        cycle = _layout_cycle_for_preset(preset)
        return cycle[clip_idx % len(cycle)]
    return "fullscreen"


VIBE_PRESETS = {
    "vibe_fantasy": {
        "label": "Sci-Fi / Action",
        "description": "Bloom, Glow, Neon blue, cinematic motion blur",
        "eq": "eq=saturation=1.4:brightness=0.08:contrast=1.15",
        "color": "colorbalance=rs=-0.05:gs=0.0:bs=0.15:rm=-0.05:gm=0.0:bm=0.15",
        "blur": "gblur=sigma=0.8",
        "vignette": "vignette=angle=PI/5",
        "subtitle_color": "white",
        "subtitle_border": "blue",
        "subtitle_size": 52,
        "subtitle_position": "center",
        "transition": "fade",
        "crf": 18,
    },
    "vibe_tutorial": {
        "label": "Documentary / Tutorial",
        "description": "White balance clean, slow cuts, natural colors",
        "eq": "eq=saturation=1.0:brightness=0.02:contrast=1.05",
        "color": "colorbalance=rs=0.0:gs=0.0:bs=0.0",
        "blur": "",
        "vignette": "",
        "subtitle_color": "white",
        "subtitle_border": "black",
        "subtitle_size": 44,
        "subtitle_position": "bottom",
        "transition": "fade",
        "crf": 20,
    },
    "vibe_viral": {
        "label": "Viral / TikTok",
        "description": "Big yellow subtitles, glitch transitions, punchy",
        "eq": "eq=saturation=1.5:brightness=0.1:contrast=1.2",
        "color": "colorbalance=rs=0.1:gs=0.05:bs=-0.05",
        "blur": "",
        "vignette": "",
        "subtitle_color": "yellow",
        "subtitle_border": "black",
        "subtitle_size": 72,
        "subtitle_position": "center",
        "transition": "slideleft",
        "crf": 20,
    },
    "vibe_instories": {
        "label": "Instories / Luxury Reel",
        "description": "Split layouts, luxury grade, gold type, mood-based xfade, BGM-aware cuts",
        "eq": "eq=contrast=1.14:brightness=0.03:saturation=0.84:gamma=1.05",
        "color": "colorbalance=rs=0.02:gs=0.01:bs=-0.03:rm=0.02:gm=0.01:bm=-0.03",
        "blur": "",
        "vignette": "vignette=angle=PI/5",
        "luxury_sharp": "unsharp=5:5:0.62:5:5:0.0",
        "subtitle_color": "white",
        "subtitle_border": "gold",
        "subtitle_size": 56,
        "subtitle_position": "bottom",
        "subtitle_style": "luxury_gold",
        "transition": "zoomin",
        "layout_mode": "cycle",
        "layout_cycle": ("split", "framed", "fullscreen"),
        "crf": 18,
    },
}

# Global editing rhythm (BPM/speech handled via beat_sync + scene_timings; this shapes transitions)
DIRECTOR_STYLES = {
    "tiktok_fast": {
        "transition": "slideleft",
        "xfade_sec": 0.2,
        "fade_io": 0.12,
        "label": "TikTok Fast-Cut",
    },
    "cinematic_slow": {
        "transition": "fade",
        "xfade_sec": 0.85,
        "fade_io": 0.5,
        "label": "Cinematic Slow",
    },
    "corporate": {
        "transition": "fade",
        "xfade_sec": 0.35,
        "fade_io": 0.28,
        "label": "Corporate",
    },
}


def director_style(director_preset: str | None) -> dict[str, Any]:
    key = (director_preset or "corporate").strip().lower()
    return DIRECTOR_STYLES.get(key, DIRECTOR_STYLES["corporate"])


def _preset_crf_value(effect_preset: str) -> str:
    """CRF from vibe preset for libx264."""
    if effect_preset in VIBE_PRESETS:
        return str(VIBE_PRESETS[effect_preset].get("crf", 20))
    if effect_preset == "fantasy":
        return str(VIBE_PRESETS["vibe_fantasy"].get("crf", 20))
    if effect_preset == "tutorial":
        return str(VIBE_PRESETS["vibe_tutorial"].get("crf", 20))
    if effect_preset == "viral":
        return str(VIBE_PRESETS["vibe_viral"].get("crf", 20))
    if effect_preset in ("instories", "luxury", "reel", "cinematic"):
        return str(VIBE_PRESETS["vibe_instories"].get("crf", 18))
    return "20"


def probe_clip_duration_sec(path: str) -> float:
    try:
        r = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "json",
                path,
            ],
            capture_output=True,
            text=True,
            timeout=12,
        )
        if r.returncode != 0:
            return 0.0
        return float(json.loads(r.stdout or "{}").get("format", {}).get("duration") or 0.0)
    except (OSError, ValueError, json.JSONDecodeError, subprocess.TimeoutExpired):
        return 0.0


def _subtitle_draw_colors(p: dict[str, Any]) -> tuple[str, str, int]:
    """Return (fontcolor, bordercolor, borderw) for drawtext."""
    st = (p.get("subtitle_style") or "").strip().lower()
    neon = (os.getenv("INSTORIES_TEXT_NEON") or "").strip() == "1" or st == "neon"
    if neon:
        return ("0x00FFFF", "0xFF1493", 4)
    b = (p.get("subtitle_border") or "black").strip().lower()
    if b == "gold" or st == "luxury_gold":
        fc = p.get("subtitle_color") or "white"
        if str(fc).lower() in ("gold", "neon"):
            fc = "white"
        return (str(fc), "0xD4AF37", 5)
    fc = p.get("subtitle_color") or "white"
    bc = p.get("subtitle_border") or "black"
    return (str(fc), str(bc), 3)


def generate_ffmpeg_filter_complex(
    clips: list[str],
    scene_timings: list[tuple[float, float]],
    audio_path: str,
    subtitle_text: list[str],
    effect_preset: str = "fantasy",
    director_preset: str | None = None,
    clip_durations: list[float] | None = None,
    script_md: str = "",
    transition_names: list[str] | None = None,
) -> str:
    """
    Generate FFmpeg filter_complex for professional editing
    (layouts, mood xfade, luxury grade, VO subtitles).
    """
    if effect_preset in VIBE_PRESETS:
        p = dict(VIBE_PRESETS[effect_preset])
    elif effect_preset == "fantasy":
        p = dict(VIBE_PRESETS["vibe_fantasy"])
    elif effect_preset == "tutorial":
        p = dict(VIBE_PRESETS["vibe_tutorial"])
    elif effect_preset == "viral":
        p = dict(VIBE_PRESETS["vibe_viral"])
    elif effect_preset in ("instories", "luxury", "reel", "cinematic"):
        p = dict(VIBE_PRESETS["vibe_instories"])
    else:
        p = dict(VIBE_PRESETS["vibe_tutorial"])

    ds = director_style(director_preset)
    xfade_d_base = float(ds["xfade_sec"])
    fade_io = float(ds["fade_io"])
    default_trans = ds.get("transition") or p.get("transition") or "fade"

    n_tr = max(0, len(clips) - 1)
    if transition_names is None or len(transition_names) != n_tr:
        if effect_preset in (
            "vibe_instories",
            "instories",
            "luxury",
            "reel",
            "cinematic",
        ) or p.get("mood_transitions"):
            transition_names = infer_mood_transition_sequence(script_md, n_tr)
        else:
            transition_names = [default_trans] * n_tr

    filters: list[str] = []

    # === Step 1: Per-clip trim + dynamic layout + grade + fades ===
    for i, (_clip, (_start, end)) in enumerate(zip(clips, scene_timings)):
        need = max(end - _start, 0.5)
        have = 0.0
        if clip_durations is not None and i < len(clip_durations):
            have = float(clip_durations[i] or 0.0)
        if have <= 0.1:
            have = need
        trim_d = min(need, have)
        pad = max(0.0, need - trim_d)
        tpad = ""
        if pad > 0.03:
            tpad = f",tpad=stop_mode=clone:stop_duration={pad:.3f}"

        layout = pick_layout_for_shot(i, p)
        head = f"[{i}:v]trim=duration={trim_d:.2f},setpts=PTS-STARTPTS{tpad}"

        if layout == "split":
            head += (
                f",split=2[sp{i}a][sp{i}b];"
                f"[sp{i}a]scale=960:1080:force_original_aspect_ratio=decrease,pad=960:1080:0:0[va{i}];"
                f"[sp{i}b]scale=960:1080:force_original_aspect_ratio=increase,crop=960:1080:0:0[vb{i}];"
                f"[va{i}][vb{i}]hstack=inputs=2[base{i}];[base{i}]"
                f"scale=1920:1080:force_original_aspect_ratio=decrease,"
                f"pad=1920:1080:(ow-iw)/2:(oh-ih)/2"
            )
        elif layout == "framed":
            head += (
                f",scale=1760:990:force_original_aspect_ratio=decrease,"
                f"pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0a0a12,"
                f"drawbox=x=0:y=0:w=iw:h=ih:color=0xC9A227:t=5"
            )
        else:
            head += (
                f",scale=1920:1080:force_original_aspect_ratio=decrease,"
                f"pad=1920:1080:(ow-iw)/2:(oh-ih)/2"
            )

        f = f"{head},fade=t=in:st=0:d={fade_io:.2f}"
        if p.get("eq"):
            f += f",{p['eq']}"
        if p.get("color"):
            f += f",{p['color']}"
        if p.get("blur"):
            f += f",{p['blur']}"
        if p.get("vignette"):
            f += f",{p['vignette']}"
        lux = (p.get("luxury_sharp") or "").strip()
        if lux:
            f += f",{lux}"
        f += f",fade=t=out:st={max(need - fade_io, 0):.2f}:d={fade_io:.2f}[v{i}]"
        filters.append(f)

    # === Step 2: Xfade (per-edge mood transition; offset = end of first input minus duration) ===
    if len(clips) > 1:
        acc_dur = scene_timings[0][1] - scene_timings[0][0]
        for i in range(len(clips) - 1):
            tr = transition_names[i] if i < len(transition_names) else default_trans
            xfd = xfade_d_base * (0.72 if tr in ("hrslice", "hlwind", "diagtl") else 1.0)
            seg_i = scene_timings[i][1] - scene_timings[i][0]
            xfd = max(0.08, min(xfd, seg_i * 0.48))
            offset = max(acc_dur - xfd, 0.05)
            inp_a = f"v{i}" if i == 0 else f"vt{i-1}"
            filters.append(
                f"[{inp_a}][v{i+1}]xfade=transition={tr}:duration={xfd:.2f}:offset={offset:.2f}[vt{i}]"
            )
            acc_dur = acc_dur + (scene_timings[i + 1][1] - scene_timings[i + 1][0]) - xfd
        final_label = f"vt{len(clips)-2}"
    else:
        final_label = "v0"

    # === Step 3: Burned-in subtitles (Thai-capable font) ===
    burn = (os.getenv("AUTO_EDIT_BURN_SUBTITLES") or "1").strip() != "0"
    font_path = _pick_thai_font_for_drawtext() if burn else None
    sub_size = int(p.get("subtitle_size") or 48)
    fc, bc, bw = _subtitle_draw_colors(p)
    sub_y = "(h-text_h)/2" if (p.get("subtitle_position") or "bottom") == "center" else "h-120"
    sub_fade = (os.getenv("AUTO_EDIT_SUBTITLE_FADE") or "1").strip() != "0"

    if not font_path or not burn:
        filters.append(f"[{final_label}]format=yuv420p[vout]")
        return ";".join(filters)

    ff_esc = _ffmpeg_fontfile_for_filter(font_path)
    sub_f = f"[{final_label}]"
    drew = 0
    for idx, sub_text in enumerate(subtitle_text[:6]):
        st = scene_timings[idx][0] if idx < len(scene_timings) else 0
        et = scene_timings[idx][1] if idx < len(scene_timings) else st + 5
        raw = (sub_text or "").replace("\n", " ").strip()
        if not raw:
            continue
        clean = _escape_drawtext_literal(raw[:120])
        if not clean.strip():
            continue
        alpha_part = ""
        if sub_fade:
            alpha_part = (
                f":alpha='if(between(t,{st:.3f},{et:.3f}),"
                f"min(1,max(0,(t-{st:.3f})/0.35))*min(1,max(0,({et:.3f}-t)/0.35)),0)'"
            )
        sub_f += (
            f"drawtext=fontfile='{ff_esc}':text='{clean}':"
            f"fontsize={sub_size}:fontcolor={fc}:borderw={bw}:bordercolor={bc}:"
            f"x=(w-text_w)/2:y={sub_y}{alpha_part},"
        )
        drew += 1
    if drew == 0:
        filters.append(f"[{final_label}]format=yuv420p[vout]")
        return ";".join(filters)
    sub_f = sub_f.rstrip(",") + "[vout]"
    filters.append(sub_f)

    return ";".join(filters)


def render_all_variants(
    clips: list[str],
    audio_path: str,
    script_md: str,
    base_output_dir: str,
    project_id: str,
    logger: logging.Logger,
    beat_sync: bool = True,
    edu_overlay: bool = False,
    progress_callback: Callable[[dict], None] | None = None,
    variant_keys_filter: list[str] | None = None,
    cancel_event: threading.Event | None = None,
    filename_salt: str | None = None,
    director_preset: str | None = None,
    bgm_path: str | None = None,
) -> tuple[dict[str, str], bool]:
    """
    Render 3 variants from the SAME source clips — no re-generation needed.

    Variants:
      A = vibe_fantasy   (Sci-Fi/Action)
      B = vibe_instories (Luxury / Instories-style layouts + mood cuts)
      C = vibe_viral     (TikTok/Viral)

    Args:
        clips: Source video clips (from Grok)
        audio_path: Narration audio
        script_md: Script for subtitles
        base_output_dir: Directory to save variants
        project_id: Used for naming
        logger: Logger
        beat_sync: Use librosa beat detection
        edu_overlay: Add step-number overlays (for Tutorial)

    Returns:
        (dict variant_key → output_path ที่สำเร็จ, cancelled)
    """
    out_dir = Path(base_output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    variants_full = [
        ("variant_a", "vibe_fantasy"),
        ("variant_b", "vibe_instories"),
        ("variant_c", "vibe_viral"),
    ]
    want = set(variant_keys_filter) if variant_keys_filter else None
    variants_to_render = (
        [x for x in variants_full if x[0] in want] if want else list(variants_full)
    )
    if not variants_to_render:
        variants_to_render = list(variants_full)

    results: dict[str, str] = {}
    cancelled = False
    salt = (filename_salt or "v1").strip() or "v1"

    try:
        for variant_key, preset_name in variants_to_render:
            if cancel_event and cancel_event.is_set():
                cancelled = True
                logger.warning("[Variants] Stopped before %s (cancelled)", variant_key)
                break
            wave_wall_start = time.time()
            out_path = str(out_dir / f"{project_id}_{variant_key}_{salt}.mp4")
            logger.info("[Variants] Rendering %s (%s) → %s", variant_key, preset_name, Path(out_path).name)
            if progress_callback:
                try:
                    progress_callback(
                        {
                            "phase": "edit_variant_start",
                            "variant_key": variant_key,
                            "preset": preset_name,
                            "progress_pct": 0,
                            "message": f"Rocky ตัดต่อ: {variant_key} ({preset_name})…",
                        }
                    )
                except Exception:
                    pass

            # For tutorial, activate edu overlays if requested
            use_edu = edu_overlay and preset_name == "vibe_tutorial"

            stop_tick = threading.Event()
            pct_holder: list[int] = [5]

            def _tick_progress() -> None:
                while not stop_tick.wait(1.25):
                    pct_holder[0] = min(92, pct_holder[0] + 7)
                    if progress_callback:
                        try:
                            progress_callback(
                                {
                                    "phase": "edit_variant_progress",
                                    "variant_key": variant_key,
                                    "progress_pct": pct_holder[0],
                                }
                            )
                        except Exception:
                            pass

            tick_th = threading.Thread(target=_tick_progress, daemon=True)
            tick_th.start()
            success = False
            try:
                for attempt in range(2):
                    success = auto_edit_video(
                        clips=clips,
                        audio_path=audio_path,
                        script_md=script_md,
                        output_path=out_path,
                        logger=logger,
                        effect_preset=preset_name,
                        beat_sync=beat_sync,
                        edu_overlay=use_edu,
                        cancel_event=cancel_event,
                        director_preset=director_preset,
                        bgm_path=bgm_path,
                    )
                    if success and verify_output_wall_fresh(out_path, wave_wall_start):
                        break
                    if success:
                        logger.warning(
                            "[Variants] %s output mtime stale vs render start — retry %d/2",
                            variant_key,
                            attempt + 1,
                        )
                        try:
                            Path(out_path).unlink(missing_ok=True)
                        except OSError:
                            pass
                    success = False
            finally:
                stop_tick.set()
                tick_th.join(timeout=0.5)

            if success:
                results[variant_key] = out_path
                logger.info("[Variants] %s done: %s", variant_key, Path(out_path).name)
                if progress_callback:
                    try:
                        progress_callback(
                            {
                                "phase": "edit_variant_progress",
                                "variant_key": variant_key,
                                "progress_pct": 100,
                            }
                        )
                        progress_callback(
                            {
                                "phase": "edit_variant_done",
                                "variant_key": variant_key,
                                "message": f"{variant_key} เสร็จ → {Path(out_path).name}",
                            }
                        )
                    except Exception:
                        pass
            else:
                logger.warning("[Variants] %s FAILED — skipped", variant_key)
                if progress_callback:
                    try:
                        progress_callback(
                            {
                                "phase": "edit_variant_failed",
                                "variant_key": variant_key,
                                "progress_pct": 0,
                                "message": f"{variant_key} ล้มเหลว — ข้าม",
                            }
                        )
                    except Exception:
                        pass

        logger.info("[Variants] Completed: %d variant(s)", len(results))
        return results, cancelled
    except Exception as e:
        logger.exception("[Variants] Unexpected error — returning partial results: %s", e)
        return results, cancelled


def auto_edit_video(
    clips: list[str],
    audio_path: str,
    script_md: str,
    output_path: str,
    logger: logging.Logger,
    effect_preset: str = "fantasy",
    beat_sync: bool = True,
    edu_overlay: bool = False,
    cancel_event: threading.Event | None = None,
    director_preset: str | None = None,
    bgm_path: str | None = None,
) -> bool:
    """
    Professional auto-editing: VO-weighted scenes, optional BGM transient snapping,
    mood-based xfade, layouts, luxury grade, FFmpeg-only (no XAI for assembly).
    """
    logger.info("[Auto-Editor] Starting: %d clips, preset=%s, beat_sync=%s, edu=%s",
                len(clips), effect_preset, beat_sync, edu_overlay)

    if not clips:
        logger.error("[Auto-Editor] No clips — abort")
        return False
    if not audio_path or not Path(audio_path).is_file():
        logger.error("[Auto-Editor] ไม่มีไฟล์เสียงพากย์ที่ใช้ได้: %r — variant ต้องมี narration", audio_path)
        return False

    out_pp = Path(output_path)
    try:
        out_pp.parent.mkdir(parents=True, exist_ok=True)
        out_pp.unlink(missing_ok=True)
    except OSError:
        pass

    try:
        # Step 1: Audio duration first (needed for VO-weighted split)
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", audio_path],
            capture_output=True,
            text=True,
            timeout=10
        )
        audio_duration = float(json.loads(probe.stdout)["format"]["duration"])

        # Step 2: Prefer script/VO-weighted cuts (Thai narration ↔ shot boundaries)
        scene_timings = scene_timings_from_script_vo(
            script_md, audio_duration, len(clips), logger
        )
        if scene_timings:
            logger.info("[Auto-Editor] Using VO-weighted scene timings (sync to script shots)")
        else:
            if beat_sync:
                beats = detect_audio_beats(audio_path, logger)
            else:
                beats = list(range(0, 60, 5))
            scene_timings = calculate_scene_durations(beats, audio_duration, len(clips))
            logger.info("[Auto-Editor] Using beat/interval scene timings (fallback)")

        use_bgm_snap = (os.getenv("AUTO_EDIT_BGM_BEATS") or "1").strip() != "0"
        bgm_for_beats = (bgm_path or "").strip()
        if not bgm_for_beats and use_bgm_snap and DEFAULT_BGM_PATH.is_file():
            bgm_for_beats = str(DEFAULT_BGM_PATH)
        if beat_sync and use_bgm_snap and bgm_for_beats and Path(bgm_for_beats).is_file():
            bbeats = detect_audio_beats(bgm_for_beats, logger)
            scene_timings = snap_scene_boundaries_to_beats(scene_timings, bbeats, audio_duration)
            logger.info(
                "[Auto-Editor] Nudged shot boundaries toward BGM transients (%s)",
                Path(bgm_for_beats).name,
            )

        logger.info("[Auto-Editor] Scene timings calculated:")
        for i, (start, end) in enumerate(scene_timings):
            logger.info("  Scene %d: %.2fs - %.2fs (%.1fs)", i, start, end, end - start)

        clip_durs = [probe_clip_duration_sec(c) for c in clips]
        logger.info("[Auto-Editor] Clip probe durations: %s", [f"{x:.2f}s" for x in clip_durs])
        
        # Step 4: Subtitles — prefer per-shot VO (matches picture)
        import re

        subtitles: list[str] = []
        try:
            from factory.script_segmentation import segment_script_to_shots

            for s in segment_script_to_shots(script_md or "")[: len(clips)]:
                vo = (s.get("voiceover") or "").strip()
                if vo:
                    one = vo.replace("\n", " ").strip()
                    subtitles.append(one[:80] if len(one) > 80 else one)
            while len(subtitles) < len(clips):
                subtitles.append("")
        except Exception:
            subtitles = []
        if not any(subtitles):
            for line in (script_md or "").split("\n"):
                if re.match(r"^\d+\.", line) or line.startswith("-"):
                    text = line.split("**")[-1].strip() if "**" in line else line
                    subtitles.append(text[:50])
        
        # Step 5: Generate filter_complex
        filter_complex = generate_ffmpeg_filter_complex(
            clips,
            scene_timings,
            audio_path,
            subtitles,
            effect_preset,
            director_preset=director_preset,
            clip_durations=clip_durs,
            script_md=script_md or "",
        )
        
        logger.info("[Auto-Editor] Filter complex generated (%d chars)", len(filter_complex))
        
        # Step 6: Build FFmpeg command
        ffmpeg_inputs = []
        for clip in clips:
            ffmpeg_inputs.extend(["-i", clip])
        
        ffmpeg_inputs.extend(["-i", audio_path])
        
        crf_use = _preset_crf_value(effect_preset)
        ffmpeg_cmd = [
            "ffmpeg", "-y",
            *ffmpeg_inputs,
            "-filter_complex", filter_complex,
            "-map", "[vout]",
            "-map", f"{len(clips)}:a",  # Audio from last input
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", crf_use,
            "-c:a", "aac",
            "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            output_path
        ]
        
        logger.info("[Auto-Editor] Running FFmpeg (this may take 2-3 minutes)...")

        if cancel_event and cancel_event.is_set():
            return False

        proc = subprocess.Popen(
            ffmpeg_cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            while proc.poll() is None:
                if cancel_event and cancel_event.is_set():
                    proc.kill()
                    try:
                        proc.wait(timeout=15)
                    except Exception:
                        pass
                    logger.warning("[Auto-Editor] FFmpeg killed (cancel requested)")
                    return False
                time.sleep(0.35)
            if proc.returncode == 0 and Path(output_path).exists():
                size_mb = Path(output_path).stat().st_size / (1024 * 1024)
                logger.info(
                    "[Auto-Editor] ✅ Success! Output: %s (%.1f MB)",
                    Path(output_path).name,
                    size_mb,
                )
                return True
            logger.error("[Auto-Editor] FFmpeg failed (code %s)", proc.returncode)
            return False
        finally:
            if proc.poll() is None:
                try:
                    proc.kill()
                except Exception:
                    pass
    
    except Exception as e:
        logger.error("[Auto-Editor] Error: %s", e)
        return False


# === Test ===
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    log = logging.getLogger("test")
    
    # Test with dummy clips
    test_clips = [
        "output/previews/test1.mp4",
        "output/previews/test2.mp4",
        "output/previews/test3.mp4"
    ]
    
    test_audio = "output/audio/test_narration.mp3"
    test_script = "## SCRIPT\n\n1. Hook: นักเรียนเครียด\n2. Problem: เรียนไม่ได้ผล\n3. Solution: Aqond AI"
    test_output = "output/final/auto_edited_test.mp4"
    
    success = auto_edit_video(test_clips, test_audio, test_script, test_output, log, effect_preset="fantasy")
    
    if success:
        print(f"\n✅ Auto-editing complete: {test_output}")
    else:
        print("\n❌ Auto-editing failed")
