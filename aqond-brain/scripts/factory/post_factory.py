"""
Flow 1 — Autonomous Post Generator
1:1 ad image + multi-platform copy (FB/IG/YT) + QC
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from factory import media_db, studio_context
from factory.hook_factory import load_env, setup_logger
from factory.flow1_post_compose import compose_flow1_post, needs_overlay_space, parse_compose_options
from factory.post_copy import generate_flow1_copy
from factory.post_image import generate_flow1_image
from factory.studio_trust import compute_flow1_qc, enrich_job_outputs

OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent / "output" / "media_studio" / "flow1"

FLOW1_THEMES = [
    {"id": "matchjob", "label": "MatchJob — ตรวจนายจ้างก่อนรับงาน"},
    {"id": "insurance", "label": "พรบ. / ประกัน — ส่วนลดในแอป"},
    {"id": "salary", "label": "เงินเดือน — ไม่โดนเบี้ยว"},
    {"id": "maid", "label": "แม่บ้าน / คนดูแล"},
    {"id": "driver", "label": "คนขับ / ขนส่ง"},
    {"id": "friend", "label": "เพื่อนร่วมงาน / ชุมชน"},
    {"id": "custom", "label": "กำหนดเองจากแชท"},
]


def _qc_score(copy: dict[str, str], has_image: bool, outputs: dict[str, Any] | None = None) -> float:
    if outputs:
        enrich_job_outputs("flow1", outputs, 0)
        return float(outputs.get("qc_score_computed") or compute_flow1_qc(outputs, has_image))
    score = 40.0
    if copy.get("facebook"):
        score += 15
    if copy.get("instagram"):
        score += 15
    if copy.get("headline"):
        score += 10
    if has_image:
        score += 20
    return min(100.0, score)


def run_flow1(
    topic: str = "",
    theme: str = "matchjob",
    user_brief: str = "",
    job_id: int | None = None,
    compose_options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    logger = setup_logger("post_factory")
    media_db.init_db()

    ctx = studio_context.build_agent_prompt(
        "flow1",
        "คุณคือ AI นักการตลาด AQOND Flow 1 (โพสต์ 1:1)",
        f"หัวข้อ: {topic or user_brief}\nธีม: {theme}",
    )

    # brief จากแชทสำคัญกว่า — ใช้เป็นหัวข้อหลัก
    brief = (user_brief or "").strip()
    if not topic:
        topic = brief[:120] if brief else "AQOND — app.aqond.com"
    if theme == "custom" and brief:
        topic = brief[:120]

    if job_id is None:
        job_id = media_db.create_job("flow1", topic=topic, theme=theme, user_brief=brief)

    try:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        slug = re.sub(r"[^\w\-]", "_", topic[:30])
        image_path = OUTPUT_DIR / f"POST_{job_id}_{slug}.png"

        opts = parse_compose_options(compose_options)
        copy = generate_flow1_copy(topic, theme, ctx, job_id, brief, logger)
        overlay_hint = opts.get("overlay_text") or brief or copy.get("headline", "") or topic

        img_meta = generate_flow1_image(
            topic=topic,
            theme=theme,
            job_id=job_id,
            output_path=image_path,
            chat_context=ctx,
            logger=logger,
            reserve_overlay_space=needs_overlay_space(opts),
            overlay_hint=overlay_hint,
        )
        ok_img = (
            image_path.is_file()
            and image_path.stat().st_size > 5000
            and img_meta.get("source") not in (None, "failed")
        )

        if ok_img and needs_overlay_space(opts):
            compose_meta = compose_flow1_post(
                image_path,
                brief=brief or topic,
                headline=copy.get("headline", ""),
                compose_options=opts,
                logger=logger,
            )
            img_meta.update(compose_meta)

        outputs = {
            "image_path": str(image_path) if ok_img else "",
            "copy": copy,
            "theme": theme,
            "platforms": ["facebook", "instagram", "youtube_short"],
            "image_meta": img_meta,
            "compose_options": opts,
        }
        qc = _qc_score(copy, ok_img, outputs)
        if img_meta.get("qwen_brief_len", 0) > 50 and qc < 100:
            qc = min(100.0, qc + 3)

        media_db.update_job(
            job_id,
            status="completed" if qc >= 60 else "qc_review",
            script_text=json.dumps(copy, ensure_ascii=False),
            outputs_json=outputs,
            qc_score=qc,
        )

        src = img_meta.get("source", "?")
        ref = img_meta.get("reference_used") or "-"
        studio_context.save_assistant_message(
            f"Flow1 โพสต์ '{topic[:40]}' QC={qc:.0f} | รูปจาก: {src} | อ้างอิง: {ref}",
            "flow1",
        )

        return {"ok": True, "job_id": job_id, "outputs": outputs, "qc_score": qc}
    except Exception as e:
        logger.exception("[Flow1] failed")
        media_db.update_job(job_id, status="failed", error=str(e))
        return {"ok": False, "job_id": job_id, "error": str(e)}


def list_themes() -> list[dict[str, str]]:
    return FLOW1_THEMES
