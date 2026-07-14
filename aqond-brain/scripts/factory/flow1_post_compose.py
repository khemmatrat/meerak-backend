"""จัด layout โพสต์ Flow 1 — วางลายน้ำ / QR ไฟล์จริง / ข้อความ หลัง generate ภาพเท่านั้น"""

from __future__ import annotations

import copy
import json
import logging
import re
import textwrap
from pathlib import Path
from typing import Any

STUDIO_DIR = Path(__file__).resolve().parent.parent.parent / "output" / "media_studio"
FLOW1_DIR = STUDIO_DIR / "flow1"
WATERMARK_FILE = FLOW1_DIR / "watermark.png"
QR_FILE = FLOW1_DIR / "qr.png"
LAYOUT_FILE = FLOW1_DIR / "compose_layout.json"

TEXT_BLUE = (79, 70, 229)
TEXT_PURPLE = (124, 58, 237)
MAX_TEXT_LINES = 8

VALID_ANCHORS = frozenset({
    "top-left", "top-center", "top-right",
    "center",
    "bottom-left", "bottom-center", "bottom-right",
})

DEFAULT_LAYOUT: dict[str, dict[str, float | str]] = {
    "text": {"anchor": "bottom-left", "x_pct": 4.0, "y_pct": 96.0},
    "watermark": {"anchor": "top-right", "x_pct": 96.0, "y_pct": 4.0, "size_pct": 13.0},
    "qr": {"anchor": "bottom-right", "x_pct": 96.0, "y_pct": 96.0, "size_pct": 17.0},
}


def _find_thai_font() -> Path | None:
    for p in (
        Path(r"C:\Windows\Fonts\LeelawUI.ttf"),
        Path(r"C:\Windows\Fonts\Tahoma.ttf"),
        Path(r"C:\Windows\Fonts\arial.ttf"),
    ):
        if p.is_file():
            return p
    return None


def get_watermark_path() -> Path | None:
    if WATERMARK_FILE.is_file() and WATERMARK_FILE.stat().st_size > 100:
        return WATERMARK_FILE
    return None


def get_qr_path() -> Path | None:
    if QR_FILE.is_file() and QR_FILE.stat().st_size > 100:
        return QR_FILE
    return None


def save_watermark(data: bytes) -> Path:
    FLOW1_DIR.mkdir(parents=True, exist_ok=True)
    WATERMARK_FILE.write_bytes(data)
    return WATERMARK_FILE


def save_qr(data: bytes) -> Path:
    FLOW1_DIR.mkdir(parents=True, exist_ok=True)
    QR_FILE.write_bytes(data)
    return QR_FILE


def _float(v: Any, default: float) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _merge_layout_block(raw: dict[str, Any] | None, defaults: dict[str, Any]) -> dict[str, Any]:
    src = raw or {}
    anchor = str(src.get("anchor") or defaults["anchor"])
    if anchor not in VALID_ANCHORS:
        anchor = str(defaults["anchor"])
    out: dict[str, Any] = {
        "anchor": anchor,
        "x_pct": max(0.0, min(100.0, _float(src.get("x_pct"), float(defaults["x_pct"])))),
        "y_pct": max(0.0, min(100.0, _float(src.get("y_pct"), float(defaults["y_pct"])))),
    }
    if "size_pct" in defaults:
        out["size_pct"] = max(5.0, min(40.0, _float(src.get("size_pct"), float(defaults["size_pct"]))))
    return out


def load_layout() -> dict[str, dict[str, Any]]:
    layout = copy.deepcopy(DEFAULT_LAYOUT)
    if LAYOUT_FILE.is_file():
        try:
            saved = json.loads(LAYOUT_FILE.read_text(encoding="utf-8"))
            if isinstance(saved, dict):
                for key in layout:
                    if key in saved and isinstance(saved[key], dict):
                        layout[key] = _merge_layout_block(saved[key], layout[key])
        except (OSError, json.JSONDecodeError):
            pass
    return layout


def save_layout(data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    merged = load_layout()
    for key in DEFAULT_LAYOUT:
        if key in data and isinstance(data[key], dict):
            merged[key] = _merge_layout_block(data[key], merged[key])
    FLOW1_DIR.mkdir(parents=True, exist_ok=True)
    LAYOUT_FILE.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    return merged


def parse_compose_options(raw: dict[str, Any] | None) -> dict[str, Any]:
    opts = raw or {}
    legacy = opts.get("image_text_mode") or opts.get("image_text")
    legacy_text = legacy == "with_text" or legacy in ("1", "true", "yes")

    def _bool(key: str, default: bool = False) -> bool:
        if key not in opts and key + "_enabled" not in opts:
            return default
        v = opts.get(key, opts.get(key + "_enabled"))
        if isinstance(v, bool):
            return v
        return str(v).lower() in ("1", "true", "yes", "on")

    layout = load_layout()
    if isinstance(opts.get("layout"), dict):
        for key in layout:
            if key in opts["layout"] and isinstance(opts["layout"][key], dict):
                layout[key] = _merge_layout_block(opts["layout"][key], layout[key])

    attach_text = _bool("attach_text", legacy_text)
    return {
        "attach_watermark": _bool("attach_watermark", False),
        "attach_qr": _bool("attach_qr", False),
        "attach_text": attach_text,
        "overlay_text": str(opts.get("overlay_text") or opts.get("image_overlay_text") or ""),
        "layout": layout,
    }


def needs_overlay_space(opts: dict[str, Any]) -> bool:
    return bool(
        opts.get("attach_watermark")
        or opts.get("attach_qr")
        or opts.get("attach_text")
    )


def _lines_from_overlay_text(text: str) -> list[str]:
    """แยกบรรทัดตาม Enter ที่ผู้ใช้กด — ไม่ตัดรวมเป็นบรรทัดเดียว"""
    lines = [ln.strip() for ln in re.split(r"\r?\n", text) if ln.strip()]
    return [ln[:80] for ln in lines[:MAX_TEXT_LINES]]


def _marketing_lines(brief: str, headline: str = "") -> list[str]:
    raw = (headline or brief or "").strip()
    if not raw:
        return ["AQOND", "app.aqond.com", "ลองฟรีวันนี้"]
    if "\n" in raw:
        return _lines_from_overlay_text(raw)
    for sep in (".", "!", "?", "。"):
        raw = raw.replace(sep, "\n")
    if "\n" in raw:
        return _lines_from_overlay_text(raw)
    wrapped = textwrap.wrap(raw, width=24)
    return [w[:80] for w in wrapped[:MAX_TEXT_LINES]]


def _lerp_color(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def _anchor_origin(w: int, h: int, ew: int, eh: int, anchor: str, x_pct: float, y_pct: float) -> tuple[int, int]:
    """จุดอ้างอิง (x_pct, y_pct) บนภาพ → มุมบนซ้ายของกล่อง overlay"""
    px = int(w * x_pct / 100.0)
    py = int(h * y_pct / 100.0)
    if anchor == "top-left":
        return px, py
    if anchor == "top-center":
        return px - ew // 2, py
    if anchor == "top-right":
        return px - ew, py
    if anchor == "center":
        return px - ew // 2, py - eh // 2
    if anchor == "bottom-left":
        return px, py - eh
    if anchor == "bottom-center":
        return px - ew // 2, py - eh
    if anchor == "bottom-right":
        return px - ew, py - eh
    return px, py - eh


def _clamp_origin(x: int, y: int, ew: int, eh: int, w: int, h: int) -> tuple[int, int]:
    x = max(0, min(x, w - ew))
    y = max(0, min(y, h - eh))
    return x, y


def _paste_logo_watermark(
    base: Any,
    logo: Any,
    w: int,
    h: int,
    placement: dict[str, Any],
    opacity: float = 0.38,
) -> None:
    from PIL import Image

    size_pct = float(placement.get("size_pct", 13.0))
    target = max(48, int(w * size_pct / 100.0))
    ratio = target / max(logo.width, logo.height)
    logo_r = logo.resize((int(logo.width * ratio), int(logo.height * ratio)), Image.Resampling.LANCZOS)
    if logo_r.mode != "RGBA":
        logo_r = logo_r.convert("RGBA")
    alpha = logo_r.split()[3].point(lambda p: int(p * opacity))
    logo_r.putalpha(alpha)
    x0, y0 = _anchor_origin(
        w, h, logo_r.width, logo_r.height,
        str(placement.get("anchor", "top-right")),
        float(placement.get("x_pct", 96)),
        float(placement.get("y_pct", 4)),
    )
    x0, y0 = _clamp_origin(x0, y0, logo_r.width, logo_r.height, w, h)
    base.paste(logo_r, (x0, y0), logo_r)


def _measure_text_block(draw: Any, lines: list[str], fonts: list[Any]) -> tuple[int, int, list[int], list[int]]:
    pad_x, pad_y = 18, 14
    line_gap = 6
    text_heights: list[int] = []
    text_widths: list[int] = []
    for i, line in enumerate(lines):
        f = fonts[min(i, len(fonts) - 1)]
        bbox = draw.textbbox((0, 0), line, font=f)
        text_heights.append(bbox[3] - bbox[1])
        text_widths.append(bbox[2] - bbox[0])
    block_w = max(text_widths) + pad_x * 2
    block_h = sum(text_heights) + line_gap * (len(lines) - 1) + pad_y * 2
    return block_w, block_h, text_heights, text_widths


def _draw_text_panel(
    draw: Any,
    overlay: Any,
    lines: list[str],
    fonts: list[Any],
    w: int,
    h: int,
    placement: dict[str, Any],
) -> None:
    from PIL import ImageDraw

    pad_x, pad_y = 18, 14
    line_gap = 6
    block_w, block_h, text_heights, _ = _measure_text_block(draw, lines, fonts)
    x0, y0 = _anchor_origin(
        w, h, block_w, block_h,
        str(placement.get("anchor", "bottom-left")),
        float(placement.get("x_pct", 4)),
        float(placement.get("y_pct", 96)),
    )
    x0, y0 = _clamp_origin(x0, y0, block_w, block_h, w, h)
    x1 = x0 + block_w
    y1 = y0 + block_h
    radius = max(12, int(w * 0.025))

    panel = ImageDraw.Draw(overlay)
    panel.rounded_rectangle((x0, y0, x1, y1), radius=radius, fill=(255, 255, 255, 215))

    y = y0 + pad_y
    for i, line in enumerate(lines):
        f = fonts[min(i, len(fonts) - 1)]
        th = text_heights[i]
        x = x0 + pad_x
        t = i / max(1, len(lines) - 1)
        color = _lerp_color(TEXT_BLUE, TEXT_PURPLE, t)
        draw.text((x, y), line, font=f, fill=color + (255,))
        y += th + line_gap


def _paste_uploaded_qr(
    overlay: Any,
    draw: Any,
    qr_path: Path,
    w: int,
    h: int,
    placement: dict[str, Any],
) -> bool:
    from PIL import Image

    try:
        qr_src = Image.open(qr_path).convert("RGBA")
    except OSError:
        return False

    size_pct = float(placement.get("size_pct", 17.0))
    qr_size = max(72, int(w * size_pct / 100.0))
    qr_fit = qr_src.copy()
    qr_fit.thumbnail((qr_size, qr_size), Image.Resampling.LANCZOS)

    pad = 8
    badge_w = qr_fit.width + pad * 2
    badge_h = qr_fit.height + pad * 2
    x0, y0 = _anchor_origin(
        w, h, badge_w, badge_h,
        str(placement.get("anchor", "bottom-right")),
        float(placement.get("x_pct", 96)),
        float(placement.get("y_pct", 96)),
    )
    x0, y0 = _clamp_origin(x0, y0, badge_w, badge_h, w, h)
    draw.rounded_rectangle(
        (x0, y0, x0 + badge_w, y0 + badge_h),
        radius=max(10, int(w * 0.02)),
        fill=(255, 255, 255, 235),
    )
    overlay.paste(qr_fit, (x0 + pad, y0 + pad), qr_fit)
    return True


def compose_flow1_post(
    image_path: Path,
    *,
    brief: str = "",
    headline: str = "",
    compose_options: dict[str, Any] | None = None,
    logger: logging.Logger | None = None,
) -> dict[str, Any]:
    log = logger or logging.getLogger("flow1_compose")
    opts = parse_compose_options(compose_options or {})
    layout = opts.get("layout") or load_layout()
    meta: dict[str, Any] = {
        "watermark": False,
        "text_overlay": False,
        "qr": False,
        "compose_options": opts,
        "layout_used": layout,
    }

    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        log.warning("Pillow not installed — skip compose")
        return meta

    path = Path(image_path)
    if not path.is_file():
        return meta

    try:
        img = Image.open(path).convert("RGBA")
    except OSError:
        return meta

    w, h = img.size
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    if opts.get("attach_watermark"):
        wm_path = get_watermark_path()
        if wm_path:
            try:
                logo_img = Image.open(wm_path).convert("RGBA")
                _paste_logo_watermark(overlay, logo_img, w, h, layout.get("watermark", DEFAULT_LAYOUT["watermark"]))
                meta["watermark"] = True
            except OSError:
                meta["watermark_skipped"] = "read_error"
                log.warning("[Flow1] watermark file unreadable")
        else:
            meta["watermark_skipped"] = "no_file"
            log.warning("[Flow1] attach_watermark on but no watermark uploaded")

    if opts.get("attach_text"):
        overlay_text = opts.get("overlay_text") or ""
        if overlay_text.strip():
            lines = _lines_from_overlay_text(overlay_text)
        else:
            lines = _marketing_lines(brief, headline)
        font_path = _find_thai_font()
        sizes = [max(22, w // 28), max(18, w // 34), max(16, w // 38)]
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
        _draw_text_panel(draw, overlay, lines, fonts, w, h, layout.get("text", DEFAULT_LAYOUT["text"]))
        meta["text_overlay"] = True
        meta["text_lines"] = lines

    if opts.get("attach_qr"):
        qr_path = get_qr_path()
        if qr_path and _paste_uploaded_qr(overlay, draw, qr_path, w, h, layout.get("qr", DEFAULT_LAYOUT["qr"])):
            meta["qr"] = True
            meta["qr_source"] = "upload"
        else:
            meta["qr_skipped"] = "no_file"
            log.warning("[Flow1] attach_qr on but no QR image uploaded")

    out = Image.alpha_composite(img, overlay).convert("RGB")
    out.save(path, format="PNG", optimize=True)
    log.info(
        "[Flow1] Composed watermark=%s text=%s qr=%s",
        meta["watermark"],
        meta["text_overlay"],
        meta["qr"],
    )
    return meta
