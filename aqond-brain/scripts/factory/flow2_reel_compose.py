"""Flow 2 — ฉากจบ (โลโก้+QR ไฟล์จริง) + ลายน้ำทั้งวิดีโอ"""

from __future__ import annotations

import logging
import re
import subprocess
from pathlib import Path
from typing import Any

from factory.flow1_post_compose import (
    _draw_text_panel,
    _find_thai_font,
    _paste_logo_watermark,
    _paste_uploaded_qr,
    get_qr_path,
    get_watermark_path,
)

# Layout ฉากจบ Reel 9:16 — โลโก้ขวาบน, QR ขวาล่าง, ข้อความ CTA ซ้ายล่าง
REEL_END_LAYOUT: dict[str, dict[str, float | str]] = {
    "watermark": {"anchor": "top-right", "x_pct": 96.0, "y_pct": 3.5, "size_pct": 11.0},
    "qr": {"anchor": "bottom-right", "x_pct": 94.0, "y_pct": 91.0, "size_pct": 13.5},
    "text": {"anchor": "bottom-left", "x_pct": 5.0, "y_pct": 90.0},
}

# ลายน้ำมุมขวาบน — ขนาด ~9% ความกว้างวิดีโอ (Reel 1080×1920 ≈ 97px)
WM_SIZE_RATIO = 0.09
WM_MARGIN_X = 20
WM_MARGIN_Y = 20
WM_OPACITY = 0.48


def _end_cta_lines(vo: str, topic: str) -> list[str]:
    vo = (vo or "").strip()
    topic = (topic or "").strip()
    if "app.aqond" in vo.lower():
        lead = re.split(r"app\.aqond", vo, flags=re.I)[0].strip(" .,!")
        if lead and len(lead) > 4:
            return [lead[:48], "app.aqond.com"]
    if topic and len(topic) < 50:
        return [topic[:48], "app.aqond.com"]
    return ["ลองฟรีวันนี้", "app.aqond.com"]


def create_reel_end_background(
    output_path: Path,
    *,
    scenario: str = "",
    visual: str = "",
    logger: logging.Logger | None = None,
) -> bool:
    """ฉาก 5 — พื้นหลัง gradient สะอาด (ไม่ gen AI — โลโก้+QR วางทับทีหลัง)"""
    log = logger or logging.getLogger("flow2_compose")
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return False

    w, h = 1080, 1920
    img = Image.new("RGB", (w, h))
    draw = ImageDraw.Draw(img)
    # โทนน้ำเงิน-เทา premium (ไม่ให้ SD วาด QR/ข้อความปลอม)
    top = (18, 32, 72)
    bottom = (8, 14, 28)
    for y in range(h):
        t = y / max(h - 1, 1)
        color = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        draw.line([(0, y), (w, y)], fill=color)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, format="PNG", optimize=True)
    log.info("[Flow2] End scene background (no AI) scenario=%s", scenario or visual[:40])
    return output_path.is_file()


def compose_reel_end_scene(
    image_path: Path,
    *,
    vo: str = "",
    topic: str = "",
    logger: logging.Logger | None = None,
) -> dict[str, Any]:
    """ฉาก 5 — วางโลโก้ + QR ไฟล์จริงจาก Flow 1 (ไม่ให้ AI วาด)"""
    log = logger or logging.getLogger("flow2_compose")
    meta: dict[str, Any] = {"watermark": False, "qr": False, "text_overlay": False}

    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        meta["skipped"] = "no_pillow"
        return meta

    path = Path(image_path)
    if not path.is_file():
        meta["skipped"] = "no_image"
        return meta

    wm_path = get_watermark_path()
    qr_path = get_qr_path()
    if not wm_path and not qr_path:
        meta["skipped"] = "no_assets"
        log.info("[Flow2] End scene: no watermark/QR files — skip compose")
        return meta

    try:
        img = Image.open(path).convert("RGBA")
    except OSError:
        meta["skipped"] = "read_error"
        return meta

    w, h = img.size
    layout = REEL_END_LAYOUT
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    if wm_path:
        try:
            logo_img = Image.open(wm_path).convert("RGBA")
            _paste_logo_watermark(
                overlay, logo_img, w, h, layout["watermark"], opacity=0.92
            )
            meta["watermark"] = True
        except OSError:
            meta["watermark_skipped"] = "read_error"

    lines = _end_cta_lines(vo, topic)
    font_path = _find_thai_font()
    sizes = [max(28, w // 22), max(22, w // 28)]
    fonts = []
    for sz in sizes[: len(lines)]:
        try:
            fonts.append(
                ImageFont.truetype(str(font_path), sz) if font_path else ImageFont.load_default()
            )
        except OSError:
            fonts.append(ImageFont.load_default())
    while len(fonts) < len(lines):
        fonts.append(fonts[-1] if fonts else ImageFont.load_default())
    _draw_text_panel(draw, overlay, lines, fonts, w, h, layout["text"])
    meta["text_overlay"] = True
    meta["text_lines"] = lines

    if qr_path:
        if _paste_uploaded_qr(overlay, draw, qr_path, w, h, layout["qr"]):
            meta["qr"] = True
            meta["qr_source"] = "flow1_file"
        else:
            meta["qr_skipped"] = "read_error"

    out = Image.alpha_composite(img, overlay).convert("RGB")
    out.save(path, format="PNG", optimize=True)
    log.info("[Flow2] End scene composed wm=%s qr=%s text=%s", meta["watermark"], meta["qr"], lines)
    return meta


def apply_reel_watermark(
    video_path: Path,
    logger: logging.Logger | None = None,
    opacity: float = WM_OPACITY,
    size_ratio: float = WM_SIZE_RATIO,
    margin_x: int = WM_MARGIN_X,
    margin_y: int = WM_MARGIN_Y,
) -> dict[str, Any]:
    log = logger or logging.getLogger("flow2_compose")
    meta: dict[str, Any] = {"watermark": False}
    wm = get_watermark_path()
    if not wm or not video_path.is_file():
        meta["watermark_skipped"] = "no_file"
        return meta

    tmp = video_path.parent / f"_wm_{video_path.name}"
    ratio = max(0.05, min(size_ratio, 0.2))
    # scale2ref: ย่อโลโก้ตามความกว้างวิดีโอ แล้ววางมุมขวาบน
    vf = (
        f"[1:v][0:v]scale2ref=w=iw*{ratio}:h=-1[wm][base];"
        f"[wm]format=rgba,colorchannelmixer=aa={opacity}[wma];"
        f"[base][wma]overlay=W-w-{margin_x}:{margin_y}"
    )
    meta["watermark_layout"] = {
        "anchor": "top-right",
        "size_ratio": ratio,
        "margin_x": margin_x,
        "margin_y": margin_y,
        "opacity": opacity,
    }
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-i", str(wm),
        "-filter_complex", vf,
        "-c:a", "copy",
        "-movflags", "+faststart",
        str(tmp),
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=300)
        if r.returncode == 0 and tmp.is_file() and tmp.stat().st_size > 1000:
            tmp.replace(video_path)
            meta["watermark"] = True
            log.info("[Flow2] Watermark applied to reel")
        else:
            meta["watermark_skipped"] = "ffmpeg_error"
            tmp.unlink(missing_ok=True)
            log.warning("[Flow2] watermark ffmpeg failed: %s", (r.stderr or b"")[-200:])
    except Exception as e:
        meta["watermark_skipped"] = str(e)
        tmp.unlink(missing_ok=True)
    return meta
