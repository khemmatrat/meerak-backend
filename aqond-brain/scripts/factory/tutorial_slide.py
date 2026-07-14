"""Flow 4 — วาด slide Tutorial 16:9 ด้วย Pillow"""

from __future__ import annotations

import logging
from pathlib import Path

GREEN = (26, 122, 74)
GREEN_DARK = (15, 77, 44)
WHITE = (255, 255, 255)
MUTED = (90, 122, 101)


def _font(size: int):
    from PIL import ImageFont

    for p in (
        r"C:\Windows\Fonts\LeelawUI.ttf",
        r"C:\Windows\Fonts\Tahoma.ttf",
    ):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def render_tutorial_slide(
    slide_idx: int,
    headline: str,
    sub: str,
    topic_title: str,
    output_path: Path,
    logger: logging.Logger | None = None,
) -> bool:
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return False

    w, h = 1920, 1080
    img = Image.new("RGB", (w, h), WHITE)
    draw = ImageDraw.Draw(img)

    if slide_idx == 0:
        for y in range(h):
            t = y / h
            c = tuple(int(GREEN_DARK[i] + (GREEN[i] - GREEN_DARK[i]) * (1 - t)) for i in range(3))
            draw.line([(0, y), (w, y)], fill=c)
        draw.text((w // 2 - 80, 280), "AQOND", font=_font(72), fill=WHITE)
        draw.text((w // 2 - 400, 400), headline[:50], font=_font(48), fill=WHITE)
        draw.text((w // 2 - 300, 500), sub[:60], font=_font(32), fill=(200, 230, 210))
    elif slide_idx >= 6:
        for y in range(h):
            t = y / h
            c = tuple(int(GREEN_DARK[i] + (GREEN[i] - GREEN_DARK[i]) * (1 - t)) for i in range(3))
            draw.line([(0, y), (w, y)], fill=c)
        draw.text((w // 2 - 120, 400), "AQOND", font=_font(80), fill=WHITE)
        draw.text((w // 2 - 280, 520), headline[:40], font=_font(36), fill=(220, 240, 225))
        draw.text((w // 2 - 200, 620), "app.aqond.com · ฟรี!", font=_font(32), fill=WHITE)
    else:
        draw.rectangle((0, 0, w // 2, h), fill=WHITE)
        draw.rectangle((w // 2, 0, w, h), fill=(232, 247, 239))
        draw.text((60, 80), f"ขั้นตอนที่ {slide_idx}", font=_font(28), fill=GREEN)
        draw.text((60, 140), headline[:45], font=_font(44), fill=(26, 42, 31))
        draw.text((60, 240), topic_title[:50], font=_font(26), fill=MUTED)
        draw.rounded_rectangle((w // 2 + 80, 200, w - 80, h - 200), radius=24, fill=WHITE, outline=GREEN, width=3)
        draw.text((w // 2 + 140, h // 2 - 40), "📱 AQOND", font=_font(48), fill=GREEN)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, format="PNG", optimize=True)
    if logger:
        logger.info("[Flow4] Slide %s rendered", slide_idx)
    return output_path.is_file()
