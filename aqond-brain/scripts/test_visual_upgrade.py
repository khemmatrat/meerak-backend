"""
Test Visual Upgrade — Grok image gen + Ken Burns + ElevenLabs voiceover
"""

import logging
import sys
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AQOND_BRAIN / "scripts"))

from factory.visual_upgrade import generate_image_with_grok, create_ken_burns_clip
from factory.elevenlabs_voice import generate_voiceover, add_voiceover_to_video

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)

log = logging.getLogger("test")

def main():
    print("=" * 60)
    print("ทดสอบ Visual Upgrade + ElevenLabs Voiceover")
    print("=" * 60)

    # 1) Grok image generation
    log.info("ทดสอบ Grok image generation...")
    img = generate_image_with_grok(
        "Beautiful Thai startup office with modern technology, vibrant colors, cinematic lighting",
        log
    )
    if img:
        log.info("[OK] Grok image: %s", img)
        
        # 2) Ken Burns effect
        output_clip = AQOND_BRAIN / "output" / "test_ken_burns.mp4"
        ok = create_ken_burns_clip(img, 8.0, str(output_clip), log)
        if ok:
            log.info("[OK] Ken Burns clip: %s", output_clip)
    else:
        log.warning("[WARN] Grok image ล้มเหลว — ตรวจสอบ XAI_API_KEY")

    # 3) ElevenLabs voiceover
    log.info("\nทดสอบ ElevenLabs voiceover...")
    vo_mp3 = AQOND_BRAIN / "output" / "test_voiceover.mp3"
    sample_text = "สวัสดีครับ ยินดีต้อนรับสู่แพลตฟอร์ม Aqond ที่จะเปลี่ยนวิธีคิดและทำงานของคุณ"
    
    vo_ok = generate_voiceover(sample_text, str(vo_mp3), log)
    if vo_ok:
        log.info("[OK] Voiceover: %s (%.1f KB)", vo_mp3, vo_mp3.stat().st_size / 1024)
    else:
        log.warning("[WARN] ElevenLabs ล้มเหลว — ตรวจสอบ ELEVENLABS_API_KEY")

    print("\n" + "=" * 60)
    print("ทดสอบเสร็จแล้ว — ตรวจสอบไฟล์ output/")
    print("=" * 60)


if __name__ == "__main__":
    main()
