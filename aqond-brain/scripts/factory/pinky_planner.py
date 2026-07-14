"""
Pinky's 7-Day Content Planner — Creative Director Automation
Mission: Plan 7-10 videos/day for the next 7 days
Auto-triggers Minnie pipeline
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent
PLANNER_DIR = AQOND_BRAIN / "output" / "content_calendar"
PLANNER_DIR.mkdir(parents=True, exist_ok=True)


def load_navy_report() -> dict | None:
    """Load latest Navy report for trend insights"""
    from factory.navy_agent import get_latest_report
    return get_latest_report()


def _load_env() -> dict[str, str]:
    """Load .env file"""
    env_path = AQOND_BRAIN / ".env"
    out = {}
    if not env_path.exists():
        return out
    for line in open(env_path, "r", encoding="utf-8"):
        line = line.split("#")[0].strip()
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        if v:
            out[k.strip()] = v
    return out


def generate_content_ideas_with_ai(
    navy_insights: str,
    num_ideas: int,
    logger: logging.Logger
) -> list[dict]:
    """
    Use Grok to generate content ideas based on Navy's insights
    
    Args:
        navy_insights: Navy's AI analysis from morning report
        num_ideas: Number of content ideas to generate
        logger: Logger
    
    Returns:
        List of content briefs
    """
    env = _load_env()
    api_key = env.get("XAI_API_KEY", "").strip()
    
    if not api_key:
        logger.warning("[Pinky Planner] No XAI_API_KEY — using fallback topics")
        # Fallback: generic education topics
        return [
            {"title": f"Aqond Feature #{i+1}", "hook": "เรียนออนไลน์ยุคใหม่", "target": "Students"}
            for i in range(num_ideas)
        ]
    
    prompt = f"""You are Pinky, Creative Director for Aqond (online education platform).

Based on these market insights from Navy:
{navy_insights}

Generate {num_ideas} short-form video ad concepts (30-60s each) for Aqond.

For each concept, provide (JSON format):
- title: Catchy title (Thai)
- hook: Opening line (grabs attention in 3s)
- problem: Pain point students face
- solution: How Aqond solves it
- cta: Call-to-action
- target_audience: Students, Parents, or Professionals
- tone: Inspirational, Urgent, Educational, or Emotional

Output JSON array only."""
    
    payload = {
        "model": "grok-3",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 2000
    }
    
    try:
        from urllib.request import Request, urlopen
        
        req = Request(
            "https://api.x.ai/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            }
        )
        
        with urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        
        response_text = data["choices"][0]["message"]["content"]
        
        # Parse JSON
        import re
        json_match = re.search(r"\[.*\]", response_text, re.DOTALL)
        if json_match:
            ideas = json.loads(json_match.group(0))
            logger.info("[Pinky Planner] Generated %d content ideas", len(ideas))
            return ideas[:num_ideas]
        else:
            logger.warning("[Pinky Planner] Failed to parse JSON — using fallback")
            return [
                {"title": f"Aqond Concept {i+1}", "hook": "Transform your learning", "target": "Students"}
                for i in range(num_ideas)
            ]
    
    except Exception as e:
        logger.error("[Pinky Planner] AI generation failed: %s", e)
        return [
            {"title": f"Aqond Ad {i+1}", "hook": "Online education revolution", "target": "Students"}
            for i in range(num_ideas)
        ]


def create_7_day_calendar(videos_per_day: int, logger: logging.Logger) -> dict:
    """
    Create 7-day content calendar with AI-generated ideas
    
    Args:
        videos_per_day: Number of videos to produce per day (7-10)
        logger: Logger
    
    Returns:
        Calendar dict
    """
    logger.info("[Pinky Planner] Creating 7-day calendar (%d videos/day)...", videos_per_day)
    
    # Load Navy's latest insights
    navy_report = load_navy_report()
    navy_insights = navy_report.get("ai_insights", "No insights available") if navy_report else "No insights"
    
    # Generate content ideas for 7 days
    total_ideas = videos_per_day * 7
    content_ideas = generate_content_ideas_with_ai(navy_insights, total_ideas, logger)
    
    # Distribute across 7 days
    calendar = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "videos_per_day": videos_per_day,
        "days": []
    }
    
    for day_offset in range(7):
        target_date = datetime.now(timezone.utc) + timedelta(days=day_offset)
        day_ideas = content_ideas[day_offset * videos_per_day:(day_offset + 1) * videos_per_day]
        
        calendar["days"].append({
            "date": target_date.strftime("%Y-%m-%d"),
            "day_name": target_date.strftime("%A"),
            "videos": day_ideas,
            "status": "planned" if day_offset > 0 else "active"
        })
    
    # Save calendar
    calendar_file = PLANNER_DIR / f"calendar_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    calendar_file.write_text(json.dumps(calendar, indent=2, ensure_ascii=False), encoding="utf-8")
    
    logger.info("[Pinky Planner] Calendar saved: %s", calendar_file.name)
    
    return calendar


def get_today_schedule() -> list[dict] | None:
    """Get today's video production schedule"""
    calendars = sorted(PLANNER_DIR.glob("calendar_*.json"), reverse=True)
    if not calendars:
        return None
    
    try:
        calendar = json.loads(calendars[0].read_text(encoding="utf-8"))
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        for day in calendar["days"]:
            if day["date"] == today:
                return day["videos"]
        
        return None
    except:
        return None


def trigger_minnie_pipeline(content_brief: dict, logger: logging.Logger) -> str | None:
    """
    Automatically trigger Minnie to start script generation
    
    Args:
        content_brief: Content idea from calendar
        logger: Logger
    
    Returns:
        Project ID or None
    """
    logger.info("[Pinky Planner] Triggering Minnie for: %s", content_brief.get("title", "Untitled"))
    
    try:
        from factory.production_manager import ProductionManager
        
        pm = ProductionManager()
        
        # Create brief for Minnie
        brief = f"""# Content Brief

**Title:** {content_brief.get('title', 'Aqond Video Ad')}

**Hook:** {content_brief.get('hook', 'Transform your learning')}

**Problem:** {content_brief.get('problem', 'Traditional education is outdated')}

**Solution:** {content_brief.get('solution', 'Aqond brings AI-powered online learning')}

**CTA:** {content_brief.get('cta', 'Download Aqond now!')}

**Target Audience:** {content_brief.get('target_audience', 'Students')}

**Tone:** {content_brief.get('tone', 'Inspirational')}

**Duration:** 45-60 seconds
**Style:** Short-form vertical video for TikTok/IG Reels
"""
        
        # Create project
        project = pm.create_project(brief, spy_report=None)
        
        logger.info("[Pinky Planner] Project created: %s", project.project_id)
        
        # Note: Script generation will be triggered by orchestrator
        # For now, just create the project with brief
        logger.info("[Pinky Planner] Project queued: %s (script pending)", project.project_id)
        
        return project.project_id
    
    except Exception as e:
        logger.error("[Pinky Planner] Pipeline trigger failed: %s", e)
        return None


def auto_start_today_production(logger: logging.Logger) -> list[str]:
    """
    Automatically start production for today's scheduled videos
    
    Returns:
        List of created project IDs
    """
    logger.info("[Pinky Planner] Starting auto-production for today...")
    
    schedule = get_today_schedule()
    if not schedule:
        logger.warning("[Pinky Planner] No schedule found for today")
        return []
    
    project_ids = []
    
    for content_brief in schedule:
        project_id = trigger_minnie_pipeline(content_brief, logger)
        if project_id:
            project_ids.append(project_id)
    
    logger.info("[Pinky Planner] Started %d projects", len(project_ids))
    
    return project_ids


# === Test ===
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    log = logging.getLogger("planner_test")
    
    print("\n📅 Pinky's 7-Day Content Planner\n")
    
    # Create calendar
    calendar = create_7_day_calendar(videos_per_day=7, logger=log)
    
    print("\n" + "="*60)
    print("CONTENT CALENDAR (Next 7 Days)")
    print("="*60)
    
    for day in calendar["days"]:
        print(f"\n📆 {day['date']} ({day['day_name']}) — {len(day['videos'])} videos")
        for i, video in enumerate(day['videos'][:2], 1):  # Show first 2
            print(f"  {i}. {video.get('title', 'Untitled')}")
            print(f"     Hook: {video.get('hook', 'N/A')}")
    
    print("\n" + "="*60)
    
    # Test auto-start (commented out to avoid accidental execution)
    # project_ids = auto_start_today_production(log)
    # print(f"\n✅ Started {len(project_ids)} projects")
