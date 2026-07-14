"""
Audio-Visual Syncing — ตัดต่อให้ตรงจังหวะกับเสียงพากย์
"""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path


def analyze_audio_timing(audio_path: str, logger: logging.Logger) -> dict:
    """
    วิเคราะห์ไฟล์เสียงเพื่อหา cutting points
    
    Returns:
        {
            "duration": float,
            "suggested_cuts": [3.5, 8.2, 15.0, ...],
            "beat_intervals": [...]
        }
    """
    if not Path(audio_path).exists():
        logger.warning("[Audio Sync] ไฟล์เสียงไม่มี")
        return {"duration": 0, "suggested_cuts": [], "beat_intervals": []}
    
    # Step 1: Get duration with ffprobe
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audio_path],
            capture_output=True, text=True, timeout=5
        )
        if r.returncode == 0 and r.stdout.strip():
            duration = float(r.stdout.strip())
        else:
            logger.warning("[Audio Sync] ffprobe ล้มเหลว")
            return {"duration": 0, "suggested_cuts": [], "beat_intervals": []}
    except:
        return {"duration": 0, "suggested_cuts": [], "beat_intervals": []}
    
    # Step 2: Detect silence gaps (use as natural cut points)
    suggested_cuts = []
    
    try:
        # Use ffmpeg silencedetect to find pauses (likely sentence breaks)
        args = [
            "ffmpeg", "-i", audio_path,
            "-af", "silencedetect=noise=-30dB:d=0.3",
            "-f", "null", "-"
        ]
        r = subprocess.run(args, capture_output=True, text=True, timeout=30)
        
        # Parse silence_end timestamps
        import re
        for line in r.stderr.split("\n"):
            if "silence_end:" in line:
                m = re.search(r"silence_end:\s*([\d.]+)", line)
                if m:
                    timestamp = float(m.group(1))
                    if 2.0 < timestamp < duration - 2.0:  # Ignore very early/late
                        suggested_cuts.append(timestamp)
        
        logger.info("[Audio Sync] Found %d natural pauses", len(suggested_cuts))
    
    except Exception as e:
        logger.warning("[Audio Sync] Silence detection failed: %s", e)
    
    # Step 3: If no silences found, use evenly-spaced cuts
    if not suggested_cuts:
        num_clips = 5
        interval = duration / num_clips
        suggested_cuts = [interval * i for i in range(1, num_clips)]
        logger.info("[Audio Sync] Using evenly-spaced cuts (%d)", len(suggested_cuts))
    
    return {
        "duration": duration,
        "suggested_cuts": sorted(suggested_cuts),
        "beat_intervals": []
    }


def sync_clips_to_audio(
    raw_clips: list[str],
    audio_path: str,
    logger: logging.Logger
) -> list[dict]:
    """
    สร้าง timeline ที่ตัดคลิปให้ตรงจังหวะกับเสียง
    
    Returns:
        Timeline with adjusted clip durations matching audio pauses
        [
            {"clip_index": 0, "start_sec": 0, "end_sec": 3.5, "transition": "fade"},
            {"clip_index": 1, "start_sec": 0, "end_sec": 4.7, "transition": "fade"},
            ...
        ]
    """
    audio_info = analyze_audio_timing(audio_path, logger)
    duration = audio_info["duration"]
    cuts = audio_info["suggested_cuts"]
    
    if not cuts or duration < 5:
        logger.warning("[Audio Sync] ไม่มี timing info — ใช้ simple timeline")
        return _simple_timeline(raw_clips)
    
    # Build timeline matching audio cuts
    timeline = []
    prev_cut = 0.0
    
    for idx, clip_path in enumerate(raw_clips):
        if idx >= len(cuts):
            # Last clip: use remaining duration
            segment_duration = duration - prev_cut
        else:
            segment_duration = cuts[idx] - prev_cut
        
        timeline.append({
            "clip_index": idx,
            "start_sec": 0,
            "end_sec": min(segment_duration, 10.0),  # Max 10s per clip
            "transition": "fade" if idx > 0 else "cut"
        })
        
        prev_cut = cuts[idx] if idx < len(cuts) else duration
        
        if prev_cut >= duration:
            break
    
    logger.info("[Audio Sync] Created synced timeline: %d segments", len(timeline))
    return timeline


def _simple_timeline(raw_clips: list[str]) -> list[dict]:
    """Fallback: simple concatenation"""
    return [
        {
            "clip_index": idx,
            "start_sec": 0,
            "end_sec": 999,  # Use full clip
            "transition": "fade" if idx > 0 else "cut"
        }
        for idx in range(len(raw_clips))
    ]
