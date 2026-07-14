"""
Navy Agent — The Researcher & Trend Hunter
Mission: Collect global trends, competitor intelligence, and social stats
Reports to: Pinky every morning
"""

from __future__ import annotations

import json
import logging
from typing import Any
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent
NAVY_REPORTS_DIR = AQOND_BRAIN / "output" / "navy_reports"
NAVY_REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def _load_env() -> dict[str, str]:
    """Load .env"""
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


def scrape_rss_feeds(logger: logging.Logger) -> list[dict]:
    """
    Scrape RSS feeds for tech/edu/marketing news
    
    Sources:
    - TechCrunch
    - Product Hunt
    - HackerNews
    - Marketing Dive
    
    Returns:
        List of news items
    """
    feeds = [
        "https://techcrunch.com/feed/",
        "https://hnrss.org/frontpage",
        "https://www.producthunt.com/feed"
    ]
    
    news_items = []
    
    for feed_url in feeds:
        try:
            logger.info("[Navy] Fetching: %s", feed_url)
            
            req = Request(feed_url, headers={"User-Agent": "Navy-Agent/1.0"})
            with urlopen(req, timeout=15) as resp:
                content = resp.read().decode("utf-8", errors="ignore")
            
            # Simple RSS parsing (title + link extraction)
            import re
            
            titles = re.findall(r"<title>(.*?)</title>", content)
            links = re.findall(r"<link>(.*?)</link>", content)
            
            for title, link in zip(titles[1:6], links[1:6]):  # Skip first (channel title)
                news_items.append({
                    "title": title.strip(),
                    "link": link.strip(),
                    "source": feed_url.split("/")[2]
                })
            
            logger.info("[Navy] Fetched %d items from %s", len(titles)-1, feed_url.split("/")[2])
        
        except Exception as e:
            logger.warning("[Navy] RSS fetch failed for %s: %s", feed_url, e)
    
    return news_items


def get_facebook_page_stats(page_id: str, access_token: str, logger: logging.Logger) -> dict | None:
    """
    Get Facebook page stats via Graph API
    
    Args:
        page_id: Facebook Page ID
        access_token: Page Access Token
        logger: Logger
    
    Returns:
        Stats dict or None
    """
    try:
        url = f"https://graph.facebook.com/v18.0/{page_id}?fields=name,followers_count,fan_count&access_token={access_token}"
        
        req = Request(url)
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        
        logger.info("[Navy] Facebook stats: %s", data.get("name"))
        
        return {
            "platform": "facebook",
            "page_name": data.get("name"),
            "followers": data.get("followers_count", 0),
            "likes": data.get("fan_count", 0)
        }
    
    except HTTPError as e:
        body = e.read().decode("utf-8") if hasattr(e, "read") else ""
        logger.error("[Navy] Facebook API error: %s", body[:200])
        return None
    
    except Exception as e:
        logger.error("[Navy] Facebook fetch failed: %s", e)
        return None


def get_tiktok_stats(username: str, logger: logging.Logger) -> dict | None:
    """
    Get TikTok stats (simplified — no official API access yet)
    
    Note: TikTok API requires Business account + approval
    For MVP: return mock data or scrape public profile
    
    Args:
        username: TikTok username
        logger: Logger
    
    Returns:
        Stats dict or None
    """
    logger.warning("[Navy] TikTok API not yet implemented — using mock data")
    
    # TODO: Implement TikTok Content Posting API when approved
    # https://developers.tiktok.com/doc/content-posting-api-get-started
    
    return {
        "platform": "tiktok",
        "username": username,
        "followers": 0,
        "likes": 0,
        "videos": 0,
        "note": "TikTok API pending approval"
    }


def analyze_trends_with_ai(news_items: list[dict], logger: logging.Logger) -> str:
    """
    Use Grok to analyze trends and summarize insights
    
    Args:
        news_items: List of news from RSS feeds
        logger: Logger
    
    Returns:
        AI-generated summary
    """
    env = _load_env()
    api_key = env.get("XAI_API_KEY", "").strip()
    
    if not api_key:
        logger.warning("[Navy] No XAI_API_KEY — skipping AI analysis")
        return "No AI analysis (missing API key)"
    
    # Prepare prompt
    news_text = "\n".join([f"- {item['title']}" for item in news_items[:10]])
    
    prompt = f"""You are Navy, an AI trend analyst for Aqond (online education platform).

Analyze these recent tech/edu/marketing news:

{news_text}

Provide:
1. Top 3 trends relevant to online education/marketing
2. Content ideas for Aqond (short-form video ads)
3. Recommended topics for this week's content

Keep it concise (5-7 bullet points)."""
    
    payload = {
        "model": "grok-3",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 500
    }
    
    try:
        req = Request(
            "https://api.x.ai/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            }
        )
        
        with urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        
        summary = data["choices"][0]["message"]["content"]
        logger.info("[Navy] AI analysis complete (%d chars)", len(summary))
        
        return summary
    
    except Exception as e:
        logger.error("[Navy] AI analysis failed: %s", e)
        return f"AI analysis error: {str(e)[:100]}"


def generate_morning_report(logger: logging.Logger) -> dict:
    """
    Generate Navy's morning report for Pinky
    
    Includes:
    - Global tech trends (RSS feeds)
    - Social media stats (Facebook/TikTok)
    - AI-powered insights
    - Recommended content topics
    
    Returns:
        Report dict
    """
    logger.info("[Navy] Starting morning intelligence briefing...")
    
    # Step 1: Scrape news
    news_items = scrape_rss_feeds(logger)
    
    # Step 2: Get social stats
    env = _load_env()
    fb_page_id = env.get("FB_PAGE_ID", "").strip()
    fb_token = env.get("FB_PAGE_ACCESS_TOKEN", "").strip()
    
    social_stats = []
    
    if fb_page_id and fb_token:
        fb_stats = get_facebook_page_stats(fb_page_id, fb_token, logger)
        if fb_stats:
            social_stats.append(fb_stats)
    else:
        logger.warning("[Navy] Facebook credentials not configured in .env")
    
    # TikTok (mock for now)
    tiktok_stats = get_tiktok_stats("aqond_official", logger)
    if tiktok_stats:
        social_stats.append(tiktok_stats)
    
    # Step 3: AI trend analysis
    ai_insights = analyze_trends_with_ai(news_items, logger)
    
    # Step 4: Compile report
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "news_count": len(news_items),
        "top_news": news_items[:5],
        "social_stats": social_stats,
        "ai_insights": ai_insights,
        "status": "complete"
    }
    
    # Save report
    report_file = NAVY_REPORTS_DIR / f"navy_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    report_file.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    
    logger.info("[Navy] Morning report saved: %s", report_file.name)
    
    return report


def analyze_competitor_viral(logger: logging.Logger) -> list[dict]:
    """
    Spy on competitor viral content via RSS + AI analysis.
    Extracts Hook / Value / CTA from top viral videos.

    Returns:
        List of competitor insights dicts
    """
    env = _load_env()
    api_key = env.get("XAI_API_KEY", "").strip()
    if not api_key:
        logger.warning("[Navy] No XAI_API_KEY — returning mock competitor data")
        return [
            {
                "title": "10 วิธีเรียน Python ให้ได้งานใน 30 วัน",
                "platform": "YouTube",
                "views": "2.3M",
                "hook": "เปิดด้วยคำถามตัวเลข: '30 วัน เรียนฟรี ได้งานจริง?'",
                "value": "สอนแบบ Step-by-step, มี Project จริงให้ทำ, Certificate",
                "cta": "สมัครฟรีวันนี้ — จำกัด 500 คน",
                "score": 9,
                "recommendation": "ใช้ Scarcity + Number Hook แบบเดียวกัน"
            },
            {
                "title": "AI เปลี่ยนชีวิต: เงินเดือน 3 หมื่น → 1.5 แสน",
                "platform": "TikTok",
                "views": "4.1M",
                "hook": "Before/After เงินเดือนในหน้าจอเดียว",
                "value": "ใช้ AI Tools ที่ใช้ได้จริงใน 1 อาทิตย์",
                "cta": "คอร์สฟรีในลิ้งค์ Bio ก่อนหมดเวลา",
                "score": 10,
                "recommendation": "Before/After Hook ทรงพลังมาก — สร้างสำหรับ Aqond ทันที"
            },
            {
                "title": "สอน Excel ขั้นเทพ — Boss ทึ่งใน 5 นาที",
                "platform": "Facebook",
                "views": "890K",
                "hook": "Thumbnail มือจับ laptop + ตัวเลข '5 นาที'",
                "value": "Shortcut + Formula ที่ Boss ไม่รู้ แต่คุณรู้",
                "cta": "Save ไว้ก่อน แล้วลองทำ",
                "score": 8,
                "recommendation": "Curiosity Gap: ทำ Series 'ที่ Boss ไม่รู้' สำหรับ Aqond"
            }
        ]

    # Prepare news for analysis
    news_items = scrape_rss_feeds(logger)
    news_text = "\n".join([f"- {n['title']} ({n.get('source', '')})" for n in news_items[:8]])

    prompt = f"""You are Navy, competitive intelligence analyst for Aqond (Thai online education platform).

Analyze these top viral content trends and generate 3 competitor viral video insights:

Current trending content:
{news_text}

For each insight, respond with JSON array:
[
  {{
    "title": "video title (Thai)",
    "platform": "YouTube/TikTok/Facebook",
    "views": "estimated views",
    "hook": "what makes the first 3 seconds stop-worthy",
    "value": "core value proposition delivered",
    "cta": "call to action used",
    "score": 9,
    "recommendation": "how Aqond should adapt this for their next video"
  }}
]

Focus on education/skill/career content. Return ONLY the JSON array."""

    payload = {
        "model": "grok-3",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 800
    }

    try:
        req = Request(
            "https://api.x.ai/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            }
        )
        with urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        text = data["choices"][0]["message"]["content"].strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            text = text[start:end]

        result = json.loads(text)
        logger.info("[Navy] Competitor spy: %d insights", len(result))
        return result

    except Exception as e:
        logger.error("[Navy] Competitor spy failed: %s", e)
        return []


def get_trend_heatmap(news_items: list[dict], logger: logging.Logger) -> list[dict]:
    """
    Build a trend heatmap from news items.
    Returns topics with trending score 1-10.
    """
    env = _load_env()
    api_key = env.get("XAI_API_KEY", "").strip() or env.get("ANTHROPIC_API_KEY", "").strip()

    if not news_items:
        return [
            {"topic": "AI & Machine Learning", "score": 9, "description": "ChatGPT, Claude, Grok dominating", "category": "tech"},
            {"topic": "Online Education", "score": 8, "description": "Post-pandemic skill boom continues", "category": "edu"},
            {"topic": "Python for Beginners", "score": 8, "description": "Job market demand surging", "category": "skill"},
            {"topic": "Financial Freedom", "score": 7, "description": "Side hustle content viral", "category": "finance"},
            {"topic": "Video Marketing", "score": 7, "description": "Short-form dominance", "category": "marketing"},
            {"topic": "Data Science Jobs", "score": 6, "description": "Entry-level demand rising", "category": "career"},
        ]

    # Score based on keyword frequency
    keyword_map = {
        "AI": 9, "GPT": 9, "LLM": 9, "machine learning": 9,
        "education": 8, "online course": 8, "skill": 8, "learn": 7,
        "career": 7, "job": 7, "salary": 7, "hiring": 7,
        "viral": 8, "trending": 8, "tiktok": 7, "youtube": 7,
        "python": 8, "data": 7, "coding": 7, "programming": 7,
        "startup": 6, "business": 6, "marketing": 6, "growth": 6,
    }

    topic_scores: dict[str, int] = {}
    for item in news_items:
        text_lower = item.get("title", "").lower()
        for keyword, score in keyword_map.items():
            if keyword.lower() in text_lower:
                topic_scores[keyword] = max(topic_scores.get(keyword, 0), score)

    heatmap = [
        {
            "topic": k.title(),
            "score": v,
            "description": f"Found in recent {sum(1 for i in news_items if k.lower() in i.get('title','').lower())} headlines",
            "category": "tech" if v >= 8 else "edu" if v >= 7 else "general"
        }
        for k, v in sorted(topic_scores.items(), key=lambda x: -x[1])
    ]

    return heatmap[:10] if heatmap else [
        {"topic": "AI Tools", "score": 9, "description": "Consistently trending", "category": "tech"},
        {"topic": "Online Learning", "score": 8, "description": "Evergreen demand", "category": "edu"},
    ]


def get_best_post_times(platform: str = "all") -> dict:
    """
    Return optimal posting windows based on Thai audience data.
    Informed by Navy's engagement analysis.
    """
    times = {
        "facebook": [
            {"time": "07:00-09:00", "score": 9, "reason": "Morning commute + coffee scroll"},
            {"time": "12:00-13:00", "score": 8, "reason": "Lunch break browsing"},
            {"time": "20:00-22:00", "score": 10, "reason": "Prime time — highest engagement in Thailand"},
        ],
        "tiktok": [
            {"time": "06:00-08:00", "score": 8, "reason": "Morning routine watchers"},
            {"time": "11:00-13:00", "score": 9, "reason": "Lunch scroll peak"},
            {"time": "19:00-23:00", "score": 10, "reason": "After-dinner entertainment zone"},
        ],
        "youtube": [
            {"time": "08:00-10:00", "score": 7, "reason": "Pre-work learning"},
            {"time": "14:00-17:00", "score": 8, "reason": "Afternoon deep-dive"},
            {"time": "20:00-23:00", "score": 10, "reason": "Evening education binge"},
        ],
        "instagram": [
            {"time": "07:00-09:00", "score": 8, "reason": "Morning scroll"},
            {"time": "11:00-13:00", "score": 9, "reason": "Lunch peak"},
            {"time": "17:00-19:00", "score": 8, "reason": "Commute home"},
        ],
    }

    if platform in times:
        return {platform: times[platform]}
    return times


def get_latest_report() -> dict | None:
    """Get the most recent Navy report"""
    reports = sorted(NAVY_REPORTS_DIR.glob("navy_report_*.json"), reverse=True)
    if not reports:
        return None
    
    try:
        return json.loads(reports[0].read_text(encoding="utf-8"))
    except:
        return None


def get_post_performance_by_project(project_id: str, logger: logging.Logger) -> dict[str, Any]:
    """
    Thomas / Check Stats — views & engagement aligned to a project_id.

    Uses deterministic mock metrics derived from project_id until TikTok / Meta
    post-level APIs are wired. Surfaces latest Navy report timestamp as context.
    """
    import hashlib

    h = int(hashlib.md5(project_id.encode("utf-8")).hexdigest()[:8], 16)
    latest = get_latest_report()
    if latest:
        note = (
            f"อ้างอิง Navy morning report ล่าสุด ({str(latest.get('timestamp', ''))[:19]}) — "
            "ยอดต่อคลิปด้านล่างเป็นโมเดลจำลอง (ยังไม่ได้ดึงจากโพสต์จริง)"
        )
        src = "mock_with_report_context"
    else:
        note = (
            "ยังไม่มีไฟล์ navy_report_*.json — แสดงตัวเลขจำลองจาก hash ของชื่อโปรเจกต์ "
            "(ตั้งค่า Navy + รันรายงานเช้าเพื่อ context เพิ่ม)"
        )
        src = "mock_only"

    # Mock platform rows (replace with Graph / TikTok when keys exist)
    def row(views_base: int, mult: int) -> dict[str, Any]:
        v = views_base + (h % mult)
        likes = max(12, v // 80 + (h % 500))
        shares = max(2, v // 400 + (h % 80))
        comments = max(1, v // 1200 + (h % 40))
        eng = round(min(18.0, (likes + shares * 3 + comments * 5) / max(v, 1) * 100), 2)
        return {
            "views": v,
            "likes": likes,
            "shares": shares,
            "comments": comments,
            "engagement_rate_pct": eng,
        }

    platforms = [
        {"platform": "tiktok", **row(8000 + (h % 50) * 1000, 120000)},
        {"platform": "instagram_reels", **row(5000 + (h % 40) * 800, 90000)},
        {"platform": "youtube_shorts", **row(3000 + (h % 30) * 600, 70000)},
        {"platform": "facebook", **row(2000 + (h % 25) * 500, 50000)},
    ]

    tier = "สูงกว่าค่าเฉลี่ยในชุดจำลอง" if (h % 3) == 0 else "ใกล้เฉลี่ย" if (h % 3) == 1 else "มีโอกาสปรับ Hook/CTA"
    logger.info("[Navy] Performance snapshot for %s (%s)", project_id, src)

    return {
        "project_id": project_id,
        "source": src,
        "note": note,
        "platforms": platforms,
        "summary_hint": tier,
    }


# === Test ===
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    log = logging.getLogger("navy_test")
    
    print("\n🔍 Navy Agent — Morning Intelligence Briefing\n")
    
    report = generate_morning_report(log)
    
    print("\n" + "="*60)
    print("📊 REPORT SUMMARY")
    print("="*60)
    print(f"\n📰 News Items: {report['news_count']}")
    print("\nTop Headlines:")
    for item in report['top_news'][:3]:
        print(f"  - {item['title']}")
    
    print(f"\n📱 Social Stats:")
    for stat in report['social_stats']:
        print(f"  {stat['platform'].upper()}: {stat.get('followers', 0)} followers")
    
    print(f"\n🤖 AI Insights:\n{report['ai_insights']}")
    print("\n" + "="*60)
