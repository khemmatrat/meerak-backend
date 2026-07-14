"""
Thomas (The Distributor) — อัปโหลดวิดีโอไป Facebook / TikTok / Instagram APIs
ต้องมี access tokens และ app credentials ใน .env
"""

from __future__ import annotations

import logging
from pathlib import Path
AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent
ENV_FILE = AQOND_BRAIN / ".env"


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


def publish_status() -> dict[str, bool]:
    """ตรวจว่าแต่ละแพลตฟอร์มพร้อมโพสต์หรือยัง"""
    env = _load_env()
    return {
        "facebook": bool(env.get("FB_PAGE_ACCESS_TOKEN", "").strip() and env.get("FB_PAGE_ID", "").strip()),
        "instagram": bool(env.get("IG_ACCESS_TOKEN", "").strip() and env.get("IG_USER_ID", "").strip()),
        "tiktok": bool(env.get("TIKTOK_ACCESS_TOKEN", "").strip()),
    }


def publish_photo(
    image_path: str,
    caption: str,
    platforms: list[str] | None = None,
    logger: logging.Logger | None = None,
) -> tuple[dict[str, str], list[str]]:
    """โพสต์รูป 1:1 (Flow 1) — รองรับ Facebook"""
    log = logger or logging.getLogger("thomas_publisher")
    env = _load_env()
    platforms = platforms or ["facebook"]
    success: dict[str, str] = {}
    errors: list[str] = []

    for platform in platforms:
        if platform.lower() == "facebook":
            url, err = _publish_facebook_photo(image_path, caption, env, log)
            if url:
                success["facebook"] = url
            else:
                errors.append(f"Facebook: {err}")
        else:
            errors.append(f"{platform}: โพสต์รูปยังไม่รองรับ — ใช้ Facebook ก่อน")

    return success, errors


def _publish_facebook_photo(
    image_path: str, caption: str, env: dict, logger: logging.Logger
) -> tuple[str | None, str]:
    """Facebook Graph — POST /{page-id}/photos"""
    token = env.get("FB_PAGE_ACCESS_TOKEN", "").strip()
    page_id = env.get("FB_PAGE_ID", "").strip()
    if not token or not page_id:
        msg = "ตั้งค่า FB_PAGE_ACCESS_TOKEN และ FB_PAGE_ID ใน .env ก่อน"
        logger.error("[Thomas FB Photo] %s", msg)
        return None, msg

    path = Path(image_path)
    if not path.is_file() or path.stat().st_size < 100:
        return None, f"ไม่พบไฟล์รูป: {image_path}"

    graph_ver = env.get("FB_GRAPH_VERSION", "v21.0").strip() or "v21.0"
    api_url = f"https://graph.facebook.com/{graph_ver}/{page_id}/photos"

    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    try:
        import httpx

        msg = (caption or "")[:8000]
        with httpx.Client(timeout=httpx.Timeout(120.0, connect=30.0)) as client:
            with open(path, "rb") as fp:
                files = {"source": (path.name, fp, mime)}
                data = {"access_token": token, "message": msg}
                r = client.post(api_url, data=data, files=files)

        try:
            body = r.json()
        except Exception:
            body = {}

        if r.status_code != 200:
            err_msg = body.get("error", {}).get("message") if isinstance(body.get("error"), dict) else None
            err_msg = err_msg or (r.text[:500] if r.text else str(r.status_code))
            logger.error("[Thomas FB Photo] HTTP %s: %s", r.status_code, err_msg)
            return None, f"Facebook API {r.status_code}: {err_msg}"

        post_id = body.get("post_id") or body.get("id")
        if not post_id:
            return None, f"Facebook ไม่คืน post id: {body!s}"[:500]

        post_url = f"https://www.facebook.com/{post_id}"
        logger.info("[Thomas FB Photo] OK — %s", post_url)
        return post_url, ""
    except Exception as e:
        logger.exception("[Thomas FB Photo] failed")
        return None, str(e)


def publish_video(
    video_path: str,
    caption: str,
    platforms: list[str],
    logger: logging.Logger | None = None,
) -> tuple[dict[str, str], list[str]]:
    """
    อัปโหลดวิดีโอไปหลาย platforms
    คืน (success_urls_dict, error_messages)
    """
    log = logger or logging.getLogger("thomas_publisher")
    env = _load_env()
    
    success = {}
    errors = []

    for platform in platforms:
        if platform.lower() == "facebook":
            url, err = _publish_facebook(video_path, caption, env, log)
            if url:
                success["facebook"] = url
            else:
                errors.append(f"Facebook: {err}")
        elif platform.lower() == "tiktok":
            url, err = _publish_tiktok(video_path, caption, env, log)
            if url:
                success["tiktok"] = url
            else:
                errors.append(f"TikTok: {err}")
        elif platform.lower() == "instagram":
            url, err = _publish_instagram(video_path, caption, env, log)
            if url:
                success["instagram"] = url
            else:
                errors.append(f"Instagram: {err}")
        elif platform.lower() == "youtube":
            url, err = _publish_youtube(video_path, caption, env, log)
            if url:
                success["youtube"] = url
            else:
                errors.append(f"YouTube: {err}")
        else:
            errors.append(f"Unknown platform: {platform}")

    return (success, errors)


def _publish_facebook(video_path: str, caption: str, env: dict, logger: logging.Logger) -> tuple[str | None, str]:
    """Facebook Graph Video API — multipart upload ไป {page-id}/videos"""
    token = env.get("FB_PAGE_ACCESS_TOKEN", "").strip()
    page_id = env.get("FB_PAGE_ID", "").strip()

    if not token or not page_id:
        msg = "ไม่มี FB_PAGE_ACCESS_TOKEN หรือ FB_PAGE_ID ใน .env"
        logger.error("[Thomas FB] %s", msg)
        return (None, msg)

    path = Path(video_path)
    if not path.is_file():
        return (None, f"ไม่พบไฟล์วิดีโอ: {video_path}")

    graph_ver = env.get("FB_GRAPH_VERSION", "v21.0").strip() or "v21.0"
    api_url = f"https://graph-video.facebook.com/{graph_ver}/{page_id}/videos"

    try:
        import httpx

        desc = (caption or "")[:8000]
        with httpx.Client(timeout=httpx.Timeout(600.0, connect=30.0)) as client:
            with open(path, "rb") as fp:
                files = {"source": (path.name, fp, "video/mp4")}
                data = {"access_token": token, "description": desc}
                r = client.post(api_url, data=data, files=files)

        try:
            body = r.json()
        except Exception:
            body = {}

        if r.status_code != 200:
            err_msg = body.get("error", {}).get("message") if isinstance(body.get("error"), dict) else None
            err_msg = err_msg or (r.text[:500] if r.text else str(r.status_code))
            logger.error("[Thomas FB] HTTP %s: %s", r.status_code, err_msg)
            return (None, f"Facebook API {r.status_code}: {err_msg}")

        vid = body.get("id") or body.get("video_id")
        if not vid:
            logger.error("[Thomas FB] Unexpected response: %s", body)
            return (None, f"Facebook ไม่คืน video id: {body!s}"[:500])

        watch_url = f"https://www.facebook.com/watch/?v={vid}"
        logger.info("[Thomas FB] Uploaded OK — %s", watch_url)
        return (watch_url, "")
    except Exception as e:
        logger.exception("[Thomas FB] upload failed")
        return (None, str(e))


def _publish_tiktok(video_path: str, caption: str, env: dict, logger: logging.Logger) -> tuple[str | None, str]:
    """TikTok API — ต้อง OAuth + Content Posting API access"""
    access_token = env.get("TIKTOK_ACCESS_TOKEN", "").strip()
    
    if not access_token:
        msg = "ไม่มี TIKTOK_ACCESS_TOKEN ใน .env"
        logger.error("[Thomas TikTok] %s", msg)
        return (None, msg)

    logger.info("[Thomas TikTok] อัปโหลด video ไป TikTok — ต้อง implement Content Posting API")
    # TikTok Content Posting API:
    # 1. Initialize upload
    # 2. Upload chunks
    # 3. Publish post with video_id
    
    return (None, "TikTok API ต้อง implement Content Posting + OAuth flow")


def _publish_instagram(video_path: str, caption: str, env: dict, logger: logging.Logger) -> tuple[str | None, str]:
    """Instagram Graph API — ต้อง business account + access token"""
    token = env.get("IG_ACCESS_TOKEN", "").strip()
    ig_user_id = env.get("IG_USER_ID", "").strip()
    
    if not token or not ig_user_id:
        msg = "ไม่มี IG_ACCESS_TOKEN หรือ IG_USER_ID ใน .env"
        logger.error("[Thomas IG] %s", msg)
        return (None, msg)

    logger.info("[Thomas IG] อัปโหลด Reels ไป Instagram — ต้อง implement Container API")
    # Instagram Reels API:
    # 1. POST /{ig-user-id}/media (create container with video_url)
    # 2. Poll status
    # 3. POST /{ig-user-id}/media_publish
    
    return (None, "Instagram API ต้อง implement Container + async polling")


def _publish_youtube(
    video_path: str, caption: str, env: dict, logger: logging.Logger
) -> tuple[str | None, str]:
    """YouTube Data API v3 — ต้อง OAuth + upload endpoint (ยังไม่ implement)"""
    if env.get("YOUTUBE_REFRESH_TOKEN", "").strip() and env.get("YOUTUBE_CLIENT_ID", "").strip():
        msg = "มี YouTube credentials แต่ยังไม่ได้ implement upload — ใช้ Facebook หรือรออัปเดต Thomas"
    else:
        msg = "YouTube: ยังไม่ implement — ต้อง OAuth2 + YouTube Data API v3 (upload)"
    logger.warning("[Thomas YouTube] %s", msg)
    return (None, msg)
