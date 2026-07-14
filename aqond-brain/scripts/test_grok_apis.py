"""
Test Grok APIs — TTS + Video Generation
"""

import logging
import sys
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AQOND_BRAIN / "scripts"))

from factory.grok_tts_api import generate_tts
from factory.grok_video_api import generate_video_clip

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)

log = logging.getLogger("test_grok")


def main():
    print("=" * 60)
    print("Test Grok APIs")
    print("=" * 60)

    # Test 1: Grok TTS
    print("\n[1/2] ทดสอบ Grok TTS API...")
    audio_out = AQOND_BRAIN / "output" / "test_grok_tts.mp3"
    sample_text = "สวัสดีครับ ยินดีต้อนรับสู่ Aqond แพลตฟอร์มมหาวิทยาลัยออนไลน์ที่จะเปลี่ยนการเรียนรู้ของคุณ"
    
    tts_ok = generate_tts(sample_text, str(audio_out), voice_id="ara", language="th", logger=log)
    
    if tts_ok and audio_out.exists():
        print(f"[OK] Grok TTS: {audio_out} ({audio_out.stat().st_size / 1024:.1f} KB)")
    else:
        print("[FAIL] Grok TTS ล้มเหลว")

    # Test 2: Grok Video
    print("\n[2/2] ทดสอบ Grok Video API (wait ~60-120s)...")
    prompt = "Professional Thai startup office, young entrepreneur working on laptop, modern workspace, cinematic lighting, vibrant colors, realistic human representation, smooth camera movement, 16:9"
    
    video_path = generate_video_clip(prompt, duration=8, logger=log)
    
    if video_path and Path(video_path).exists():
        print(f"[OK] Grok Video: {video_path} ({Path(video_path).stat().st_size / 1024:.1f} KB)")
    else:
        print("[FAIL] Grok Video ล้มเหลว")

    print("\n" + "=" * 60)
    print("Test เสร็จแล้ว — ตรวจสอบ output/")
    print("=" * 60)


if __name__ == "__main__":
    main()
