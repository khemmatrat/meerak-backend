"""
Parse Minnie scripts into shot-level specs for multi-clip Grok generation.

Supports:
- Time markers: [0-8s], [8-16s] (spaces allowed inside brackets)
- Markdown headers: ### [0-8s] — HOOK
- Shot labels: Shot 1 (Hook): [0-8s] - ...
- Multi-line blocks: marker line then body until the next marker
- Visual vs VO: lines labeled Visual / B-roll / ภาพ / VO / Voiceover, or "ภาพ... + VO: ..."
- [FRAME: ...] hints (applied to the current shot when present)
"""

from __future__ import annotations

import re
from typing import Any


_BLOCK_ORDER = ("hook", "value", "proof", "cta")

# Between start/end seconds: ASCII hyphen plus common Unicode dash/minus variants
# (Word/Google Docs paste often uses U+2010/U+2011; some locales use U+2212 minus sign)
_TIME_DASH = r"[-\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE63\uFF0D]"

# Shot headers — allow emoji / labels before the first [Xs-Ys] on the same line, e.g.
# ## 🟣 [0–8s] — HOOK | ** [8–16s] — PROBLEM ** | Shot 1: [0-8s]
_SHOT_HEADER_RE = re.compile(
    r"^\s*(?:#{1,6}\s*)?"
    r"(?:(?:Shot\s*\d+)\s*(?:\([^)]*\))?\s*[:：]\s*)?"
    r"(?:\*\*)?"
    r"[^\[\r\n]*?"  # emoji (🟣🔵…), bold markers, labels — up to first [
    rf"\[(\d+)\s*{_TIME_DASH}\s*(\d+)\s*s\]"
    r"(?:\*\*)?"
    rf"\s*(?:[—\-–\u2013\u2014]\s*)?(.*)$",
    re.IGNORECASE,
)

_VISUAL_LINE_RE = re.compile(
    r"^\s*(?:🎥\s*)?(?:\*\*)?\*?\s*(?:Scene|Visual|B[- ]?roll|ภาพ|Direction)\s*[:：]\s*(.*)$",
    re.IGNORECASE,
)
_VO_LINE_RE = re.compile(
    r"^\s*(?:\*\*)?\s*(?:🎙️\s*)?"
    r"(?:VO|Voice\s*over|Voice-over|Narration|On[- ]?screen)"
    r"(?:\s*\([^)]{0,400}\))?\s*[:：]\s*(.*)$",
    re.IGNORECASE,
)

# Normalize [0–8s] / [0−8s] (various Unicode dashes) → [0-8s] so one code path matches.
_BRACKET_TIME_RANGE_RE = re.compile(
    r"\[(\d+)\s*[-\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE63\uFF0D]+\s*(\d+)\s*s\]",
    re.IGNORECASE,
)


def _normalize_segmentation_input(script_md: str) -> str:
    if not (script_md or "").strip():
        return script_md
    s = script_md.replace("\r\n", "\n")
    s = s.replace("\uff3b", "[").replace("\uff3d", "]")
    return _BRACKET_TIME_RANGE_RE.sub(lambda m: f"[{m.group(1)}-{m.group(2)}s]", s)


def _strip_markdown_noise(text: str) -> str:
    if not (text or "").strip():
        return ""
    s = text.replace("\r\n", "\n")
    lines: list[str] = []
    for raw in s.split("\n"):
        line = raw.strip()
        line = re.sub(r"^#{1,6}\s+", "", line)
        line = re.sub(r"^>\s?", "", line)
        line = re.sub(r"\*\*([^*]+)\*\*", r"\1", line)
        line = re.sub(r"\*([^*]+)\*", r"\1", line)
        line = line.strip()
        if line:
            lines.append(line)
    return "\n".join(lines).strip()


def _infer_block_from_tail(tail: str) -> str | None:
    u = tail.strip().upper()
    if not u or len(u) > 48:
        return None
    if "HOOK" in u:
        return "hook"
    if "PROBLEM" in u or "PAIN" in u:
        return "value"
    if "SOLUTION" in u or "VALUE" in u:
        return "value"
    if "PROOF" in u or "SOCIAL" in u:
        return "proof"
    if "CTA" in u or "CALL" in u:
        return "cta"
    return None


def _split_visual_voice(body: str) -> tuple[str, str]:
    """
    Split body into (visual_prompt, voiceover).
    Prefers explicit labels; falls back to '... + VO:' inline patterns.
    Blockquote lines (> ...) are treated as voiceover (VO).
    Italic / bracket scene cues *...* / *[...]* contribute to visual when not in VO.
    """
    raw = (body or "").replace("\r\n", "\n")
    vo_block_lines: list[str] = []
    non_quote: list[str] = []
    for line in raw.split("\n"):
        if re.match(r"^\s*>\s*", line):
            inner = re.sub(r"^\s*>\s*", "", line).strip()
            inner = re.sub(r"^\*+|\*+$", "", inner).strip()
            vo_block_lines.append(inner)
        else:
            non_quote.append(line)
    t = _strip_markdown_noise("\n".join(non_quote))
    vo_block_lines = [x for x in vo_block_lines if x]

    if not t and not vo_block_lines:
        return "", ""

    visual_lines: list[str] = []
    vo_lines: list[str] = list(vo_block_lines)
    pending_visual = True

    for line in t.split("\n"):
        vm = _VISUAL_LINE_RE.match(line)
        if vm:
            visual_lines.append(vm.group(1).strip())
            pending_visual = True
            continue
        nm = _VO_LINE_RE.match(line)
        if nm:
            vo_lines.append(nm.group(1).strip())
            pending_visual = False
            continue
        if re.match(r"^\s*[-*+]\s+", line):
            line = re.sub(r"^\s*[-*+]\s+", "", line).strip()
        if pending_visual or not vo_lines:
            if re.search(r"\bVO\s*:\s*", line, re.I):
                parts = re.split(r"\bVO\s*:\s*", line, maxsplit=1, flags=re.I)
                visual_lines.append(parts[0].strip().strip("+- "))
                if len(parts) > 1:
                    vo_lines.append(parts[1].strip())
                pending_visual = False
                continue
            if "+" in line and re.search(r"\+\s*VO\s*:", line, re.I):
                m = re.search(r"(.+?)\s*\+\s*VO\s*:\s*(.+)", line, re.I)
                if m:
                    visual_lines.append(m.group(1).strip())
                    vo_lines.append(m.group(2).strip())
                    pending_visual = False
                    continue
            visual_lines.append(line)
        else:
            vo_lines.append(line)

    visual = "\n".join(x for x in visual_lines if x).strip()
    voice = "\n".join(x for x in vo_lines if x).strip()

    if not voice and visual:
        m = re.search(r"\bVO\s*:\s*(.+)$", visual, re.I | re.DOTALL)
        if m:
            voice = m.group(1).strip()
            visual = visual[: m.start()].strip()
            visual = re.sub(r"\s*\+\s*$", "", visual).strip()

    if not visual and voice:
        visual = voice

    # *[...]* / *Scene: ...* — เติม visual ถ้ายังว่าง
    if not (visual or "").strip():
        mvb = re.findall(r"\*([^*]{2,2000})\*", body)
        for chunk in mvb:
            c = chunk.strip()
            if "[" in c or re.search(r"\bScene\b", c, re.I) or len(c) > 15:
                visual = (visual + "\n" + c).strip() if visual else c
                break

    return visual, voice


def _shot_description_combined(visual: str, voice: str) -> str:
    v = (visual or "").strip()
    o = (voice or "").strip()
    if v and o:
        return f"{v}\n\nVO: {o}"
    return v or o or "Scene"


def _line_starts_shot(line: str) -> bool:
    return bool(_SHOT_HEADER_RE.match(line.strip()))


def _parse_shot_header(line: str) -> tuple[int, int, str] | None:
    m = _SHOT_HEADER_RE.match(line.strip())
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), (m.group(3) or "").strip()


def _detect_section_block(line: str) -> str | None:
    u = line.strip().upper()
    if u.startswith("## HOOK") or ("HOOK" in u and line.strip().startswith("#")):
        return "hook"
    if "VALUE" in u and line.strip().startswith("#"):
        return "value"
    if "PROOF" in u or "SOCIAL" in u:
        if line.strip().startswith("#"):
            return "proof"
    if "CTA" in u and line.strip().startswith("#"):
        return "cta"
    if "PRODUCT" in u and line.strip().startswith("#"):
        return "value"
    return None


def _parse_multiline_blocks(script_md: str) -> list[dict[str, Any]]:
    lines = script_md.splitlines()
    shots: list[dict[str, Any]] = []
    frame_hints: list[str] = []
    current_block = "value"
    i = 0
    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip()
        nb = _detect_section_block(line)
        if nb:
            current_block = nb

        fm = re.search(r"\[FRAME:\s*([^\]]+)\]", line, re.IGNORECASE)
        if fm:
            frame_hints.append(fm.group(1).strip()[:500])

        hdr = _parse_shot_header(line)
        if hdr:
            start, end, tail = hdr
            ib = _infer_block_from_tail(tail)
            if ib:
                current_block = ib

            # Always collect lines until the next shot header. The old "_tail_is_substantial"
            # shortcut (body = tail only) skipped multi-line **SCENE:** / VO blocks and could
            # leave following ## [Xs-Ys] lines unmatched, collapsing the script to one shot.
            i += 1
            chunk: list[str] = []
            while i < len(lines):
                if _line_starts_shot(lines[i]):
                    break
                chunk.append(lines[i])
                i += 1
            body = "\n".join(chunk).strip()
            if tail and not body:
                body = tail
            elif tail and body:
                if not (_infer_block_from_tail(tail) and len(tail) < 48):
                    body = tail + "\n" + body

            visual, voice = _split_visual_voice(body)
            if not visual and not voice:
                visual = _strip_markdown_noise(body)
            desc = _shot_description_combined(visual, voice)
            dur = max(3, min(15, end - start))
            fh = frame_hints[-1] if frame_hints else ""
            shots.append(
                {
                    "index": len(shots),
                    "start_sec": start,
                    "end_sec": end,
                    "duration_sec": dur,
                    "description": desc[:2000],
                    "visual_prompt": (visual or desc)[:2000],
                    "voiceover": voice[:2000],
                    "frame_hint": fh,
                    "block": current_block,
                }
            )
            continue
        i += 1
    return shots


def segment_script_to_shots(script_md: str) -> list[dict[str, Any]]:
    """
    Returns shot dicts:
      index, start_sec, end_sec, duration_sec,
      description (combined), visual_prompt, voiceover,
      frame_hint, block
    """
    if not (script_md or "").strip():
        return []

    script_md = _normalize_segmentation_input(script_md)
    shots = _parse_multiline_blocks(script_md)
    if shots:
        for i, s in enumerate(shots):
            s["index"] = i
        return shots

    # --- Legacy: single-line [Xs-Ys] markers ---
    shots = []
    current_block = "value"
    frame_hints: list[str] = []

    for raw in script_md.splitlines():
        line = raw.strip()
        nb = _detect_section_block(line)
        if nb:
            current_block = nb

        fm = re.search(r"\[FRAME:\s*([^\]]+)\]", line, re.IGNORECASE)
        if fm:
            frame_hints.append(fm.group(1).strip()[:500])

        m = re.search(
            rf"[^\[]*?\[(\d+)\s*{_TIME_DASH}\s*(\d+)\s*s\]\s*\*?\*?\s*(.+)",
            line,
            re.IGNORECASE,
        )
        if not m:
            m = re.search(
                rf"[^\[]*?\*\*\[(\d+)\s*{_TIME_DASH}\s*(\d+)\s*s\]\*\*\s*(.+)",
                line,
                re.IGNORECASE,
            )
        if m:
            start, end = int(m.group(1)), int(m.group(2))
            desc = m.group(3).strip()
            desc = re.sub(r"^\*+", "", desc)
            desc = re.sub(r"\*+$", "", desc).strip()
            if desc.startswith('"') and desc.endswith('"'):
                desc = desc[1:-1].strip()
            dur = max(3, min(15, end - start))
            fh = frame_hints[-1] if frame_hints else ""
            visual, voice = _split_visual_voice(desc)
            if not visual and not voice:
                visual = _strip_markdown_noise(desc)
            desc_c = _shot_description_combined(visual, voice)
            shots.append(
                {
                    "index": len(shots),
                    "start_sec": start,
                    "end_sec": end,
                    "duration_sec": dur,
                    "description": desc_c[:2000],
                    "visual_prompt": (visual or desc_c)[:2000],
                    "voiceover": voice[:2000],
                    "frame_hint": fh,
                    "block": current_block,
                }
            )

    if not shots:
        for line in script_md.splitlines():
            if re.match(r"^\d+\.\s+\*\*", line):
                desc = line.split("**")[-1].strip()[:1200]
                visual, voice = _split_visual_voice(desc)
                desc_c = _shot_description_combined(visual, voice)
                shots.append(
                    {
                        "index": len(shots),
                        "start_sec": 0,
                        "end_sec": 8,
                        "duration_sec": 8,
                        "description": desc_c,
                        "visual_prompt": visual or desc_c,
                        "voiceover": voice,
                        "frame_hint": "",
                        "block": current_block,
                    }
                )

    if not shots:
        shots.append(
            {
                "index": 0,
                "start_sec": 0,
                "end_sec": 10,
                "duration_sec": 10,
                "description": (script_md[:400] or "Advertisement scene").strip(),
                "visual_prompt": (script_md[:400] or "Advertisement scene").strip(),
                "voiceover": "",
                "frame_hint": "",
                "block": "hook",
            }
        )

    for i, s in enumerate(shots):
        s["index"] = i
    return shots


def shots_for_generation(
    script_md: str,
    *,
    target_count: int = 0,
    max_shots: int = 10,
) -> list[dict[str, Any]]:
    """
    Segment script and trim/pad to target_count (4/6/8) when set.
    If target_count is 1 but the script clearly defines 2+ time windows, ignore 1 —
    that usually means the UI default was left on "1" by mistake.
    """
    base = segment_script_to_shots(script_md)
    if not base:
        return []

    soft_cap = max(1, min(max_shots, 12))
    if target_count == 1 and len(base) > 1:
        target_count = 0

    if target_count and target_count > 0:
        # Env max_shots must not cap below an explicit UI target (e.g. MAX_GROK_SCENES=1 vs "4 shots").
        n = min(12, max(soft_cap, target_count))
        if len(base) >= n:
            return base[:n]
        out = list(base)
        while len(out) < n and len(out) < 12:
            last = dict(out[-1])
            last["index"] = len(out)
            last["description"] = (last.get("description") or "") + " (continuation)"
            vp = last.get("visual_prompt") or ""
            last["visual_prompt"] = vp + " (continuation)"
            out.append(last)
        return out[:n]

    # Auto (target_count 0): use every segment the parser found — do not truncate to MAX_GROK_SCENES.
    return base[: min(len(base), 12)]


def scene_descriptions_for_ui(script_md: str) -> list[str]:
    """One display line per shot for storyboard cards (aligned with segment_script_to_shots)."""
    specs = segment_script_to_shots(script_md)
    out: list[str] = []
    for s in specs:
        d = (s.get("description") or "").strip()
        if not d:
            d = (s.get("visual_prompt") or "Scene").strip()
        out.append(d[:900])
    return out


def gather_voiceover_text_for_tts(script_md: str) -> str:
    """
    Plain narration for Grok TTS / master assembly: VO lines per shot only (no ## headers, **SCENE:**).
    Grok Video clips ไม่มีเสียงพากย์จากบท — TTS ใช้ข้อความนี้แทนการส่งทั้ง script_md.
    """
    specs = segment_script_to_shots(script_md or "")
    parts: list[str] = []
    for s in specs:
        vo = (s.get("voiceover") or "").strip()
        if vo:
            parts.append(vo)
    if parts:
        return "\n".join(parts).strip()[:16000]
    return (_strip_markdown_noise(script_md or "") or "").strip()[:16000]
