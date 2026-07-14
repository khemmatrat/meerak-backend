"""
AQOND Media Studio — 3 Flow tabs + shared chat + upload + Qwen vision
Port 8780: http://127.0.0.1:8780
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import sys
import uuid
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

AQOND_BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AQOND_BRAIN / "scripts"))

from factory.hook_factory import load_env as _load_dotenv

for _k, _v in _load_dotenv().items():
    os.environ.setdefault(_k, _v)

from factory import media_db, qwen_vision, studio_context, success_library
from factory.job_presets import get_preset_from_job
from factory.local_image import ping_local_image
from factory.studio_chat import reply as chat_reply
from factory.thomas_publisher import publish_photo, publish_status, publish_video
from factory.flow1_post_compose import get_qr_path, get_watermark_path, load_layout, save_layout, save_qr, save_watermark
from factory.post_factory import list_themes, run_flow1
from factory.reel_factory import (
    get_voice_sample_text,
    list_characters,
    list_scenarios,
    run_flow2,
    run_flow2_preview,
)
from factory.cinema_factory import list_acts, run_flow3, run_flow3_preview
from factory.tutorial_factory import list_topics as list_tutorial_topics, run_flow4
from factory.studio_trust import enrich_job_outputs, run_preflight

app = FastAPI(title="AQOND Media Studio")
log = logging.getLogger("media_studio")

STUDIO_DIR = AQOND_BRAIN / "output" / "media_studio"
UPLOAD_DIR = STUDIO_DIR / "uploads"
HTML_FILE = STUDIO_DIR / "studio.html"

for d in (STUDIO_DIR, UPLOAD_DIR, STUDIO_DIR / "flow1", STUDIO_DIR / "flow2", STUDIO_DIR / "flow3", STUDIO_DIR / "flow4"):
    d.mkdir(parents=True, exist_ok=True)

app.mount("/media", StaticFiles(directory=str(STUDIO_DIR)), name="media")
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

ALLOWED_UPLOAD = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm", ".mov", ".mkv"}
MAX_UPLOAD = 50 * 1024 * 1024


@app.on_event("startup")
def _startup() -> None:
    media_db.init_db()
    log.info("Media Studio ready — Qwen model: %s", qwen_vision.vision_model())


@app.get("/", response_class=HTMLResponse)
async def index() -> HTMLResponse:
    if not HTML_FILE.is_file():
        raise HTTPException(404, "studio.html not found — run setup")
    return HTMLResponse(HTML_FILE.read_text(encoding="utf-8"))


@app.get("/api/preflight")
async def preflight(flow: str = Query("flow2")) -> dict[str, Any]:
    return await asyncio.to_thread(run_preflight, flow)


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "ollama": qwen_vision.ping_ollama(),
        "local_image": ping_local_image(),
    }


@app.get("/api/chat/messages")
async def get_messages(flow: str | None = None, limit: int = 50) -> dict[str, Any]:
    return {"messages": media_db.list_messages(limit=limit, flow_type=flow)}


@app.post("/api/chat/send")
async def send_message(body: dict[str, Any]) -> dict[str, Any]:
    content = (body.get("message") or body.get("content") or "").strip()
    flow = body.get("flow_type") or body.get("flow")
    if not content:
        raise HTTPException(400, "message required")
    mid = studio_context.save_user_message(content, flow)
    answer = await asyncio.to_thread(chat_reply, content, flow)
    aid = studio_context.save_assistant_message(answer, flow)
    return {"ok": True, "id": mid, "reply_id": aid, "reply": answer}


@app.get("/api/uploads")
async def get_uploads() -> dict[str, Any]:
    items = media_db.list_uploads(limit=30)
    for u in items:
        p = Path(u.get("path", ""))
        if p.is_file():
            try:
                rel = p.relative_to(STUDIO_DIR)
                u["url"] = f"/media/{rel.as_posix()}"
            except ValueError:
                u["url"] = ""
    return {"uploads": items}


@app.post("/api/uploads")
async def upload_file(
    file: UploadFile = File(...),
    flow_type: str | None = Query(None),
) -> dict[str, Any]:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_UPLOAD:
        raise HTTPException(400, f"unsupported type: {ext}")

    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(400, "file too large (max 50MB)")

    fname = f"{uuid.uuid4().hex[:12]}{ext}"
    dest = UPLOAD_DIR / fname
    dest.write_bytes(data)

    labels = qwen_vision.analyze_media(dest, flow_type=flow_type or "shared")
    summary = labels.get("description", "") if isinstance(labels, dict) else str(labels)

    uid = media_db.add_upload(
        filename=file.filename or fname,
        path=str(dest),
        mime=file.content_type,
        flow_type=flow_type,
        vision_summary=summary[:2000],
    )

    studio_context.save_user_message(
        f"[อัปโหลด] {file.filename}: {summary[:300]}",
        flow_type,
    )

    return {
        "ok": True,
        "id": uid,
        "url": f"/uploads/{fname}",
        "vision": labels,
    }


@app.get("/api/flow1/meta")
async def flow1_meta() -> dict[str, Any]:
    wm = get_watermark_path()
    qr = get_qr_path()
    return {
        "themes": list_themes(),
        "watermark_url": "/media/flow1/watermark.png" if wm else None,
        "qr_url": "/media/flow1/qr.png" if qr else None,
        "layout": load_layout(),
    }


@app.get("/api/flow1/layout")
async def flow1_layout_get() -> dict[str, Any]:
    return {"ok": True, "layout": load_layout()}


@app.post("/api/flow1/layout")
async def flow1_layout_save(body: dict[str, Any]) -> dict[str, Any]:
    layout = save_layout(body.get("layout") or body)
    return {"ok": True, "layout": layout}


@app.get("/api/flow1/watermark")
async def flow1_watermark_get() -> dict[str, Any]:
    wm = get_watermark_path()
    if not wm:
        return {"ok": True, "url": None}
    return {"ok": True, "url": "/media/flow1/watermark.png"}


@app.post("/api/flow1/watermark")
async def flow1_watermark_upload(file: UploadFile = File(...)) -> dict[str, Any]:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in {".png", ".webp", ".jpg", ".jpeg"}:
        raise HTTPException(400, "ใช้ไฟล์ PNG/WebP/JPG โลโก้ลายน้ำเท่านั้น")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "ไฟล์ใหญ่เกิน 5MB")
    save_watermark(data)
    media_db.add_upload(
        filename=file.filename or "watermark.png",
        path=str(get_watermark_path()),
        mime=file.content_type,
        flow_type="flow1_watermark",
        vision_summary="Flow1 watermark logo",
    )
    return {"ok": True, "url": "/media/flow1/watermark.png"}


@app.get("/api/flow1/qr")
async def flow1_qr_get() -> dict[str, Any]:
    qr = get_qr_path()
    if not qr:
        return {"ok": True, "url": None}
    return {"ok": True, "url": "/media/flow1/qr.png"}


@app.post("/api/flow1/qr")
async def flow1_qr_upload(file: UploadFile = File(...)) -> dict[str, Any]:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in {".png", ".webp", ".jpg", ".jpeg"}:
        raise HTTPException(400, "ใช้ไฟล์ PNG/WebP/JPG สำหรับ QR เท่านั้น")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "ไฟล์ใหญ่เกิน 5MB")
    save_qr(data)
    media_db.add_upload(
        filename=file.filename or "qr.png",
        path=str(get_qr_path()),
        mime=file.content_type,
        flow_type="flow1_qr",
        vision_summary="Flow1 QR code image",
    )
    return {"ok": True, "url": "/media/flow1/qr.png"}


@app.post("/api/flow1/generate")
async def flow1_generate(body: dict[str, Any], bg: BackgroundTasks) -> dict[str, Any]:
    topic = body.get("topic", "")
    theme = body.get("theme", "matchjob")
    brief = body.get("user_brief", "") or body.get("message", "")
    compose_options = {
        "attach_watermark": body.get("attach_watermark"),
        "attach_qr": body.get("attach_qr"),
        "attach_text": body.get("attach_text"),
        "overlay_text": body.get("overlay_text") or body.get("image_overlay_text") or "",
        "layout": body.get("layout"),
        "image_text_mode": body.get("image_text_mode"),
    }

    job_id = media_db.create_job("flow1", topic=topic or brief, theme=theme, user_brief=brief)

    async def _run() -> None:
        await asyncio.to_thread(run_flow1, topic, theme, brief, job_id, compose_options)

    bg.add_task(_run)
    return {"ok": True, "job_id": job_id, "status": "running"}


@app.get("/api/flow2/meta")
async def flow2_meta() -> dict[str, Any]:
    wm = get_watermark_path()
    qr = get_qr_path()
    return {
        "scenarios": list_scenarios(),
        "characters": list_characters(),
        "voice_sample_text": get_voice_sample_text(),
        "watermark_url": "/media/flow1/watermark.png" if wm else None,
        "qr_url": "/media/flow1/qr.png" if qr else None,
        "end_scene_assets": bool(wm or qr),
    }


@app.get("/api/flow2/voice-preview")
async def flow2_voice_preview(character: str = Query("man")) -> FileResponse:
    """สร้างตัวอย่างเสียงพากย์ก่อนกดสร้าง Reel"""
    safe = "".join(c for c in character if c.isalnum() or c in "_-") or "man"
    preview_dir = STUDIO_DIR / "voice_previews"
    preview_dir.mkdir(parents=True, exist_ok=True)
    out = preview_dir / f"{safe}.mp3"
    sample = get_voice_sample_text()
    logger = setup_logger("voice_preview")
    if not out.is_file() or out.stat().st_size < 500:
        ok = await asyncio.to_thread(
            generate_voice_aqond_tts, sample, out, character, logger
        )
        if not ok:
            raise HTTPException(
                503,
                "TTS ไม่พร้อม — เปิด app_voice_api.py ที่พอร์ต 8000",
            )
    return FileResponse(out, media_type="audio/mpeg", filename=f"preview_{safe}.mp3")


def _preset_ids(body: dict[str, Any]) -> tuple[int | None, int | None]:
    preset_job_id: int | None = None
    success_id: int | None = None
    raw_job = body.get("preset_job_id") or body.get("source_job_id")
    raw_success = body.get("success_id")
    if raw_job is not None:
        try:
            preset_job_id = int(raw_job)
        except (TypeError, ValueError):
            pass
    if raw_success is not None:
        try:
            success_id = int(raw_success)
        except (TypeError, ValueError):
            pass
    return preset_job_id, success_id


@app.post("/api/flow2/preview")
async def flow2_preview(body: dict[str, Any], bg: BackgroundTasks) -> dict[str, Any]:
    topic = body.get("topic", "")
    scenario = body.get("scenario", "repair")
    brief = body.get("user_brief", "") or body.get("message", "")
    character = body.get("character") or "man"
    attach_subtitles = body.get("attach_subtitles", True)
    if isinstance(attach_subtitles, str):
        attach_subtitles = attach_subtitles.lower() not in ("0", "false", "no")
    preset_job_id, success_id = _preset_ids(body)

    job_id = media_db.create_job("flow2", topic=topic or brief, theme=scenario, user_brief=brief)

    async def _run() -> None:
        await asyncio.to_thread(
            run_flow2_preview,
            topic,
            scenario,
            brief,
            job_id,
            character,
            attach_subtitles,
            preset_job_id,
            success_id,
        )

    bg.add_task(_run)
    return {"ok": True, "job_id": job_id, "status": "running", "mode": "preview", "preset_job_id": preset_job_id, "success_id": success_id}


@app.post("/api/flow2/generate")
async def flow2_generate(body: dict[str, Any], bg: BackgroundTasks) -> dict[str, Any]:
    topic = body.get("topic", "")
    scenario = body.get("scenario", "repair")
    brief = body.get("user_brief", "") or body.get("message", "")
    character = body.get("character") or "man"
    attach_watermark = bool(body.get("attach_watermark"))
    attach_subtitles = body.get("attach_subtitles", True)
    if isinstance(attach_subtitles, str):
        attach_subtitles = attach_subtitles.lower() not in ("0", "false", "no")

    continue_job_id = body.get("continue_job_id") or body.get("preview_job_id")
    continue_preview = False
    preset_job_id, success_id = _preset_ids(body)
    job_id: int

    if continue_job_id:
        try:
            job_id = int(continue_job_id)
        except (TypeError, ValueError):
            raise HTTPException(400, "continue_job_id invalid")
        row = media_db.get_job(job_id)
        if not row or row.get("flow_type") != "flow2":
            raise HTTPException(404, "preview job not found")
        if row.get("status") != "preview_ready":
            raise HTTPException(400, f"job #{job_id} ไม่ใช่ preview_ready")
        continue_preview = True
        topic = topic or row.get("topic") or ""
        scenario = (row.get("theme") or scenario) or scenario
        brief = brief or row.get("user_brief") or ""
        out = row.get("outputs") or {}
        character = character or out.get("character") or "man"
    else:
        job_id = media_db.create_job("flow2", topic=topic or brief, theme=scenario, user_brief=brief)

    async def _run() -> None:
        await asyncio.to_thread(
            run_flow2,
            topic,
            scenario,
            brief,
            job_id,
            character,
            attach_watermark,
            attach_subtitles,
            continue_preview,
            preset_job_id,
            success_id,
        )

    bg.add_task(_run)
    return {
        "ok": True,
        "job_id": job_id,
        "status": "running",
        "continued_from_preview": continue_preview,
        "preset_job_id": preset_job_id,
        "success_id": success_id,
    }


@app.get("/api/flow4/meta")
async def flow4_meta() -> dict[str, Any]:
    return {
        "topics": list_tutorial_topics(),
        "characters": list_characters(),
    }


@app.post("/api/flow4/generate")
async def flow4_generate(body: dict[str, Any], bg: BackgroundTasks) -> dict[str, Any]:
    topic_id = body.get("topic_id") or body.get("topic") or "start"
    brief = body.get("user_brief", "") or body.get("message", "")
    character = body.get("character") or "man"

    job_id = media_db.create_job("flow4", topic=topic_id, theme=topic_id, user_brief=brief)

    async def _run() -> None:
        await asyncio.to_thread(run_flow4, topic_id, brief, job_id, character)

    bg.add_task(_run)
    return {"ok": True, "job_id": job_id, "status": "running"}


@app.get("/api/flow3/meta")
async def flow3_meta() -> dict[str, Any]:
    from factory.reel_factory import CHARACTERS

    return {
        "acts": list_acts(),
        "characters": CHARACTERS,
        "engine": "grok_video",
        "requires": ["XAI_API_KEY", "AQOND TTS (port 8000)", "FFmpeg"],
    }


@app.post("/api/flow3/preview")
async def flow3_preview(body: dict[str, Any], bg: BackgroundTasks) -> dict[str, Any]:
    story = body.get("story", "") or body.get("topic", "")
    brief = body.get("user_brief", "") or body.get("message", "")
    character = body.get("character", "man_narrator")
    preset_job_id, success_id = _preset_ids(body)

    job_id = media_db.create_job("flow3", topic=story or brief, user_brief=brief)

    async def _run() -> None:
        await asyncio.to_thread(
            run_flow3_preview,
            story,
            brief,
            job_id,
            character,
            preset_job_id,
            success_id,
        )

    bg.add_task(_run)
    return {"ok": True, "job_id": job_id, "status": "running", "mode": "preview", "preset_job_id": preset_job_id, "success_id": success_id}


@app.post("/api/flow3/generate")
async def flow3_generate(body: dict[str, Any], bg: BackgroundTasks) -> dict[str, Any]:
    story = body.get("story", "") or body.get("topic", "")
    brief = body.get("user_brief", "") or body.get("message", "")
    character = body.get("character", "man_narrator")

    continue_job_id = body.get("continue_job_id") or body.get("preview_job_id")
    continue_preview = False
    preset_job_id, success_id = _preset_ids(body)
    job_id: int

    if continue_job_id:
        try:
            job_id = int(continue_job_id)
        except (TypeError, ValueError):
            raise HTTPException(400, "continue_job_id invalid")
        row = media_db.get_job(job_id)
        if not row or row.get("flow_type") != "flow3":
            raise HTTPException(404, "preview job not found")
        if row.get("status") != "preview_ready":
            raise HTTPException(400, f"job #{job_id} ไม่ใช่ preview_ready")
        continue_preview = True
        story = story or row.get("topic") or ""
        brief = brief or row.get("user_brief") or ""
        out = row.get("outputs") or {}
        character = character or out.get("character") or "man_narrator"
    else:
        job_id = media_db.create_job("flow3", topic=story or brief, user_brief=brief)

    async def _run() -> None:
        await asyncio.to_thread(
            run_flow3,
            story,
            brief,
            job_id,
            character,
            continue_preview,
            preset_job_id,
            success_id,
        )

    bg.add_task(_run)
    return {
        "ok": True,
        "job_id": job_id,
        "status": "running",
        "continued_from_preview": continue_preview,
        "preset_job_id": preset_job_id,
        "success_id": success_id,
    }


def _enrich_job(job: dict[str, Any]) -> None:
    outputs = job.get("outputs")
    if not isinstance(outputs, dict):
        return
    ft = job.get("flow_type") or ""
    clip_count = 0
    if ft == "flow2":
        clip_count = sum(1 for s in (outputs.get("scenes") or []) if s.get("video"))
    enrich_job_outputs(ft, outputs, clip_count)
    computed = outputs.get("qc_score_computed")
    if computed is not None:
        job["qc_score"] = computed
    job["outputs"] = outputs


@app.get("/api/jobs")
async def list_all_jobs(flow: str | None = None) -> dict[str, Any]:
    jobs = media_db.list_jobs(flow_type=flow, limit=30)
    for j in jobs:
        _enrich_job(j)
        _attach_media_urls(j)
    return {"jobs": jobs}


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: int) -> dict[str, Any]:
    job = media_db.get_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    _enrich_job(job)
    _attach_media_urls(job)
    return job


@app.get("/api/jobs/{job_id}/download")
async def download_job_media(job_id: int, kind: str = Query("video")) -> FileResponse:
    """ดาวน์โหลดไฟล์สำเร็จของงาน — บังคับ Content-Disposition: attachment"""
    job = media_db.get_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    outputs = job.get("outputs") or {}
    flow = job.get("flow_type") or ""

    path: Path | None = None
    filename = f"aqond_{job_id}"
    media_type = "application/octet-stream"

    if kind == "video":
        raw = outputs.get("final_video") or outputs.get("video_path")
        if not raw and flow == "flow2":
            raw = STUDIO_DIR / "flow2" / f"REEL_{job_id}.mp4"
        elif not raw and flow == "flow4":
            raw = STUDIO_DIR / "flow4" / f"TUTORIAL_{job_id}.mp4"
        if raw:
            path = Path(raw)
        filename = f"aqond_reel_{job_id}.mp4" if flow == "flow2" else f"aqond_video_{job_id}.mp4"
        media_type = "video/mp4"
    elif kind == "image":
        raw = outputs.get("image_path")
        if raw:
            path = Path(raw)
        filename = f"aqond_post_{job_id}.png"
        media_type = "image/png"
    else:
        raise HTTPException(400, "kind must be video or image")

    if not path or not path.is_file():
        raise HTTPException(404, "file not found")

    return FileResponse(
        path=str(path.resolve()),
        filename=filename,
        media_type=media_type,
    )


def _attach_media_urls(job: dict[str, Any]) -> None:
    outputs = job.get("outputs") or {}
    for key in ("image_path", "final_video", "video_path", "preview_video"):
        p = outputs.get(key)
        if p:
            outputs[f"{key}_url"] = _path_to_url(Path(p))
    for list_key in ("scenes", "slides"):
        items = outputs.get(list_key)
        if isinstance(items, list):
            for sc in items:
                if not isinstance(sc, dict):
                    continue
                for sk in ("image", "video", "audio"):
                    sp = sc.get(sk)
                    if sp:
                        sc[f"{sk}_url"] = _path_to_url(Path(sp))
    if outputs.get("copy"):
        job["copy"] = outputs["copy"]
    job["outputs"] = outputs


def _path_to_url(p: Path) -> str:
    try:
        resolved = p.resolve()
        rel = resolved.relative_to(STUDIO_DIR.resolve())
        return f"/media/{rel.as_posix()}"
    except ValueError:
        resolved = p.resolve()
        for sub in ("flow2", "flow4", "flow1", "uploads"):
            candidate = (STUDIO_DIR / sub / resolved.name).resolve()
            if candidate == resolved:
                return f"/media/{sub}/{resolved.name}"
        return ""


@app.get("/api/publish/status")
async def get_publish_status() -> dict[str, Any]:
    st = publish_status()
    return {
        "platforms": st,
        "ready": st.get("facebook", False),
        "hint": (
            "พร้อมโพสต์ Facebook"
            if st.get("facebook")
            else "ใส่ FB_PAGE_ACCESS_TOKEN + FB_PAGE_ID ใน .env แล้วรีสตาร์ท server"
        ),
    }


@app.post("/api/jobs/{job_id}/publish")
async def publish_job(job_id: int, body: dict[str, Any] | None = None) -> dict[str, Any]:
    body = body or {}
    platform = (body.get("platform") or "facebook").lower()
    job = media_db.get_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")

    outputs = job.get("outputs") or {}
    copy = outputs.get("copy") or {}
    caption = (
        body.get("caption")
        or copy.get("facebook")
        or copy.get("instagram")
        or job.get("topic")
        or ""
    )
    hashtags = copy.get("hashtags", "")
    if hashtags and hashtags not in caption:
        caption = f"{caption}\n\n{hashtags}"

    flow = job.get("flow_type", "")
    if flow == "flow1":
        image_path = outputs.get("image_path", "")
        if not image_path or not Path(image_path).is_file():
            raise HTTPException(400, "ไม่พบไฟล์รูปในงานนี้")
        success, errors = await asyncio.to_thread(
            publish_photo, image_path, caption, [platform]
        )
    else:
        video_path = outputs.get("final_video") or outputs.get("video_path") or ""
        if not video_path or not Path(video_path).is_file():
            raise HTTPException(400, "ไม่พบไฟล์วิดีโอในงานนี้")
        success, errors = await asyncio.to_thread(
            publish_video, video_path, caption, [platform]
        )

    if success:
        media_db.update_job(job_id, status="published", outputs_json={**outputs, "publish_urls": success})
        return {"ok": True, "urls": success, "errors": errors}

    return {"ok": False, "urls": {}, "errors": errors or ["โพสต์ไม่สำเร็จ"]}


@app.get("/api/jobs/{job_id}/preset")
async def get_job_preset(job_id: int) -> dict[str, Any]:
    preset = get_preset_from_job(job_id)
    if not preset:
        raise HTTPException(404, f"job #{job_id} ไม่มี preset หรือยังไม่เสร็จ")
    return preset


@app.post("/api/jobs/{job_id}/mark-success")
async def mark_success(job_id: int, body: dict[str, Any] | None = None) -> dict[str, Any]:
    body = body or {}
    score = float(body.get("engagement_score", 0))
    tags = body.get("tags") or []
    return success_library.mark_job_success(job_id, score, tags)


@app.get("/api/success-library/{success_id}/preset")
async def get_success_preset(success_id: int) -> dict[str, Any]:
    from factory.job_presets import get_preset_from_success

    preset = get_preset_from_success(success_id)
    if not preset:
        raise HTTPException(404, f"success #{success_id} ไม่มี preset")
    return preset


@app.get("/api/success-library")
async def get_success_library(flow: str | None = None) -> dict[str, Any]:
    return {"examples": success_library.list_for_ui(flow)}


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    port = int(__import__("os").getenv("MEDIA_STUDIO_PORT", "8780"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()
