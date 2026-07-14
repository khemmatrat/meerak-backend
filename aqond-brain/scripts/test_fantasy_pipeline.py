"""
Test Fantasy Pipeline — AI-powered prompt expansion + audio syncing
"""

import asyncio
import logging
import os
import sys
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AQOND_BRAIN / "scripts"))

# Enable mock mode for faster testing
os.environ["FACTORY_MOCK_MODE"] = "1"

from factory.production_manager import ProductionManager, ProductionState
from factory.minnie_api import generate_script_and_audio
from factory.rocky_visual_api import generate_video_clips
from factory.rocky_editor_api import edit_video_with_claude

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S"
)

log = logging.getLogger("fantasy_test")


async def test_fantasy_expansion():
    """Test 1: Prompt expansion"""
    print("\n" + "="*60)
    print("Test 1: Fantasy Prompt Expansion")
    print("="*60)
    
    from factory.prompt_expander import expand_prompt_with_fantasy
    
    simple_desc = "คนนั่งทำงานที่คาเฟ่"
    
    for level in ["low", "medium", "high", "extreme"]:
        expanded = expand_prompt_with_fantasy(simple_desc, level, log)
        print(f"\n[{level.upper()}] ({len(expanded)} chars):")
        print(expanded[:200] + "...")
    
    print("\n" + "="*60)


async def test_audio_sync():
    """Test 2: Audio-visual syncing"""
    print("\n" + "="*60)
    print("Test 2: Audio-Visual Syncing")
    print("="*60)
    
    from factory.audio_sync import analyze_audio_timing, sync_clips_to_audio
    
    # Mock audio file (จริงต้องมีไฟล์จริง)
    audio_info = {
        "duration": 45.0,
        "suggested_cuts": [5.0, 12.0, 22.0, 35.0],
        "beat_intervals": []
    }
    
    print(f"Duration: {audio_info['duration']}s")
    print(f"Natural pauses: {audio_info['suggested_cuts']}")
    
    # Mock clips
    mock_clips = [f"clip_{i}.mp4" for i in range(5)]
    
    print(f"\nInput clips: {len(mock_clips)}")
    
    # Would call sync_clips_to_audio in real scenario
    print("Timeline would be synced to audio pauses...")
    
    print("\n" + "="*60)


async def test_full_fantasy_pipeline():
    """Test 3: Full pipeline with fantasy mode"""
    print("\n" + "="*60)
    print("Test 3: Full Fantasy Pipeline (MOCK)")
    print("="*60)
    
    brief = "สร้างโฆษณา Aqond แบบ Fantasy (ทดสอบ Creativity)"
    
    pm = ProductionManager()
    proj = pm.create_project(brief, None)
    
    log.info("Created project: %s", proj.project_id)
    
    # Step 1: Minnie
    log.info("Step 1: Minnie (script + audio)")
    pm.update_state(proj, ProductionState.SCRIPTING)
    
    script, audio, err = await asyncio.to_thread(generate_script_and_audio, brief, None, log)
    if script:
        proj.script_md = script
        proj.audio_narration_path = audio or ""
        log.info("Minnie complete: %d chars", len(script))
    
    # Step 2: Rocky Visual (Fantasy mode)
    log.info("Step 2: Rocky Visual (creativity: extreme)")
    pm.update_state(proj, ProductionState.VISUAL_GEN)
    
    clips, err = await asyncio.to_thread(generate_video_clips, proj.script_md, log, "extreme")
    if clips:
        proj.raw_clips = clips
        log.info("Rocky Visual complete: %d clips", len(clips))
    
    # Step 3: Rocky Editor (with audio sync)
    log.info("Step 3: Rocky Editor (audio-synced)")
    pm.update_state(proj, ProductionState.EDITING)
    
    edited, err = await asyncio.to_thread(
        edit_video_with_claude,
        proj.raw_clips,
        proj.script_md,
        proj.project_id,
        proj.audio_narration_path,
        log
    )
    
    if edited:
        proj.edited_video_path = edited
        pm.update_state(proj, ProductionState.APPROVED)
        log.info("Rocky Editor complete: %s", Path(edited).name)
    
    print("\n" + "="*60)
    print("RESULT")
    print("="*60)
    print(f"Project: {proj.project_id}")
    print(f"State: {proj.state.value}")
    print(f"Video: {proj.edited_video_path}")
    if proj.edited_video_path and Path(proj.edited_video_path).exists():
        print(f"Size: {Path(proj.edited_video_path).stat().st_size / 1024:.1f} KB")
    print("="*60)


async def main():
    print("="*60)
    print("Aqond Fantasy Pipeline Test Suite")
    print("="*60)
    
    await test_fantasy_expansion()
    await test_audio_sync()
    await test_full_fantasy_pipeline()
    
    print("\n All tests complete!")
    print("Dashboard: http://127.0.0.1:8765")


if __name__ == "__main__":
    asyncio.run(main())
