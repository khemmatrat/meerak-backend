"""
Test Pinky Brain — Script & Video Review
"""

import logging
import sys
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AQOND_BRAIN / "scripts"))

from factory.pinky_brain import review_script, review_video, get_pinky_insights

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("pinky_test")


def test_script_review():
    """Test script review"""
    print("\n" + "="*60)
    print("Test 1: Pinky Script Review")
    print("="*60)
    
    # Good script
    good_script = """## SCRIPT

🔥 เบื่อเรียนหนังสือแบบเดิมๆ ใช่มั้ย? ตำราหนา ไม่มีใครช่วย

**Aqond** มหาวิทยาลัยออนไลน์พร้อมช่วยคุณ!
✨ AI Tutor ส่วนตัว ตอบคำถาม 24/7
📚 วิชา STEM ระดับปริญญาตรีครบ
💰 เพียง 299 บาท/เดือน

ดาวน์โหลด Aqond **วันนี้** — ทดลองฟรี 7 วัน!

## SCENES
1. [0-3s] Hook: นักเรียนหงุดหงิด
2. [4-10s] Problem: เรียนเดิมๆ น่าเบื่อ
3. [11-25s] Solution: Aqond AI tutor
4. [26-35s] Features + ราคา
5. [36-42s] CTA: ดาวน์โหลดเลย
"""
    
    review = review_script(good_script, log)
    
    print(f"\nScore: {review.score}/5")
    print(f"Approved: {'YES' if review.approved else 'NO'}")
    print(f"Feedback: {review.feedback[:300]}")
    print(f"Issues: {review.issues}")
    print(f"Suggestions: {review.suggestions}")
    
    # Bad script
    print("\n" + "-"*60)
    bad_script = """เรียนออนไลน์กับ Aqond
ดาวน์โหลดได้เลย"""
    
    review2 = review_script(bad_script, log)
    
    print(f"\nBad Script Score: {review2.score}/5")
    print(f"Approved: {'YES' if review2.approved else 'NO'}")
    print(f"Feedback: {review2.feedback[:300]}")
    
    print("\n" + "="*60)


def test_video_review():
    """Test video review"""
    print("\n" + "="*60)
    print("Test 2: Pinky Video Review")
    print("="*60)
    
    # Find latest video
    preview_dir = AQOND_BRAIN / "output" / "previews"
    videos = sorted(preview_dir.glob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
    
    if not videos:
        print("No videos found — skipping")
        return
    
    video_path = str(videos[0])
    script = "Sample script for testing..."
    
    print(f"\nReviewing: {videos[0].name}")
    print(f"Size: {videos[0].stat().st_size / (1024*1024):.1f} MB")
    
    review = review_video(video_path, script, log)
    
    print(f"\nScore: {review.score}/5")
    print(f"Approved: {'YES' if review.approved else 'NO'}")
    print(f"Feedback: {review.feedback[:300]}")
    print(f"Issues: {review.issues}")
    print(f"Suggestions: {review.suggestions}")
    
    print("\n" + "="*60)


def test_insights():
    """Test Pinky insights"""
    print("\n" + "="*60)
    print("Test 3: Pinky Insights")
    print("="*60)
    
    insights = get_pinky_insights(log)
    
    print(f"\nTotal Reviews: {insights['total_reviews']}")
    print(f"Avg Score: {insights['avg_score']}/5")
    print(f"Approval Rate: {insights['approval_rate']}%")
    print(f"\nCommon Issues:")
    for issue in insights['common_issues']:
        print(f"  - {issue}")
    
    print(f"\nTop Suggestions:")
    for sugg in insights['top_suggestions']:
        print(f"  - {sugg}")
    
    print("\n" + "="*60)


if __name__ == "__main__":
    print("="*60)
    print("Pinky Brain Test Suite")
    print("="*60)
    
    test_script_review()
    test_video_review()
    test_insights()
    
    print("\nAll tests complete!")
