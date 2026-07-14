"""Shared chat + upload context for all Media Studio flows."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from factory import media_db

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "output" / "media_studio" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def get_chat_context(flow_type: str | None = None, limit: int = 30) -> str:
    """Build text block from recent messages + upload summaries for AI prompts."""
    msgs = media_db.list_messages(limit=limit, flow_type=flow_type)
    uploads = media_db.list_uploads(limit=10)
    lines: list[str] = []
    if msgs:
        lines.append("=== บทสนทนากับผู้ใช้ ===")
        for m in msgs:
            role = m.get("role", "user")
            content = (m.get("content") or "").strip()
            if content:
                lines.append(f"[{role}]: {content}")
    if uploads:
        lines.append("\n=== ไฟล์ที่อัปโหลด (AI อ่านแล้ว) ===")
        for u in uploads:
            summary = (u.get("vision_summary") or "").strip()
            fname = u.get("filename", "")
            if summary:
                lines.append(f"- {fname}: {summary}")
            else:
                lines.append(f"- {fname}: (ยังไม่ได้วิเคราะห์)")
    return "\n".join(lines)


from factory.job_presets import preset_few_shot_block


def get_success_few_shot(flow_type: str, limit: int = 3) -> str:
    """Few-shot examples from success library for better generation."""
    rich = preset_few_shot_block(flow_type, limit=min(limit, 2))
    if rich:
        return rich

    examples = media_db.list_success_examples(flow_type=flow_type, limit=limit)
    if not examples:
        return ""
    lines = ["=== ตัวอย่างผลงานที่สำเร็จ (ใช้เป็นแนวทาง) ==="]
    for ex in examples:
        tags = ex.get("tags") or ex.get("tags_json") or []
        labels = ex.get("qwen_labels") or ex.get("qwen_labels_json") or {}
        if isinstance(tags, str):
            tags = [tags]
        tag_str = ", ".join(tags) if isinstance(tags, list) else str(tags)
        desc = labels.get("description", "") if isinstance(labels, dict) else str(labels)
        lines.append(f"- แท็ก: {tag_str} | {desc[:200]}")
    return "\n".join(lines)


def build_agent_prompt(
    flow_type: str,
    system_instruction: str,
    task: str,
    include_success: bool = True,
) -> str:
    parts = [system_instruction]
    ctx = get_chat_context(flow_type=flow_type)
    if ctx.strip():
        parts.append(ctx)
    if include_success:
        few = get_success_few_shot(flow_type)
        if few:
            parts.append(few)
    parts.append(f"\n=== งานปัจจุบัน ===\n{task}")
    return "\n\n".join(parts)


def save_user_message(content: str, flow_type: str | None = None) -> int:
    return media_db.add_message("user", content, flow_type)


def save_assistant_message(content: str, flow_type: str | None = None) -> int:
    return media_db.add_message("assistant", content, flow_type)
