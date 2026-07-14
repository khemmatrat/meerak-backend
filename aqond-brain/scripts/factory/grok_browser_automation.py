"""
Grok Browser Automation — Zero-Touch Video Generation
Playwright: Login → Send Prompt → Download Video
"""

from __future__ import annotations

import asyncio
import logging
import tempfile
import time
from pathlib import Path

from playwright.async_api import async_playwright, Browser, Page, TimeoutError as PlaywrightTimeoutError

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent
ENV_FILE = AQOND_BRAIN / ".env"
DOWNLOAD_DIR = AQOND_BRAIN / "output" / "grok_videos"
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _load_env() -> dict[str, str]:
    """Load .env"""
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


async def login_grok(page: Page, logger: logging.Logger) -> bool:
    """
    Login to Grok (x.ai)
    
    Returns:
        True if logged in successfully
    """
    try:
        logger.info("[Grok Bot] Navigating to x.ai/grok...")
        await page.goto("https://x.ai/grok", timeout=30000, wait_until="networkidle")
        
        # Check if already logged in
        if "grok" in page.url and "chat" in page.url:
            logger.info("[Grok Bot] Already logged in!")
            return True
        
        # Click login button
        logger.info("[Grok Bot] Looking for login button...")
        login_btn = page.locator("button:has-text('Sign in'), a:has-text('Sign in')").first
        if await login_btn.is_visible(timeout=5000):
            await login_btn.click()
            await page.wait_for_timeout(2000)
        
        # Wait for user to login manually (OAuth window)
        logger.warning("[Grok Bot] Waiting for manual login (60s timeout)...")
        logger.warning("[Grok Bot] Please login in the browser window that opened!")
        
        # Wait for redirect to chat interface
        try:
            await page.wait_for_url("**/grok*", timeout=60000)
            logger.info("[Grok Bot] Login successful!")
            return True
        except PlaywrightTimeoutError:
            logger.error("[Grok Bot] Login timeout — user did not complete login")
            return False
    
    except Exception as e:
        logger.error("[Grok Bot] Login failed: %s", e)
        return False


async def send_prompt_and_download_video(
    page: Page,
    prompt: str,
    duration: int,
    logger: logging.Logger,
    max_wait: int = 300
) -> str | None:
    """
    Send video generation prompt to Grok and download result
    
    Args:
        page: Playwright page
        prompt: Video generation prompt (Fantasy style)
        duration: Video duration in seconds
        logger: Logger
        max_wait: Max wait time for video generation (seconds)
    
    Returns:
        Path to downloaded video or None
    """
    try:
        logger.info("[Grok Bot] Sending prompt: %s", prompt[:100])
        
        # Find chat input
        chat_input = page.locator("textarea[placeholder*='Ask'], textarea[placeholder*='Message']").first
        await chat_input.wait_for(state="visible", timeout=10000)
        
        # Type prompt
        full_prompt = f"Generate a {duration}s cinematic video: {prompt}"
        await chat_input.fill(full_prompt)
        await page.wait_for_timeout(1000)
        
        # Press Enter or click Send
        send_btn = page.locator("button[type='submit'], button:has-text('Send')").first
        if await send_btn.is_visible(timeout=2000):
            await send_btn.click()
        else:
            await chat_input.press("Enter")
        
        logger.info("[Grok Bot] Prompt sent — waiting for video generation...")
        
        # Wait for video element to appear
        start_time = time.time()
        video_downloaded = False
        download_path = None
        
        while time.time() - start_time < max_wait:
            # Look for video element in response
            video_elements = await page.locator("video").all()
            
            if video_elements:
                logger.info("[Grok Bot] Video element found — attempting download...")
                
                # Get video src
                for video in video_elements:
                    src = await video.get_attribute("src")
                    if src and ("http" in src or "blob" in src):
                        logger.info("[Grok Bot] Video src: %s", src[:100])
                        
                        # Download video
                        if "http" in src:
                            # Direct URL
                            download_path = await _download_video_from_url(page, src, logger)
                        else:
                            # Blob URL — need to download via context menu
                            download_path = await _download_video_from_element(page, video, logger)
                        
                        if download_path:
                            video_downloaded = True
                            break
                
                if video_downloaded:
                    break
            
            # Check for download links
            download_links = await page.locator("a[download], a:has-text('Download')").all()
            if download_links:
                logger.info("[Grok Bot] Found download link — clicking...")
                async with page.expect_download() as download_info:
                    await download_links[0].click()
                download = await download_info.value
                
                download_path = DOWNLOAD_DIR / download.suggested_filename
                await download.save_as(str(download_path))
                logger.info("[Grok Bot] Video downloaded: %s", download_path.name)
                video_downloaded = True
                break
            
            # Wait and check again
            await page.wait_for_timeout(5000)
            elapsed = int(time.time() - start_time)
            logger.info("[Grok Bot] Still waiting... (%ds/%ds)", elapsed, max_wait)
        
        if not video_downloaded:
            logger.error("[Grok Bot] Video generation timeout after %ds", max_wait)
            return None
        
        return str(download_path)
    
    except Exception as e:
        logger.error("[Grok Bot] Error: %s", e)
        return None


async def _download_video_from_url(page: Page, url: str, logger: logging.Logger) -> str | None:
    """Download video from direct URL"""
    try:
        import urllib.request
        
        temp_path = DOWNLOAD_DIR / f"grok_video_{int(time.time())}.mp4"
        urllib.request.urlretrieve(url, str(temp_path))
        
        logger.info("[Grok Bot] Downloaded from URL: %s", temp_path.name)
        return str(temp_path)
    except Exception as e:
        logger.error("[Grok Bot] Download from URL failed: %s", e)
        return None


async def _download_video_from_element(page: Page, video_element, logger: logging.Logger) -> str | None:
    """Download video from blob URL via JavaScript"""
    try:
        # Execute JavaScript to download blob
        temp_path = DOWNLOAD_DIR / f"grok_video_{int(time.time())}.mp4"
        
        download_script = f"""
        async function downloadVideo(videoElement, savePath) {{
            const response = await fetch(videoElement.src);
            const blob = await response.blob();
            return blob;
        }}
        downloadVideo(arguments[0]);
        """
        
        blob = await page.evaluate(download_script, video_element)
        # This is a simplified version — actual implementation would need page.route() interception
        
        logger.warning("[Grok Bot] Blob download not fully implemented yet — use manual download")
        return None
    
    except Exception as e:
        logger.error("[Grok Bot] Blob download failed: %s", e)
        return None


async def generate_video_with_browser(
    prompt: str,
    duration: int = 10,
    logger: logging.Logger | None = None,
    headless: bool = False
) -> str | None:
    """
    Main function: Generate video using Grok browser automation
    
    Args:
        prompt: Video generation prompt (already expanded by prompt_expander.py)
        duration: Video duration in seconds
        logger: Logger
        headless: Run browser in headless mode (False = visible for debugging)
    
    Returns:
        Path to downloaded video or None
    """
    log = logger or logging.getLogger("grok_bot")
    
    log.info("[Grok Bot] Starting browser automation...")
    log.info("[Grok Bot] Prompt: %s", prompt[:150])
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            args=["--start-maximized"] if not headless else []
        )
        
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080} if not headless else None,
            accept_downloads=True
        )
        
        page = await context.new_page()
        
        try:
            # Step 1: Login
            if not await login_grok(page, log):
                log.error("[Grok Bot] Login failed — aborting")
                await browser.close()
                return None
            
            # Step 2: Send prompt and download video
            video_path = await send_prompt_and_download_video(page, prompt, duration, log, max_wait=300)
            
            if video_path:
                log.info("[Grok Bot] Success! Video: %s", Path(video_path).name)
            else:
                log.error("[Grok Bot] Failed to download video")
            
            return video_path
        
        finally:
            await browser.close()


# === Test ===
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    log = logging.getLogger("test")
    
    test_prompt = "A visionary Thai entrepreneur sitting in a floating neon-lit cafe above futuristic Bangkok, surrounded by magical digital aura, holding holographic laptop, cinematic camera sweep, 8K resolution, fantasy aesthetic"
    
    video = asyncio.run(generate_video_with_browser(test_prompt, duration=10, logger=log, headless=False))
    
    if video:
        print(f"\n✅ Video generated: {video}")
    else:
        print("\n❌ Video generation failed")
