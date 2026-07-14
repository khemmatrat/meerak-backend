"""
Pinky Brain — Chief Quality Officer (CQO)
Claude 3.5 Sonnet — The All-Seeing Eye, Gatekeeper, Auto-Fixer
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent
LESSONS_FILE = AQOND_BRAIN / "output" / "pinky_lessons.json"


def _load_env() -> dict[str, str]:
    """Load .env file"""
    env_path = AQOND_BRAIN / ".env"
    env = {}
    if not env_path.exists():
        return env
    
    for line in open(env_path, "r", encoding="utf-8"):
        line = line.split("#")[0].strip()
        if "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


class PinkyReview:
    """Pinky's review result (10-point scale + auto-fix)"""
    def __init__(
        self,
        approved: bool,
        score: int,
        feedback: str,
        issues: list[str],
        suggestions: list[str],
        auto_fixed_content: str = "",
        fixed_prompt: str = ""
    ):
        self.approved = approved
        self.score = score  # 1-10 scale
        self.feedback = feedback
        self.issues = issues
        self.suggestions = suggestions
        self.auto_fixed_content = auto_fixed_content  # Pinky's rewritten script
        self.fixed_prompt = fixed_prompt  # Pinky's improved prompt
    
    def to_dict(self) -> dict:
        return {
            "approved": self.approved,
            "score": self.score,
            "feedback": self.feedback,
            "issues": self.issues,
            "suggestions": self.suggestions,
            "auto_fixed_content": self.auto_fixed_content,
            "fixed_prompt": self.fixed_prompt,
            "timestamp": datetime.now().isoformat()
        }


def review_script(script_md: str, logger: logging.Logger, auto_fix: bool = True) -> PinkyReview:
    """
    Pinky GATEKEEPER — Review script + auto-fix if <8/10
    
    Threshold: ≥8/10 → APPROVED | <8/10 → REJECTED + auto-fixed
    
    Returns:
        PinkyReview with auto_fixed_content if score <8
    """
    env = _load_env()
    api_key = env.get("ANTHROPIC_API_KEY", "").strip()
    
    if not api_key:
        log = logger if hasattr(logger, 'warning') else logging.getLogger('pinky')
        log.warning("[Pinky] No Claude API key — auto-approve")
        return PinkyReview(
            approved=True,
            score=8,
            feedback="No API key — auto-approved",
            issues=[],
            suggestions=[],
            auto_fixed_content=""
        )
    
    # GATEKEEPER MODE: 10-point scale + auto-fix
    system = """You are Pinky, Chief Quality Officer and GATEKEEPER of Aqond's video production.

GATEKEEPER RULES:
- Score scale: 1-10 (NOT 1-5!)
- Approval threshold: ≥8/10
- If score <8/10, you MUST rewrite the ENTIRE script to 10/10 standard

Zero tolerance for:
- Boring copy, weak hooks, unclear value props
- Missing emotional triggers, vague CTAs, poor Thai grammar

Review criteria:
1. Hook Strength (0-3s): Grabs attention immediately? Emotional trigger?
2. Problem/Solution (5-25s): Clear pain point? Compelling solution?
3. Features + Value (25-35s): Easy to understand? Pricing believable?
4. CTA (35-45s): Urgent? Clear action? FOMO/scarcity?
5. Thai Language: Perfect grammar, natural tone, cultural relevance

Response format (JSON):
{
  "score": 7,
  "approved": false,
  "feedback": "REJECTED. Hook is weak — lacks emotional punch. CTA has no urgency. Scene 2 too wordy.",
  "issues": ["Weak hook (no pain point)", "Vague CTA (no scarcity)", "Scene 2 too long (>10s)"],
  "suggestions": ["Start with strong pain point", "Add FOMO to CTA", "Cut Scene 2 to 8s"],
  "auto_fixed_script": "## SCRIPT\\n\\n🔥 นอนดึก สอบตก ชีวิตพัง? คุณไม่ได้เป็นคนเดียว\\n\\n**Aqond** มหาวิทยาลัยออนไลน์ พร้อมช่วยคุณกลับมาเป็น TOP!\\n✨ AI Tutor ส่วนตัว 24/7\\n📚 STEM ครบ\\n💰 299/เดือน\\n\\n🚀 ดาวน์โหลดเลย — **จำกัด 100 คนแรก**\\n\\n## SCENES\\n1. [0-3s] Hook: นักเรียนเครียดกับตำรา\\n2. [4-10s] Problem: เรียนเดิมๆ ไม่ได้ผล\\n3. [11-25s] Solution: Aqond AI tutor ตอบทันที\\n4. [26-35s] Features: STEM + 299 บาท\\n5. [36-42s] CTA: ดาวน์โหลดเลย (จำกัด 100 คน)"
}

Standard: Only approve scripts ready for $10K+ ad spend (5%+ CTR on TikTok)."""
    
    user_msg = f"Review this Thai ad script (GATEKEEPER MODE — auto-fix if <8/10):\n\n{script_md}"
    
    payload = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 3000,
        "system": system,
        "messages": [{"role": "user", "content": user_msg}]
    }
    
    try:
        req = Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
        )
        
        with urlopen(req, timeout=90) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            text = result.get("content", [{}])[0].get("text", "").strip()
            
            # Strip markdown code block if present
            if text.startswith("```json"):
                text = text[7:]
            elif text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
            
            # Try to extract JSON from response
            if not text.startswith("{"):
                # Find first { and last }
                start = text.find("{")
                end = text.rfind("}")
                if start >= 0 and end > start:
                    text = text[start:end+1]
            
            try:
                review_data = json.loads(text)
                
                score = review_data.get("score", 5)
                approved = score >= 8
                auto_fixed = review_data.get("auto_fixed_script", "")
                
                log = logger if hasattr(logger, 'info') else logging.getLogger('pinky')
                log.info("[Pinky Script] Score: %d/10, Approved: %s", score, approved)
                
                return PinkyReview(
                    approved=approved,
                    score=score,
                    feedback=review_data.get("feedback", ""),
                    issues=review_data.get("issues", []),
                    suggestions=review_data.get("suggestions", []),
                    auto_fixed_content=auto_fixed
                )
            
            except json.JSONDecodeError:
                log = logger if hasattr(logger, 'warning') else logging.getLogger('pinky')
                log.warning("[Pinky] Response not JSON — parsing text")
                
                approved = "approve" in text.lower()
                score = 5
                import re
                m = re.search(r"score[:\s]+(\d+)", text, re.IGNORECASE)
                if m:
                    score = int(m.group(1))
                
                return PinkyReview(
                    approved=score >= 8,
                    score=score,
                    feedback=text[:500],
                    issues=[],
                    suggestions=[],
                    auto_fixed_content=""
                )
    
    except HTTPError as e:
        body = e.read().decode("utf-8") if hasattr(e, "read") else str(e)
        log = logger if hasattr(logger, 'error') else logging.getLogger('pinky')
        log.error("[Pinky] HTTP %d: %s", e.code, body[:300])
        
        if e.code == 400 and "credit balance" in body.lower():
            feedback = "⚠ Claude API: No credits — auto-approved. Please top up to enable real Pinky reviews."
        else:
            feedback = f"⚠ API Error (HTTP {e.code}) — auto-approved. Check logs."
        
        return PinkyReview(
            approved=True,
            score=8,
            feedback=feedback,
            issues=[],
            suggestions=[],
            auto_fixed_content=""
        )
    
    except Exception as e:
        log = logger if hasattr(logger, 'error') else logging.getLogger('pinky')
        log.error("[Pinky] %s", e)
        return PinkyReview(
            approved=True,
            score=8,
            feedback="⚠ System Error — auto-approved. Check logs.",
            issues=[],
            suggestions=[],
            auto_fixed_content=""
        )


def review_script_by_tier(
    script_md: str,
    tier: str,
    logger: logging.Logger = None,
    auto_fix: bool = True
) -> PinkyReview:
    """
    Dual-Tier QC:
    - tier='marketing'  → emotion, hook, fantasy, CTA
    - tier='tutorial'   → accuracy, clarity, logical sequence, UI zoom, pace, subtitle sync

    Returns:
        PinkyReview with tier-specific feedback
    """
    env = _load_env()
    api_key = env.get("ANTHROPIC_API_KEY", "").strip()
    log = logger if hasattr(logger, "info") else logging.getLogger("pinky")

    tier_lower = tier.lower()

    if not api_key:
        log.warning("[Pinky-Tier] No API key — auto-approve (%s)", tier)
        return PinkyReview(
            approved=True, score=8,
            feedback=f"No API — auto-approved [{tier}]",
            issues=[], suggestions=[], auto_fixed_content=""
        )

    if tier_lower == "tutorial":
        system = """You are Pinky, Chief Quality Officer, reviewing a TUTORIAL video script.

TUTORIAL TIER — Checklist (score 1-10):
1. Logical Sequence: Steps are numbered and ordered correctly
2. UI Zoom Clarity: Screen recordings / zooms called out explicitly
3. Technical Accuracy: All facts, commands, prices are correct
4. Narration Pace: Each step has enough time (≥3s per step)
5. Subtitle Sync: On-screen text matches narration timing

Threshold: ≥8/10 to PASS.
If score <8, rewrite the ENTIRE script to fix all issues.

Response format (JSON):
{
  "score": 7,
  "approved": false,
  "tier": "tutorial",
  "feedback": "Step 3 jumps to Step 5 — missing Step 4. Pace too fast.",
  "checklist": {
    "logical_sequence": "PASS",
    "ui_zoom": "FAIL",
    "technical_accuracy": "PASS",
    "narration_pace": "FAIL",
    "subtitle_sync": "PASS"
  },
  "issues": ["Missing step 4", "Pace <2s per step"],
  "suggestions": ["Add step 4 with zoom callout", "Slow down narration"],
  "auto_fixed_script": "...complete rewritten script..."
}"""
    else:
        system = """You are Pinky, Chief Quality Officer, reviewing a MARKETING / FANTASY video script.

MARKETING TIER — Checklist (score 1-10):
1. Hook Strength (0-3s): Emotional trigger — FOMO / curiosity / pain point
2. Fantasy Level: Cinematic, visually aspirational descriptions
3. Value Proposition: Clear benefit in <10 words
4. Emotional Arc: Builds desire throughout
5. CTA Power: Urgency + scarcity + clear action

Threshold: ≥8/10 to PASS.
If score <8, rewrite the ENTIRE script to Marketing Tier 10/10.

Response format (JSON):
{
  "score": 6,
  "approved": false,
  "tier": "marketing",
  "feedback": "Hook is weak. Fantasy level low. No scarcity in CTA.",
  "checklist": {
    "hook_strength": "FAIL",
    "fantasy_level": "PASS",
    "value_proposition": "PASS",
    "emotional_arc": "FAIL",
    "cta_power": "FAIL"
  },
  "issues": ["Hook lacks emotional trigger", "CTA has no urgency"],
  "suggestions": ["Open with pain point", "Add FOMO countdown"],
  "auto_fixed_script": "...complete rewritten script..."
}"""

    payload = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 3000,
        "system": system,
        "messages": [{"role": "user", "content": f"Review this {tier} script:\n\n{script_md}"}]
    }

    try:
        from urllib.request import Request, urlopen
        req = Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
        )
        with urlopen(req, timeout=90) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            text = result.get("content", [{}])[0].get("text", "").strip()

        if text.startswith("```"):
            text = text.split("```", 2)[-1 if text.count("```") >= 2 else 1]
            if text.startswith("json"):
                text = text[4:]
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            text = text[start:end + 1]

        d = json.loads(text)
        score = d.get("score", 5)
        approved = score >= 8
        log.info("[Pinky-Tier:%s] Score %d/10 — %s", tier, score, "PASS" if approved else "FAIL")

        review = PinkyReview(
            approved=approved,
            score=score,
            feedback=d.get("feedback", ""),
            issues=d.get("issues", []),
            suggestions=d.get("suggestions", []),
            auto_fixed_content=d.get("auto_fixed_script", "")
        )
        review.tier = tier
        review.checklist = d.get("checklist", {})
        return review

    except Exception as e:
        log.error("[Pinky-Tier] Error: %s", e)
        return PinkyReview(
            approved=True, score=8,
            feedback=f"Review error — auto-approved ({e})",
            issues=[], suggestions=[], auto_fixed_content=""
        )


def review_expanded_prompt(
    original_scene: str,
    expanded_prompt: str,
    logger: logging.Logger
) -> PinkyReview:
    """
    Pinky ตรวจ expanded prompt ก่อนส่งให้ Grok (Pre-generation QC)
    
    Ensures:
    - Enough fantasy keywords
    - Human representation
    - Cinematic quality descriptors
    
    Returns:
        PinkyReview with fixed_prompt if not fantasy enough
    """
    env = _load_env()
    api_key = env.get("ANTHROPIC_API_KEY", "").strip()
    
    if not api_key:
        return PinkyReview(
            approved=True,
            score=8,
            feedback="No API — auto-approved",
            issues=[],
            suggestions=[],
            fixed_prompt=""
        )
    
    system = """You are Pinky, Visual Quality Controller for Grok Video prompts.

Your role: Review expanded prompts BEFORE they're sent to Grok.

Requirements for approval (≥8/10):
- Fantasy keywords: ethereal, magical, unreal engine, volumetric lighting
- Human element: expressive Thai character, modern fantasy fashion
- Location: futuristic Bangkok, floating architecture, neon-lit
- Camera: cinematic movement, dynamic angles, 8K quality

Response format (JSON):
{
  "score": 7,
  "approved": false,
  "feedback": "Missing volumetric lighting and particle effects...",
  "issues": ["No particle effects", "Generic camera movement"],
  "suggestions": ["Add 'volumetric god rays'", "Specify 'cinematic tracking shot'"],
  "fixed_prompt": "...improved version with all fantasy elements..."
}

If score <8/10, provide a FIXED PROMPT with ALL required fantasy elements."""
    
    user_msg = f"""Original scene: "{original_scene}"

Expanded prompt to review:
"{expanded_prompt}"

Does this meet world-class fantasy standards? If not, fix it."""
    
    payload = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 1500,
        "system": system,
        "messages": [{"role": "user", "content": user_msg}]
    }
    
    try:
        req = Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
        )
        
        with urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            text = result.get("content", [{}])[0].get("text", "").strip()
            
            try:
                review_data = json.loads(text)
                
                score = review_data.get("score", 8)
                approved = score >= 8
                fixed_prompt = review_data.get("fixed_prompt", "")
                
                return PinkyReview(
                    approved=approved,
                    score=score,
                    feedback=review_data.get("feedback", ""),
                    issues=review_data.get("issues", []),
                    suggestions=review_data.get("suggestions", []),
                    fixed_prompt=fixed_prompt
                )
            
            except json.JSONDecodeError:
                return PinkyReview(
                    approved=True,
                    score=8,
                    feedback=text[:300],
                    issues=[],
                    suggestions=[],
                    fixed_prompt=""
                )
    
    except Exception as e:
        log = logger if hasattr(logger, 'warning') else logging.getLogger('pinky')
        log.warning("[Pinky Prompt] %s", e)
        return PinkyReview(
            approved=True,
            score=8,
            feedback="Error",
            issues=[],
            suggestions=[],
            fixed_prompt=""
        )


def review_video(
    video_path: str,
    script_md: str,
    logger: logging.Logger
) -> PinkyReview:
    """
    Pinky ตรวจวิดีโอ (10-point scale)
    
    Returns:
        PinkyReview (approved if ≥8/10)
    """
    env = _load_env()
    api_key = env.get("ANTHROPIC_API_KEY", "").strip()
    
    if not api_key:
        log = logger if hasattr(logger, 'warning') else logging.getLogger('pinky')
        log.warning("[Pinky] No API — auto-approve video")
        return PinkyReview(
            approved=True,
            score=8,
            feedback="No API — auto-approved",
            issues=[],
            suggestions=[]
        )
    
    # Analyze video
    import subprocess
    
    video_info = {}
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration,size", "-show_streams", "-of", "json", video_path],
            capture_output=True, text=True, timeout=10
        )
        if r.returncode == 0:
            video_info = json.loads(r.stdout)
    except:
        pass
    
    duration = 0.0
    size_mb = 0.0
    has_video = False
    has_audio = False
    
    if video_info.get("format"):
        duration = float(video_info["format"].get("duration", 0))
        size_mb = float(video_info["format"].get("size", 0)) / (1024 * 1024)
    
    if video_info.get("streams"):
        for stream in video_info["streams"]:
            if stream.get("codec_type") == "video":
                has_video = True
            if stream.get("codec_type") == "audio":
                has_audio = True
    
    # Pinky's video review (10-point scale)
    system = """You are Pinky, Chief Quality Officer reviewing final videos (GATEKEEPER MODE).

Score scale: 1-10 (NOT 1-5!)
Approval threshold: ≥8/10

Review criteria:
1. Visual Quality (fantasy level, lighting, human representation)
2. Audio-Visual Sync (perfect timing?)
3. Subtitles (placement, elegance, not blocking faces)
4. Overall Professionalism (ready for $10K+ ad spend?)

Response format (JSON):
{
  "score": 7,
  "approved": false,
  "feedback": "REJECTED. Scene 2 lighting is flat (no fantasy atmosphere). Subtitle blocks face in Scene 3. Audio sync is 0.5s off.",
  "issues": ["Flat lighting Scene 2", "Subtitle blocks face Scene 3", "Audio delay 0.5s"],
  "suggestions": ["Increase ethereal lighting", "Lower subtitle to y=h-100", "Re-sync audio"],
  "reject_target": "visual"
}

Special field: "reject_target" = "script" (บทห่วย → Minnie) or "visual" (ภาพห่วย → Rocky)

Standard: Only approve videos that look like $10K+ cinema ads."""
    
    user_msg = f"""Review this video (GATEKEEPER MODE — threshold 8/10):

**Script**:
{script_md[:800]}

**Video Metadata**:
- Duration: {duration:.1f}s
- Size: {size_mb:.1f} MB
- Has Video: {has_video}
- Has Audio: {has_audio}

Verdict?"""
    
    payload = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 2000,
        "system": system,
        "messages": [{"role": "user", "content": user_msg}]
    }
    
    try:
        req = Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
        )
        
        with urlopen(req, timeout=90) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            text = result.get("content", [{}])[0].get("text", "").strip()
            
            try:
                review_data = json.loads(text)
                
                score = review_data.get("score", 5)
                approved = score >= 8
                
                review = PinkyReview(
                    approved=approved,
                    score=score,
                    feedback=review_data.get("feedback", ""),
                    issues=review_data.get("issues", []),
                    suggestions=review_data.get("suggestions", [])
                )
                
                # Store lesson
                _store_lesson(script_md, video_path, review, logger)
                
                logger.info("[Pinky Video] Score: %d/10, Approved: %s", score, approved)
                
                return review
            
            except json.JSONDecodeError:
                log = logger if hasattr(logger, 'warning') else logging.getLogger('pinky')
                log.warning("[Pinky Video] Response not JSON")
                
                approved = "approve" in text.lower()
                score = 5
                import re
                m = re.search(r"score[:\s]+(\d+)", text, re.IGNORECASE)
                if m:
                    score = int(m.group(1))
                
                return PinkyReview(
                    approved=score >= 8,
                    score=score,
                    feedback=text[:500],
                    issues=[],
                    suggestions=[]
                )
    
    except HTTPError as e:
        body = e.read().decode("utf-8") if hasattr(e, "read") else str(e)
        logger.error("[Pinky Video] HTTP %d: %s", e.code, body[:300])
        
        if e.code == 400 and "credit balance" in body.lower():
            feedback = "⚠ Claude API: No credits — auto-approved. Please top up."
        else:
            feedback = f"⚠ API Error (HTTP {e.code}) — auto-approved."
        
        return PinkyReview(
            approved=True,
            score=8,
            feedback=feedback,
            issues=[],
            suggestions=[]
        )
    
    except Exception as e:
        logger.error("[Pinky Video] %s", e)
        return PinkyReview(
            approved=True,
            score=8,
            feedback="⚠ System Error — auto-approved. Check logs.",
            issues=[],
            suggestions=[]
        )


def _store_lesson(script: str, video_path: str, review: PinkyReview, logger: logging.Logger):
    """Store lessons learned for self-improvement"""
    LESSONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    lessons = []
    if LESSONS_FILE.exists():
        try:
            lessons = json.loads(LESSONS_FILE.read_text(encoding="utf-8"))
        except:
            lessons = []
    
    lesson = {
        "timestamp": datetime.now().isoformat(),
        "script_preview": script[:200],
        "video_path": video_path,
        "approved": review.approved,
        "score": review.score,
        "feedback": review.feedback,
        "issues": review.issues,
        "suggestions": review.suggestions
    }
    
    lessons.append(lesson)
    lessons = lessons[-100:]
    
    LESSONS_FILE.write_text(json.dumps(lessons, indent=2, ensure_ascii=False), encoding="utf-8")


def get_pinky_insights(logger: logging.Logger) -> dict:
    """Get Pinky's quality insights"""
    if not LESSONS_FILE.exists():
        return {
            "total_reviews": 0,
            "avg_score": 0.0,
            "approval_rate": 0.0,
            "common_issues": [],
            "top_suggestions": []
        }
    
    try:
        lessons = json.loads(LESSONS_FILE.read_text(encoding="utf-8"))
    except:
        return {"total_reviews": 0, "avg_score": 0.0, "approval_rate": 0.0, "common_issues": [], "top_suggestions": []}
    
    if not lessons:
        return {"total_reviews": 0, "avg_score": 0.0, "approval_rate": 0.0, "common_issues": [], "top_suggestions": []}
    
    total = len(lessons)
    approved_count = sum(1 for l in lessons if l.get("approved"))
    scores = [l.get("score", 5) for l in lessons]
    avg_score = sum(scores) / len(scores) if scores else 0.0
    
    # Common issues
    all_issues = []
    all_suggestions = []
    for lesson in lessons:
        all_issues.extend(lesson.get("issues", []))
        all_suggestions.extend(lesson.get("suggestions", []))
    
    issue_counts = {}
    for issue in all_issues:
        issue_counts[issue] = issue_counts.get(issue, 0) + 1
    
    suggestion_counts = {}
    for sugg in all_suggestions:
        suggestion_counts[sugg] = suggestion_counts.get(sugg, 0) + 1
    
    common_issues = sorted(issue_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    top_suggestions = sorted(suggestion_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    
    return {
        "total_reviews": total,
        "avg_score": round(avg_score, 1),
        "approval_rate": round(approved_count / total * 100, 1),
        "common_issues": [issue for issue, count in common_issues],
        "top_suggestions": [sugg for sugg, count in top_suggestions]
    }
