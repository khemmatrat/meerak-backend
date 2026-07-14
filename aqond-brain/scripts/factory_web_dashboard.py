"""
Aqond Interactive Control Center — 3-Tab Production Suite
FastAPI + WebSocket + Tabs: [Minnie Studio | Rocky Workshop | Thomas Terminal]
Port 8765: http://127.0.0.1:8765
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request, BackgroundTasks, File, UploadFile, Query
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen

AQOND_BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AQOND_BRAIN / "scripts"))

from factory.production_manager import ProductionManager, ProductionState
from factory.thomas_publisher import publish_video

app = FastAPI(title="Aqond Interactive Control Center")
pm = ProductionManager()
log = logging.getLogger("dashboard")


def _min_scene_video_bytes() -> int:
    """คลิป Grok จริงมักหลัก MB — ไม่สตรีมไฟล์หลัก KB (สตับ/พลาดดาวน์โหลด)"""
    try:
        v = int(os.getenv("SCENE_VIDEO_MIN_BYTES", "100000").strip())
    except ValueError:
        v = 100_000
    return max(50_000, min(v, 500_000_000))

# Directories
PREVIEW_DIR = AQOND_BRAIN / "output" / "previews"
FINAL_DIR = AQOND_BRAIN / "output" / "final"
STATE_DIR = AQOND_BRAIN / "output" / "production_states"
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
FINAL_DIR.mkdir(parents=True, exist_ok=True)

VARIANTS_DIR = AQOND_BRAIN / "output" / "variants"
VARIANTS_DIR.mkdir(parents=True, exist_ok=True)
BGM_ASSET = AQOND_BRAIN / "config" / "assets" / "bgm.mp3"
REFS_DIR = AQOND_BRAIN / "output" / "refs"
REFS_DIR.mkdir(parents=True, exist_ok=True)
THUMB_DIR = AQOND_BRAIN / "output" / "thumbs"
THUMB_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/previews", StaticFiles(directory=str(PREVIEW_DIR)), name="previews")
app.mount("/final", StaticFiles(directory=str(FINAL_DIR)), name="final")
app.mount("/variants", StaticFiles(directory=str(VARIANTS_DIR)), name="variants")


def _static_url_for_output_video(abs_path: Path) -> str | None:
    """
    แมปไฟล์ใต้ output/ → URL ที่ StaticFiles รองรับจริง
    (ถ้าชี้ไป previews/ แต่ UI เรียก /variants/ จะ 404 วนซ้ำ)
    """
    try:
        p = abs_path.resolve()
    except OSError:
        return None
    if not p.is_file():
        return None
    for base, prefix in (
        (VARIANTS_DIR.resolve(), "/variants/"),
        (PREVIEW_DIR.resolve(), "/previews/"),
        (FINAL_DIR.resolve(), "/final/"),
    ):
        try:
            p.relative_to(base)
            return prefix + p.name
        except ValueError:
            continue
    return None
app.mount("/refs", StaticFiles(directory=str(REFS_DIR)), name="refs")

ALLOWED_REF_EXT = {".jpg", ".jpeg", ".png", ".webp"}
MAX_REF_BYTES = 12 * 1024 * 1024

# WebSocket clients
clients: list[WebSocket] = []

# Prevent overlapping Rocky variant renders for the same project
_rocky_editing_projects: set[str] = set()
_rocky_editing_registry_lock = asyncio.Lock()

# หยุด FFmpeg ระหว่าง Rocky variant render (ต่อโปรเจกต์)
_rocky_render_cancel_events: dict[str, threading.Event] = {}


def rocky_render_cancel_event(project_id: str) -> threading.Event:
    ev = _rocky_render_cancel_events.get(project_id)
    if ev is None:
        ev = threading.Event()
        _rocky_render_cancel_events[project_id] = ev
    return ev


def _social_meta_dict_from_project(proj: Any) -> dict[str, str]:
    sb = getattr(proj, "structured_brief", None) or {}
    if not isinstance(sb, dict):
        sb = {}

    def g(key: str, default: str = "") -> str:
        v = sb.get(key, default)
        return str(v).strip() if v is not None else default

    promo = g("promotion_cta")
    link = ""
    m = re.search(r"https?://[^\s)]+", promo)
    if m:
        link = m.group(0).rstrip(").,]")
    title = (g("product_service") or proj.project_id)[:220]
    parts = [x for x in [g("hook_insight"), g("call_to_action"), promo] if x]
    desc = " · ".join(parts)[:900]
    tier = (getattr(proj, "tier", None) or "marketing").strip().lower()
    category = "education_tutorial" if tier == "tutorial" else "education_marketing"
    product_code = ""
    for pat in (r"\b[A-Z]{2,10}\d{2,8}\b", r"\b\d{5,}\b"):
        m = re.search(pat, promo)
        if m:
            product_code = m.group(0)[:40]
            break
    kw_parts = [title[:60], "Aqond", "เรียนออนไลน์", "shortvideo"]
    if g("hook_insight"):
        kw_parts.append(g("hook_insight")[:40])
    keywords = ",".join(x for x in kw_parts if x)[:450]
    return {
        "title": title,
        "description": desc,
        "product_link": link[:500],
        "promo_code": promo[:220],
        "project_id": proj.project_id,
        "category": category[:120],
        "keywords": keywords,
        "product_code": product_code,
    }


def _embed_social_meta_mp4(video_path: Path, meta: dict[str, str]) -> tuple[bool, str]:
    if not video_path.is_file():
        return False, "file not found"
    out = video_path.with_name(video_path.stem + "_aqmeta.mp4")
    try:
        payload = json.dumps(meta, ensure_ascii=False)[:1800]
        title = (meta.get("title") or "").replace("=", " ")[:220]
        desc = (meta.get("description") or "").replace("=", " ")[:480]
        pl = (meta.get("product_link") or "").replace("=", " ")[:400]
        pc = (meta.get("promo_code") or "").replace("=", " ")[:200]
        cat = (meta.get("category") or "").replace("=", " ")[:120]
        kw = (meta.get("keywords") or "").replace("=", " ")[:450]
        pcode = (meta.get("product_code") or "").replace("=", " ")[:80]
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-c",
            "copy",
            "-metadata",
            f"title={title}",
            "-metadata",
            f"description={desc}",
            "-metadata",
            f"comment={payload}",
            "-metadata",
            f"product_link={pl}",
            "-metadata",
            f"promo_code={pc}",
            "-metadata",
            f"category={cat}",
            "-metadata",
            f"keywords={kw}",
            "-metadata",
            f"product_code={pcode}",
            "-movflags",
            "use_metadata_tags",
            str(out),
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=240)
        if r.returncode != 0:
            out.unlink(missing_ok=True)
            return False, (r.stderr or "")[-450:]
        if not out.is_file():
            return False, "ffmpeg produced no file"
        os.replace(str(out), str(video_path))
        return True, ""
    except OSError as e:
        if out.is_file():
            out.unlink(missing_ok=True)
        return False, str(e)


def _cleanup_orphan_variant_files(project_id: str, dry_run: bool = False) -> dict[str, Any]:
    proj = pm.load_project(project_id)
    if not proj:
        return {"error": "not found"}
    keep: set[str] = set()
    for p in (proj.render_variants or {}).values():
        try:
            keep.add(str(Path(p).resolve()))
        except OSError:
            keep.add(str(p))
    if proj.edited_video_path:
        try:
            keep.add(str(Path(proj.edited_video_path).resolve()))
        except OSError:
            keep.add(str(proj.edited_video_path))
    deleted: list[str] = []
    for fp in VARIANTS_DIR.glob(f"{project_id}_*.mp4"):
        try:
            r = str(fp.resolve())
        except OSError:
            r = str(fp)
        if r not in keep:
            deleted.append(fp.name)
            if not dry_run:
                try:
                    fp.unlink(missing_ok=True)
                except OSError:
                    pass
    thumbs_gone: list[str] = []
    if not dry_run:
        for th in THUMB_DIR.glob(f"{project_id}_sc*.jpg"):
            thumbs_gone.append(th.name)
            try:
                th.unlink(missing_ok=True)
            except OSError:
                pass
    return {"deleted_variants": deleted, "deleted_thumbs": thumbs_gone, "kept_paths_count": len(keep)}


def _ffprobe_format_tags(video_path: Path) -> dict[str, str]:
    try:
        r = subprocess.run(
            [
                "ffprobe",
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                str(video_path),
            ],
            capture_output=True,
            text=True,
            timeout=45,
        )
        if r.returncode != 0:
            return {}
        data = json.loads(r.stdout or "{}")
        tags = (data.get("format") or {}).get("tags") or {}
        return {str(k).lower(): str(v).strip() for k, v in tags.items()}
    except Exception:
        return {}


def _pick_primary_video_path(proj: Any) -> Path | None:
    rv = getattr(proj, "render_variants", None) or {}
    vk = (getattr(proj, "selected_variant", None) or "").strip()
    if vk and rv.get(vk):
        cand = Path(rv[vk])
        if cand.is_file():
            return cand
    p = getattr(proj, "edited_video_path", None) or ""
    if p:
        pp = Path(p)
        if pp.is_file():
            return pp
    for _k, vp in rv.items():
        pp = Path(vp)
        if pp.is_file():
            return pp
    return None


def _metadata_audit_report(tags: dict[str, str], expected: dict[str, str]) -> dict[str, Any]:
    missing: list[str] = []
    weak: list[str] = []

    def g(key: str) -> str:
        return tags.get(key.lower(), "") or ""

    if not g("title"):
        missing.append("title")
    elif expected.get("title") and (expected["title"][:24] not in (g("title") or "")):
        weak.append("title_mismatch")

    if not g("description"):
        missing.append("description")

    exp_link = (expected.get("product_link") or "").strip()
    if len(exp_link) > 8:
        if not g("product_link"):
            missing.append("product_link")
        elif exp_link[:12] not in (g("product_link") or ""):
            weak.append("product_link_mismatch")

    exp_promo = (expected.get("promo_code") or "").strip()
    if len(exp_promo) > 3:
        pr = g("promo_code") or ""
        if not pr:
            weak.append("promo_code_empty")
        elif exp_promo[:4] not in pr:
            weak.append("promo_code_mismatch")

    if not g("category"):
        weak.append("category")
    if not g("keywords"):
        weak.append("keywords")

    pcode = (expected.get("product_code") or "").strip()
    if pcode and pcode not in (g("promo_code") + g("comment") + g("description")):
        weak.append("product_code")

    if len(g("comment") or "") < 16:
        missing.append("comment_json")

    ok = not missing and not weak
    return {
        "ok": ok,
        "missing_required": missing,
        "warnings": weak,
        "tags_sample": {
            k: (v[:100] + "…") if len(v) > 100 else v for k, v in list(tags.items())[:14]
        },
    }


def _read_env_file_value(key: str) -> str:
    env_path = AQOND_BRAIN / ".env"
    if env_path.exists():
        for line in open(env_path, "r", encoding="utf-8"):
            line = line.split("#")[0].strip()
            if "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() == key:
                return v.strip().strip('"').strip("'")
    return (os.environ.get(key) or "").strip()


def _social_sync_webhook_url() -> str:
    return _read_env_file_value("SOCIAL_SYNC_WEBHOOK_URL")


def _mask_webhook_url(url: str) -> str:
    u = (url or "").strip()
    if len(u) < 20:
        return ""
    return u[:36] + "…" + u[-10:]


def _post_json_webhook(url: str, payload: dict[str, Any], timeout: float = 45.0) -> tuple[int, str]:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = UrlRequest(
        url.strip(),
        data=data,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")[:1200]
            return resp.getcode() or 200, body
    except HTTPError as e:
        raw = e.read() if hasattr(e, "read") else b""
        return e.code, (raw.decode("utf-8", errors="replace") if raw else str(e))[:1200]
    except URLError as e:
        return -1, str(e.reason)[:500]
    except Exception as e:
        return -2, str(e)[:500]


async def _thomas_posting_dict_for_project(proj: Any) -> dict[str, Any] | None:
    """Payload เดียวกับ Auto-Post / webhook (path + caption + hashtags + meta)."""
    vpath = _pick_primary_video_path(proj)
    if not vpath or not vpath.is_file():
        return None
    try:
        vp = str(vpath.resolve())
    except OSError:
        vp = str(vpath)
    meta = _social_meta_dict_from_project(proj)
    hashtags: list[str] = []
    try:
        from factory.navy_agent import get_trend_heatmap, scrape_rss_feeds

        news_items = await asyncio.to_thread(scrape_rss_feeds, log)
        trends_raw = await asyncio.to_thread(get_trend_heatmap, news_items, log)
        for t in trends_raw[:12]:
            topic = (t.get("topic") or "").strip()
            if not topic:
                continue
            tag = "#" + re.sub(r"\s+", "", topic)[:42]
            if tag not in hashtags:
                hashtags.append(tag)
    except Exception:
        pass
    caption = ("\n\n".join(x for x in [meta.get("description", ""), meta.get("promo_code", "")] if x)).strip()
    if not caption:
        caption = meta.get("title", "") or ""
    return {
        "project_id": proj.project_id,
        "video_path": vp,
        "video_data": {"path": vp, "filename": vpath.name},
        "caption": caption,
        "hashtags": hashtags,
        "social_meta": meta,
    }


def _scene_descriptions_from_script(script_md: str) -> list[str]:
    from factory.script_segmentation import scene_descriptions_for_ui

    return scene_descriptions_for_ui(script_md or "")


def _shot_takes_api(project_id: str, proj: Any, idx: int) -> dict[str, Any]:
    from factory.shot_takes import migrate_shot_variants_from_raw_clips

    migrate_shot_variants_from_raw_clips(proj)
    sv = (proj.shot_variants or {}).get(str(idx), {})
    if not isinstance(sv, dict):
        sv = {}
    selected = sv.get("selected") or "variant_a"
    out: dict[str, Any] = {"selected": selected}
    for tk in ("variant_a", "variant_b", "variant_c"):
        p = (sv.get(tk) or "").strip()
        ok = bool(p and Path(p).is_file())
        out[tk] = {
            "has_file": ok,
            "thumb_url": f"/api/project/{project_id}/shot/{idx}/take/{tk}/thumb.jpg" if ok else None,
            "video_url": f"/api/project/{project_id}/shot/{idx}/take/{tk}/video" if ok else None,
        }
    return out


def _ensure_scene_thumb(clip_path: Path, thumb_path: Path) -> bool:
    if not clip_path.is_file():
        return False
    try:
        need = (not thumb_path.is_file()) or (thumb_path.stat().st_mtime < clip_path.stat().st_mtime)
        if not need:
            return True
        thumb_path.parent.mkdir(parents=True, exist_ok=True)
        r = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(clip_path),
                "-vf",
                "scale=640:-1",
                "-vframes",
                "1",
                "-q:v",
                "3",
                str(thumb_path),
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
        return r.returncode == 0 and thumb_path.is_file()
    except (OSError, subprocess.SubprocessError, ValueError):
        return False


def _ensure_refs_project_dir(project_id: str) -> Path:
    d = REFS_DIR / project_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _rocky_require_character_ref() -> bool:
    """ถ้า .env ตั้ง ROCKY_REQUIRE_CHARACTER_REF=1 จะบล็อกส่ง Rocky โดยไม่มีรูปตัวละคร — ค่าเริ่มต้นไม่บังคับ"""
    env_path = AQOND_BRAIN / ".env"
    if not env_path.exists():
        return False
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.split("#")[0].strip()
        if line.startswith("ROCKY_REQUIRE_CHARACTER_REF="):
            return line.split("=", 1)[-1].strip() in ("1", "true", "yes", "on")
    return False


@app.get("/", response_class=HTMLResponse)
async def dashboard():
    """3-Tab Interactive Control Center"""
    html = """<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Aqond Interactive Control Center</title>
  <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script>
  <script>
    /* STANDALONE TAB SWITCHER — no dependencies, loaded first */
    function switchTab(id) {
      console.log('Switching to: ' + id);
      var all = document.querySelectorAll('.tab-content');
      for (var i = 0; i < all.length; i++) { all[i].style.display = 'none'; }
      var target = document.getElementById(id + '-tab');
      if (target) target.style.display = 'block';
      var btns = document.querySelectorAll('.tab-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.remove('active');
        var oc = btns[i].getAttribute('onclick') || '';
        if (oc.indexOf("'" + id + "'") !== -1) btns[i].classList.add('active');
      }
      if (id === 'navy' && window.loadNavyIntelligence) loadNavyIntelligence();
      else if (id === 'pinky' && window.loadPinkyWarRoom) loadPinkyWarRoom();
      else if (id === 'rocky') {
        if (typeof currentProject !== 'undefined' && currentProject && window.loadStoryboard) {
          if (window.syncRockyVariantControlsFromProject) syncRockyVariantControlsFromProject(window.__projectsById && window.__projectsById[currentProject]);
          loadStoryboard(currentProject);
          if (window.loadProjectRefs) loadProjectRefs(currentProject);
          if (window.refreshRockyVariantBarsDom) refreshRockyVariantBarsDom(currentProject);
        }
      }
      else if (id === 'thomas') {
        if (window.loadDoneVideos) loadDoneVideos();
        if (window.loadTodayDashboard) loadTodayDashboard();
        if (window.loadSocialWebhookStatusForThomas) loadSocialWebhookStatusForThomas();
      }
      else if (id === 'minnie' && window.onMinnieTabActivated) {
        window.onMinnieTabActivated();
      }
    }
  </script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', 'Kanit', system-ui, sans-serif;
      background: linear-gradient(135deg, #0a0e27 0%, #1a1a2e 100%);
      color: #e8e8ef;
      min-height: 100vh;
    }
    
    .header {
      text-align: center;
      padding: 2rem 0 1.5rem;
      border-bottom: 1px solid rgba(126, 179, 255, 0.2);
    }
    h1 {
      font-size: 2.2rem;
      background: linear-gradient(90deg, #7eb3ff, #a78bfa);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      font-weight: 800;
    }
    .subtitle { color: #9ca3af; margin-top: 0.5rem; font-size: 0.9rem; }

    /* Rocky live console — flux-style glow */
    .rocky-flux-panel {
      margin-bottom: 1rem;
      padding: 1rem 1.15rem;
      border-radius: 12px;
      background: linear-gradient(135deg, rgba(99,102,241,0.14) 0%, rgba(236,72,153,0.09) 45%, rgba(34,211,238,0.1) 100%);
      border: 1px solid rgba(167,139,250,0.4);
      animation: fluxGlow 5s ease-in-out infinite;
    }
    @keyframes fluxGlow {
      0%, 100% { box-shadow: 0 0 24px rgba(99,102,241,0.12); border-color: rgba(167,139,250,0.35); }
      50% { box-shadow: 0 0 42px rgba(236,72,153,0.18); border-color: rgba(244,114,182,0.45); }
    }
    .flux-head { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; font-weight: 700; color: #c4b5fd; letter-spacing: 0.04em; text-transform: uppercase; }
    .flux-dot { width: 9px; height: 9px; border-radius: 50%; background: #22d3ee; box-shadow: 0 0 10px #22d3ee; animation: pulseDot 1.25s ease-in-out infinite; }
    @keyframes pulseDot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(1.35); } }
    .flux-phase { margin-top: 0.45rem; font-size: 0.88rem; color: #e8e8ef; font-weight: 600; }
    #rockyLiveHero {
      display: none;
      margin-top: 0.5rem;
      font-size: 0.92rem;
      font-weight: 600;
      line-height: 1.35;
      min-height: 1.35em;
      background: linear-gradient(90deg, #a78bfa, #34d399, #f472b6);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: pulseHero 2.2s ease-in-out infinite;
    }
    @keyframes pulseHero {
      0%, 100% { filter: brightness(1); opacity: 0.92; }
      50% { filter: brightness(1.12); opacity: 1; }
    }
    .flux-log {
      margin: 0.55rem 0 0 0;
      max-height: 150px;
      overflow-y: auto;
      padding: 0.5rem 0.6rem;
      border-radius: 8px;
      background: rgba(10,12,30,0.65);
      border: 1px solid rgba(58,58,94,0.8);
      font-family: ui-monospace, Consolas, monospace;
      font-size: 0.72rem;
      line-height: 1.45;
      color: #a5b4fc;
      white-space: pre-wrap;
      word-break: break-word;
    }
    
    /* Tab Navigation */
    .tab-nav {
      display: flex;
      justify-content: center;
      gap: 1rem;
      padding: 1.5rem 2rem;
      background: rgba(20, 20, 30, 0.8);
      border-bottom: 1px solid #2a2a3e;
    }
    .tab-btn {
      padding: 0.75rem 2rem;
      background: rgba(40, 40, 60, 0.6);
      border: 1px solid #3a3a5e;
      border-radius: 8px;
      color: #9ca3af;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
    }
    .tab-btn:hover {
      background: rgba(60, 60, 80, 0.8);
      border-color: #5a5a7e;
      color: #e8e8ef;
    }
    .tab-btn.active {
      background: linear-gradient(135deg, #4c6fff 0%, #6b8aff 100%);
      border-color: #7eb3ff;
      color: #fff;
      box-shadow: 0 4px 20px rgba(76, 111, 255, 0.4);
    }
    
    /* Tab Content */
    .tab-content {
      display: none;
      padding: 2rem;
    }
    .tab-content.active {
      display: block;
    }
    #navy-tab {
      display: block;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    /* === MINNIE STUDIO === */
    .minnie-studio {
      max-width: 1400px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
    }
    .minnie-studio.focus-mode {
      grid-template-columns: 1fr;
      max-width: 100%;
    }
    .minnie-studio.focus-mode .chat-interface {
      display: none !important;
    }
    .minnie-studio.focus-mode .script-editor {
      max-width: 100%;
    }
    .minnie-studio.focus-mode #scriptContent {
      min-height: min(72vh, 900px);
    }
    
    .script-editor {
      background: rgba(20, 20, 30, 0.95);
      border: 1px solid #2a2a3e;
      border-radius: 12px;
      padding: 1.5rem;
    }
    .script-editor h2 {
      font-size: 1.4rem;
      margin-bottom: 1rem;
      color: #7eb3ff;
    }
    #scriptContent {
      width: 100%;
      min-height: 400px;
      background: rgba(30, 30, 50, 0.8);
      border: 1px solid #3a3a5e;
      border-radius: 8px;
      padding: 1rem;
      color: #e8e8ef;
      font-family: 'Consolas', monospace;
      font-size: 0.95rem;
      line-height: 1.6;
      resize: vertical;
    }
    
    .chat-interface {
      background: rgba(20, 20, 30, 0.95);
      border: 1px solid #2a2a3e;
      border-radius: 12px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      height: 600px;
    }
    .chat-interface h2 {
      font-size: 1.4rem;
      margin-bottom: 1rem;
      color: #a78bfa;
    }
    #chatMessages {
      flex: 1;
      overflow-y: auto;
      background: rgba(30, 30, 50, 0.8);
      border: 1px solid #3a3a5e;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    .msg {
      margin-bottom: 1rem;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      max-width: 85%;
    }
    .msg.user {
      background: rgba(76, 111, 255, 0.2);
      border-left: 3px solid #4c6fff;
      margin-left: auto;
    }
    .msg.minnie {
      background: rgba(167, 139, 250, 0.2);
      border-left: 3px solid #a78bfa;
    }
    .msg .label {
      font-size: 0.8rem;
      color: #9ca3af;
      margin-bottom: 0.3rem;
    }
    .chat-input-group {
      display: flex;
      gap: 0.75rem;
    }
    #chatInput {
      flex: 1;
      padding: 0.75rem 1rem;
      background: rgba(30, 30, 50, 0.9);
      border: 1px solid #3a3a5e;
      border-radius: 8px;
      color: #e8e8ef;
      font-size: 0.95rem;
    }
    .btn {
      padding: 0.75rem 1.5rem;
      background: linear-gradient(135deg, #4c6fff 0%, #6b8aff 100%);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
    }
    .btn:hover {
      box-shadow: 0 4px 20px rgba(76, 111, 255, 0.5);
      transform: translateY(-2px);
    }
    .btn.secondary {
      background: linear-gradient(135deg, #a78bfa 0%, #c4b5fd 100%);
    }
    
    /* === ROCKY WORKSHOP === */
    .rocky-workshop {
      max-width: 1600px;
      margin: 0 auto;
    }
    .storyboard {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .scene-poster-wrap {
      position: relative;
      width: 100%;
      border-radius: 8px;
      overflow: hidden;
      background: #000;
      margin-bottom: 0.5rem;
    }
    .scene-poster-wrap video.scene-thumb-video {
      width: 100%;
      height: 140px;
      object-fit: contain;
      display: block;
      vertical-align: top;
      background: #000;
      filter: none;
      -webkit-filter: none;
    }
    .scene-grok-loading {
      min-height: 140px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(ellipse at center, #1e1b4b 0%, #0f0f1a 70%);
      border: 1px solid rgba(129, 140, 248, 0.2);
    }
    .grok-imaging {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      color: #a5b4fc;
      font-size: 0.88rem;
      font-weight: 600;
      text-align: center;
      padding: 0.5rem;
    }
    .grok-spinner {
      width: 38px;
      height: 38px;
      border: 3px solid rgba(129, 140, 248, 0.2);
      border-top-color: #818cf8;
      border-radius: 50%;
      animation: grok-spin 0.8s linear infinite;
    }
    @keyframes grok-spin {
      to { transform: rotate(360deg); }
    }
    .rocky-variant-bars {
      margin: 0.65rem 0 0.35rem;
      padding: 0.5rem 0.65rem;
      background: rgba(10,10,24,0.55);
      border-radius: 8px;
      border: 1px solid rgba(126,179,255,0.2);
    }
    .rocky-variant-bars .rv-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.35rem;
      font-size: 0.72rem;
      color: #c4b5fd;
    }
    .rocky-variant-bars .rv-row:last-child { margin-bottom: 0; }
    .rocky-variant-bars .rv-label { width: 72px; flex-shrink: 0; font-weight: 600; }
    .rocky-variant-bars .rv-track {
      flex: 1;
      height: 8px;
      background: rgba(58,58,94,0.8);
      border-radius: 4px;
      overflow: hidden;
    }
    .rocky-variant-bars .rv-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.35s ease;
    }
    .rv-fill-a { background: linear-gradient(90deg, #3b82f6, #7eb3ff); }
    .rv-fill-b { background: linear-gradient(90deg, #059669, #34d399); }
    .rv-fill-c { background: linear-gradient(90deg, #d97706, #fbbf24); }
    .scene-card {
      background: rgba(20, 20, 30, 0.95);
      border: 1px solid #2a2a3e;
      border-radius: 12px;
      padding: 1rem;
      transition: all 0.3s;
    }
    .scene-card:hover {
      border-color: #4a4a6e;
      box-shadow: 0 8px 30px rgba(126, 179, 255, 0.1);
    }
    .scene-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }
    .scene-title {
      font-size: 1rem;
      font-weight: 700;
      color: #7eb3ff;
    }
    .scene-video {
      width: 100%;
      border-radius: 8px;
      margin-bottom: 0.75rem;
      background: #000;
    }
    .scene-desc {
      font-size: 0.85rem;
      color: #b8b8c8;
      margin-bottom: 0.75rem;
      line-height: 1.5;
    }
    .scene-actions {
      display: flex;
      gap: 0.5rem;
    }
    .btn-sm {
      padding: 0.5rem 1rem;
      font-size: 0.85rem;
      border: 1px solid #3a3a5e;
      background: rgba(40, 40, 60, 0.6);
      border-radius: 6px;
      color: #e8e8ef;
      cursor: pointer;
      transition: all 0.3s;
    }
    .btn-sm:hover {
      background: rgba(76, 111, 255, 0.3);
      border-color: #4c6fff;
    }
    
    .final-actions {
      text-align: center;
      margin-top: 2rem;
    }
    .btn-large {
      padding: 1rem 3rem;
      font-size: 1.1rem;
      background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
      border: none;
      border-radius: 12px;
      color: #fff;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.3s;
    }
    .btn-large:hover {
      box-shadow: 0 8px 30px rgba(16, 185, 129, 0.5);
      transform: translateY(-3px);
    }
    
    /* === THOMAS TERMINAL === */
    .thomas-terminal {
      max-width: 1400px;
      margin: 0 auto;
    }
    .video-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    .video-item {
      background: rgba(20, 20, 30, 0.95);
      border: 1px solid #2a2a3e;
      border-radius: 12px;
      padding: 1rem;
      transition: all 0.3s;
    }
    .video-item:hover {
      border-color: #4c6fff;
    }
    .video-item.selected {
      border-color: #10b981;
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
    }
    .video-checkbox {
      width: 20px;
      height: 20px;
      margin-bottom: 0.75rem;
      cursor: pointer;
    }
    .video-thumbnail {
      width: 100%;
      height: 150px;
      background: #000;
      border-radius: 8px;
      margin-bottom: 0.75rem;
      cursor: pointer;
      position: relative;
    }
    .video-thumbnail:hover::after {
      content: '▶ Play';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(76, 111, 255, 0.9);
      color: #fff;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
    }
    .video-thumbnail video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 8px;
    }
    .video-info {
      font-size: 0.85rem;
      color: #b8b8c8;
      margin-bottom: 0.75rem;
    }
    .pinky-rating {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
      padding: 0.5rem;
      background: rgba(167, 139, 250, 0.1);
      border-radius: 6px;
    }
    .stars {
      color: #fbbf24;
      font-size: 1rem;
    }
    .video-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .video-actions button {
      flex: 1;
      min-width: 100px;
      padding: 0.5rem;
      font-size: 0.8rem;
    }
    .btn-danger {
      background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
    }
    .btn-warning {
      background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
    }
    
    .scheduler {
      background: rgba(20, 20, 30, 0.95);
      border: 1px solid #2a2a3e;
      border-radius: 12px;
      padding: 2rem;
    }
    .scheduler h2 {
      font-size: 1.5rem;
      color: #7eb3ff;
      margin-bottom: 1.5rem;
    }
    .schedule-form {
      display: grid;
      gap: 1.5rem;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .form-group label {
      font-size: 0.9rem;
      font-weight: 600;
      color: #9ca3af;
    }
    .form-group input, .form-group select {
      padding: 0.75rem 1rem;
      background: rgba(30, 30, 50, 0.9);
      border: 1px solid #3a3a5e;
      border-radius: 8px;
      color: #e8e8ef;
      font-size: 0.95rem;
    }
    .platform-checks {
      display: flex;
      gap: 1.5rem;
    }
    .platform-checks label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
    }
    
    /* Status Badge */
    .status {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status.draft { background: #374151; color: #9ca3af; }
    .status.scripting { background: #7c3aed; color: #e9d5ff; }
    .status.script_paused { background: #6366f1; color: #e0e7ff; }
    .status.script_rejected { background: #b45309; color: #ffedd5; }
    .status.visual_paused { background: #c2410c; color: #ffedd5; }
    .status.pinky_review { background: #ca8a04; color: #fef9c3; }
    .status.edit_rejected { background: #be123c; color: #ffe4e6; }
    .status.visual_gen { background: #ea580c; color: #fed7aa; }
    .status.editing { background: #0891b2; color: #cffafe; }
    .status.qc { background: #eab308; color: #fef08a; }
    .status.approved { background: #10b981; color: #d1fae5; }
    .status.done { background: #059669; color: #a7f3d0; }
    .status.stub { background: #b45309; color: #ffedd5; }
    .status.failed { background: #dc2626; color: #fecaca; }
    
    /* Loading */
    .loading {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid #3a3a5e;
      border-top-color: #7eb3ff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
      @keyframes slideIn { from { transform: translateX(120%); opacity:0; } to { transform: translateX(0); opacity:1; } }
      @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Aqond Interactive Control Center</h1>
    <div class="subtitle">Grok-Powered Video Production Factory</div>
  </div>
  
  <div class="tab-nav">
    <button class="tab-btn active" onclick="switchTab('navy')">Navy's Intelligence</button>
    <button class="tab-btn" onclick="switchTab('pinky')">Pinky's War Room</button>
    <button class="tab-btn" onclick="switchTab('minnie')">Minnie's Studio</button>
    <button class="tab-btn" onclick="switchTab('rocky')">Rocky's Workshop</button>
    <button class="tab-btn" onclick="switchTab('thomas')">Thomas's Terminal</button>
  </div>

  <div id="liveQueueStrip" style="margin:0 1.25rem 0.75rem;padding:0.65rem 0.85rem;background:rgba(15,23,42,0.92);border:1px solid #334155;border-radius:10px;">
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.65rem 1rem;justify-content:space-between;">
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem 0.85rem;">
        <span style="color:#93c5fd;font-weight:700;font-size:0.82rem;">Live Production Queue</span>
        <span id="liveQueueCounts" style="color:#9ca3af;font-size:0.76rem;">กำลังโหลด…</span>
      </div>
      <div style="display:flex;gap:0.45rem;align-items:center;">
        <button type="button" onclick="loadFactoryQueue(true)" style="padding:0.25rem 0.6rem;background:rgba(59,130,246,0.2);border:1px solid #3b82f6;color:#93c5fd;border-radius:6px;cursor:pointer;font-size:0.72rem;">↻ Refresh</button>
        <button type="button" onclick="toggleLiveQueueDetail()" id="liveQueueToggleBtn" style="padding:0.25rem 0.6rem;background:rgba(55,65,81,0.5);border:1px solid #4b5563;color:#d1d5db;border-radius:6px;cursor:pointer;font-size:0.72rem;">แสดงตาราง</button>
      </div>
    </div>
      <div id="liveQueueDetail" style="display:none;margin-top:0.55rem;max-height:220px;overflow:auto;border-top:1px solid #334155;padding-top:0.45rem;">
      <table style="width:100%;border-collapse:collapse;font-size:0.72rem;color:#e5e7eb;">
        <thead><tr style="color:#9ca3af;text-align:left;"><th style="padding:0.25rem;">โปรเจกต์</th><th style="padding:0.25rem;">สถานะ</th><th style="padding:0.25rem;">อัปเดต</th><th style="padding:0.25rem;">บทย่อ</th></tr></thead>
        <tbody id="liveQueueTableBody"></tbody>
      </table>
    </div>
      <div style="margin-top:0.45rem;">
        <button type="button" onclick="copyAllReadyVideoPaths()" style="padding:0.25rem 0.55rem;background:rgba(236,72,153,0.12);border:1px solid #ec4899;color:#f9a8d4;border-radius:6px;cursor:pointer;font-size:0.7rem;">Copy All Ready Paths</button>
        <span style="color:#6b7280;font-size:0.68rem;margin-left:0.35rem;">วิดีโอ QC/Done ที่มีไฟล์บนดิสก์</span>
      </div>
  </div>
  
  <!-- NAVY TAB -->
  <div id="navy-tab" class="tab-content active">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
      <h2>🌐 Navy's Intelligence Hub</h2>
      <button onclick="loadNavyIntelligence()" style="background:rgba(126,179,255,0.15);border:1px solid #7eb3ff;color:#7eb3ff;padding:0.5rem 1rem;border-radius:6px;cursor:pointer;font-size:0.85rem;">Refresh All</button>
    </div>

    <!-- Row 1: News + Trend Heatmap -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:1.5rem;">
      <div class="card">
        <h3 style="margin-bottom:1rem;color:#7eb3ff;">📰 Global News Feed</h3>
        <div id="navy-news-feed" style="max-height:360px;overflow-y:auto;">
          <p style="color:#666;">Loading latest news...</p>
        </div>
      </div>
      <div class="card">
        <h3 style="margin-bottom:1rem;color:#7eb3ff;">📊 Trend Heatmap</h3>
        <div id="navy-trends" style="max-height:360px;overflow-y:auto;">
          <p style="color:#666;">Analyzing trends...</p>
        </div>
      </div>
    </div>

    <!-- Row 2: Competitor Spy (NEW) + Predictions -->
    <div style="display:grid;grid-template-columns:3fr 2fr;gap:1.5rem;margin-bottom:1.5rem;">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <h3 style="color:#f59e0b;">🕵️ Competitor Spy — Viral Analysis</h3>
          <button onclick="loadCompetitorSpy()" id="spyBtn" style="background:rgba(245,158,11,0.15);border:1px solid #f59e0b;color:#f59e0b;padding:0.4rem 0.9rem;border-radius:6px;cursor:pointer;font-size:0.82rem;">Spy Now</button>
        </div>
        <p style="color:#9ca3af;font-size:0.82rem;margin-bottom:0.75rem;">Navy วิเคราะห์ Hook / Value / CTA จาก Viral Videos คู่แข่ง</p>
        <div id="navy-spy-results">
          <p style="color:#555;">Click "Spy Now" to analyze competitor viral videos...</p>
        </div>
      </div>
      <div class="card">
        <h3 style="margin-bottom:1rem;color:#7eb3ff;">🔮 Viral Predictions</h3>
        <div id="navy-predictions" style="max-height:300px;overflow-y:auto;">
          <p style="color:#666;">Predicting viral topics...</p>
        </div>
      </div>
    </div>

    <!-- Row 3: Social Stats -->
    <div class="card">
      <h3 style="margin-bottom:1rem;color:#7eb3ff;">📈 Social Stats Dashboard</h3>
      <div id="navy-social-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;">
        <div style="padding:0.75rem;background:rgba(16,185,129,0.1);border-radius:8px;text-align:center;">
          <div style="color:#9ca3af;font-size:0.8rem;">Facebook Followers</div>
          <div style="font-size:1.8rem;font-weight:700;color:#10b981;">12,345</div>
          <div style="color:#10b981;font-size:0.75rem;">+234 this week</div>
        </div>
        <div style="padding:0.75rem;background:rgba(245,158,11,0.1);border-radius:8px;text-align:center;">
          <div style="color:#9ca3af;font-size:0.8rem;">TikTok Followers</div>
          <div style="font-size:1.8rem;font-weight:700;color:#f59e0b;">8,901</div>
          <div style="color:#f59e0b;font-size:0.75rem;">+89 this week</div>
        </div>
        <div style="padding:0.75rem;background:rgba(139,92,246,0.1);border-radius:8px;text-align:center;">
          <div style="color:#9ca3af;font-size:0.8rem;">Engagement Rate</div>
          <div style="font-size:1.8rem;font-weight:700;color:#8b5cf6;">5.2%</div>
          <div style="color:#8b5cf6;font-size:0.75rem;">Above average</div>
        </div>
        <div style="padding:0.75rem;background:rgba(239,68,68,0.1);border-radius:8px;text-align:center;">
          <div style="color:#9ca3af;font-size:0.8rem;">Alert Level</div>
          <div style="font-size:1.8rem;font-weight:700;color:#ef4444;">LOW</div>
          <div style="color:#ef4444;font-size:0.75rem;">All metrics stable</div>
        </div>
      </div>
    </div>
  </div>
  
  <!-- PINKY WAR ROOM TAB -->
  <div id="pinky-tab" class="tab-content">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
      <h2>🎯 Pinky's War Room</h2>
      <!-- Dual-Tier Toggle -->
      <div style="display:flex;align-items:center;gap:0.75rem;background:rgba(30,30,50,0.7);border:1px solid #3a3a5e;border-radius:8px;padding:0.5rem 1rem;">
        <span style="color:#9ca3af;font-size:0.85rem;">Review Mode:</span>
        <button id="tierMarketing" onclick="setPinkyTier('marketing')" style="background:rgba(167,139,250,0.8);color:#fff;border:none;padding:0.35rem 0.9rem;border-radius:6px;cursor:pointer;font-size:0.82rem;font-weight:600;">Marketing</button>
        <button id="tierTutorial" onclick="setPinkyTier('tutorial')" style="background:rgba(30,30,50,0.5);color:#9ca3af;border:1px solid #3a3a5e;padding:0.35rem 0.9rem;border-radius:6px;cursor:pointer;font-size:0.82rem;">Tutorial</button>
        <span id="tierBadge" style="color:#a78bfa;font-size:0.8rem;font-weight:600;">[ Emotion / Fantasy ]</span>
      </div>
    </div>

    <!-- Row 1: Calendar + Stats -->
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:1.5rem;margin-bottom:1.5rem;">
      <div class="card">
        <h3 style="margin-bottom:1rem;color:#a78bfa;">📅 7-Day Content Calendar <span style="font-size:0.8rem;color:#666;">(click a day for details)</span></h3>
        <div id="pinky-calendar" style="max-height:480px;overflow-y:auto;">
          <p style="color:#666;">Loading calendar...</p>
        </div>
      </div>
      <div class="card">
        <h3 style="margin-bottom:1rem;color:#a78bfa;">⚡ This Week</h3>
        <div style="margin-bottom:0.75rem;padding:0.75rem;background:rgba(126,179,255,0.1);border-radius:6px;">
          <div style="color:#9ca3af;font-size:0.82rem;">Planned</div>
          <div style="font-size:1.6rem;font-weight:700;color:#7eb3ff;">49 videos</div>
        </div>
        <div style="margin-bottom:0.75rem;padding:0.75rem;background:rgba(16,185,129,0.1);border-radius:6px;">
          <div style="color:#9ca3af;font-size:0.82rem;">Approved</div>
          <div style="font-size:1.6rem;font-weight:700;color:#10b981;">12</div>
        </div>
        <div style="margin-bottom:0.75rem;padding:0.75rem;background:rgba(239,68,68,0.1);border-radius:6px;">
          <div style="color:#9ca3af;font-size:0.82rem;">Rejected / Rework</div>
          <div style="font-size:1.6rem;font-weight:700;color:#ef4444;">3</div>
        </div>
        <!-- Tutorial Checklist (shown when Tutorial mode) -->
        <div id="tutorialChecklist" style="display:none;padding:0.75rem;background:rgba(245,158,11,0.1);border-radius:6px;border-left:3px solid #f59e0b;">
          <div style="color:#f59e0b;font-weight:600;font-size:0.85rem;margin-bottom:0.5rem;">Tutorial QC Checklist</div>
          <div id="checklistItems" style="font-size:0.82rem;line-height:1.8;">
            <div>✅ Logical Sequence</div>
            <div>✅ UI Zoom Clarity</div>
            <div>✅ Technical Accuracy</div>
            <div>⏳ Narration Pace</div>
            <div>⏳ Subtitle Sync</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Row 2: Quality Audit + Lessons Learned -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;">
      <div class="card">
        <h3 style="margin-bottom:1rem;color:#a78bfa;">🔍 Gatekeeper Monitor (Live)</h3>
        <div id="pinky-quality-checks" style="max-height:280px;overflow-y:auto;">
          <p style="color:#666;">No active reviews...</p>
        </div>
      </div>
      <div class="card">
        <h3 style="margin-bottom:1rem;color:#a78bfa;">💡 Pinky's Daily Insights</h3>
        <div id="pinky-insights" style="max-height:280px;overflow-y:auto;">
          <p style="color:#666;">Loading insights...</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Calendar Day Detail Modal -->
  <div id="calendarDayModal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:2000;align-items:center;justify-content:center;">
    <div style="background:rgba(20,20,35,0.98);border:1px solid #3a3a5e;border-radius:16px;padding:2rem;max-width:700px;width:90%;max-height:80vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h3 id="calModalDate" style="color:#a78bfa;font-size:1.3rem;">Monday — Jun 2</h3>
        <button onclick="document.getElementById('calendarDayModal').style.display='none'" style="background:none;border:none;color:#fff;font-size:1.5rem;cursor:pointer;">&times;</button>
      </div>
      <div id="calModalContent" style="color:#e8e8ef;line-height:1.8;"></div>
    </div>
  </div>
  
  <!-- MINNIE TAB -->
  <div id="minnie-tab" class="tab-content">
    <div id="minnieStudioRoot" class="minnie-studio">
      <div class="script-editor">
        <div id="minnieFocusBanner" style="display:none;margin-bottom:0.75rem;padding:0.5rem 0.75rem;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.4);border-radius:8px;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;">
          <span style="color:#10b981;font-size:0.82rem;font-weight:600;">โหมดโฟกัส — พื้นที่แก้บทเต็มจอ</span>
          <button type="button" onclick="setMinnieFocusMode(false)" style="padding:0.35rem 0.75rem;background:rgba(126,179,255,0.2);border:1px solid #7eb3ff;color:#7eb3ff;border-radius:6px;cursor:pointer;font-size:0.78rem;">แสดงแชท + ฟอร์ม</button>
        </div>
        <h2>Script Editor (Live)</h2>
        <details style="margin-bottom:1rem;padding:0.65rem 0.85rem;background:rgba(236,72,153,0.06);border:1px solid rgba(236,72,153,0.28);border-radius:8px;">
          <summary style="cursor:pointer;color:#f472b6;font-weight:600;font-size:0.82rem;list-style:revert;">TikTok / Reels &amp; โฆษณาแบบแคมเปญ — เช็กลิสต์</summary>
          <ul style="margin:0.55rem 0 0 1rem;color:#b8b8c8;font-size:0.76rem;line-height:1.6;">
            <li><strong>Hook 0–2 วิ</strong> — บอกผลลัพธ์หรือปัญหาทันที (กันสไลด์)</li>
            <li><strong>โซนปลอดภัย 9:16</strong> — เก็บใบหน้า/CTA กลาง-บน หลบ UI TikTok/Reels</li>
            <li><strong>ซาวด์ออน</strong> — บทพูดชัด + B-roll รองรับการดูไม่เปิดเสียง (ซับสั้น)</li>
            <li><strong>ปักตะกร้า</strong> — พูดชื่อสินค้า + ราคา/โปรในบท; ลิงก์/ตะกร้าใส่คำอธิบายโพสต์ (Thomas)</li>
            <li><strong>CTA เดียว</strong> — หนึ่งคลิปหนึ่งการกระทำ (ดาวน์โหลด / สมัคร / ซื้อ)</li>
            <li><strong>Social proof</strong> — Minnie บังคับใน prompt + แพตช์อัตโนมัติถ้าโมเดลลืม</li>
            <li><strong>ความยาว</strong> — 15–45 วินาที มัก perform ดี; ตัดความซ้ำ</li>
          </ul>
          <label style="display:flex;align-items:flex-start;gap:0.5rem;margin-top:0.65rem;padding:0.45rem 0.5rem;background:rgba(30,30,50,0.5);border-radius:6px;cursor:pointer;color:#e8e8ef;font-size:0.78rem;line-height:1.45;">
            <input type="checkbox" id="minnieTiktokSafeZone" style="margin-top:0.2rem;" />
            <span><strong>TikTok / Reels Safe Zone</strong> — ส่งเข้า prompt ของ Minnie ให้ใส่ท้ายฉากว่า [FRAME: ใบหน้า+CTA กลาง-บน หลบแถบล่าง UI]</span>
          </label>
        </details>

        <!-- Project selector + New project -->
        <div style="margin-bottom:1rem;">
          <label style="font-size:0.85rem;color:#9ca3af;">Current Project:</label>
          <select id="projectSelect" style="width:100%;padding:0.5rem;margin-top:0.5rem;background:rgba(30,30,50,0.9);border:1px solid #3a3a5e;border-radius:6px;color:#e8e8ef;">
            <option value="">Loading projects...</option>
          </select>
        </div>

        <!-- Tone of Voice Selector (NEW) -->
        <div style="margin-bottom:1rem;padding:0.75rem;background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.3);border-radius:8px;">
          <label style="font-size:0.82rem;color:#10b981;font-weight:600;display:block;margin-bottom:0.5rem;">Tone of Voice</label>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button id="toneToon" onclick="setTone('toon')" type="button" style="padding:0.3rem 0.8rem;border-radius:20px;border:1px solid #3a3a5e;background:rgba(30,30,50,0.5);color:#9ca3af;cursor:pointer;font-size:0.8rem;">🎨 Toon</button>
            <button id="toneFunny" onclick="setTone('funny')" type="button" style="padding:0.3rem 0.8rem;border-radius:20px;border:1px solid #3a3a5e;background:rgba(30,30,50,0.5);color:#9ca3af;cursor:pointer;font-size:0.8rem;">😄 Funny</button>
            <button id="toneProfessional" onclick="setTone('professional')" type="button" style="padding:0.3rem 0.8rem;border-radius:20px;border:1px solid #7eb3ff;background:rgba(126,179,255,0.2);color:#7eb3ff;cursor:pointer;font-size:0.8rem;font-weight:600;">💼 Professional</button>
            <button id="toneScifi" onclick="setTone('sci-fi')" type="button" style="padding:0.3rem 0.8rem;border-radius:20px;border:1px solid #3a3a5e;background:rgba(30,30,50,0.5);color:#9ca3af;cursor:pointer;font-size:0.8rem;">🚀 Sci-Fi</button>
            <button id="toneWarm" onclick="setTone('warm')" type="button" style="padding:0.3rem 0.8rem;border-radius:20px;border:1px solid #3a3a5e;background:rgba(30,30,50,0.5);color:#9ca3af;cursor:pointer;font-size:0.8rem;">💛 Warm</button>
          </div>
          <span id="toneDesc" style="color:#9ca3af;font-size:0.78rem;margin-top:0.4rem;display:block;">Formal, authoritative, ROI-focused language</span>
        </div>

        <textarea id="scriptContent" placeholder="สคริปต์จะแสดงที่นี่... (Ctrl+S บันทึก)"></textarea>
        <div id="scriptEditorChrome" style="margin-top:0.5rem;padding:0.55rem 0.75rem;background:rgba(20,24,48,0.85);border:1px solid rgba(126,179,255,0.22);border-radius:8px;display:flex;flex-wrap:wrap;align-items:center;gap:0.65rem 1rem;font-size:0.74rem;color:#b8b8c8;">
          <span id="minnieWsDot" style="display:inline-flex;align-items:center;gap:0.35rem;" title="WebSocket">
            <span class="minnie-ws-led" style="width:8px;height:8px;border-radius:50%;background:#6b7280;display:inline-block;"></span>
            <span id="minnieWsStatusText">รอเชื่อมต่อ…</span>
          </span>
          <span id="scriptCharCount" style="color:#9ca3af;">0 ตัวอักษร</span>
          <span id="scriptDirtyBadge" style="display:none;color:#f59e0b;font-weight:600;">● ยังไม่บันทึก</span>
          <span id="scriptPinkyBadge" style="color:#a78bfa;">Pinky: —</span>
          <span id="scriptStateBadge" style="color:#7eb3ff;">สถานะ: —</span>
          <span id="scriptLastSaved" style="color:#6b7280;">บันทึกล่าสุด: —</span>
          <span style="flex:1;min-width:0.5rem;"></span>
          <button type="button" onclick="copyScriptToClipboard()" style="padding:0.25rem 0.55rem;background:rgba(126,179,255,0.15);border:1px solid rgba(126,179,255,0.4);color:#7eb3ff;border-radius:6px;cursor:pointer;font-size:0.72rem;">📋 คัดลอกบท</button>
          <button type="button" onclick="loadProjectsFromHttp()" style="padding:0.25rem 0.55rem;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.35);color:#10b981;border-radius:6px;cursor:pointer;font-size:0.72rem;">↻ รีเฟรชโปรเจกต์</button>
          <button type="button" id="minnieFocusToggleBtn" onclick="setMinnieFocusMode(true)" style="padding:0.25rem 0.55rem;background:rgba(167,139,250,0.15);border:1px solid rgba(167,139,250,0.45);color:#c4b5fd;border-radius:6px;cursor:pointer;font-size:0.72rem;">🎯 โหมดโฟกัส</button>
        </div>
        <div id="scriptTimelineWrap" style="display:none;margin-top:0.6rem;padding:0.55rem 0.65rem;background:rgba(30,30,55,0.75);border:1px solid rgba(126,179,255,0.2);border-radius:8px;">
          <div style="font-size:0.72rem;color:#9ca3af;margin-bottom:0.35rem;display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;">
            <span>⏱ ไทม์ไลน์จาก <code style="color:#7eb3ff;">[0-3s]</code></span>
            <span style="color:#e8e8ef;">รวม ~<strong id="scriptTimelineTotal">0</strong> วินาที</span>
            <span id="scriptTimelineHint" style="color:#6b7280;font-size:0.68rem;"></span>
          </div>
          <div id="scriptTimelineTrack" style="position:relative;height:34px;background:rgba(15,15,30,0.9);border-radius:8px;border:1px solid #3a3a5e;overflow:hidden;"></div>
          <div id="scriptTimelineLegend" style="margin-top:0.35rem;font-size:0.65rem;color:#888;line-height:1.45;"></div>
        </div>
        <p style="color:#6b7280;font-size:0.68rem;margin-top:0.35rem;">ลัด: <kbd style="background:#2a2a44;padding:0.1rem 0.35rem;border-radius:4px;">Ctrl+S</kbd> บันทึก · <kbd style="background:#2a2a44;padding:0.1rem 0.35rem;border-radius:4px;">Enter</kbd> ส่งแชท Minnie</p>

        <!-- Pinky Gatekeeper Panel -->
        <div id="pinkyScriptReview" style="margin-top:1rem;padding:1rem;background:rgba(167,139,250,0.1);border:1px solid #a78bfa;border-radius:8px;display:none;">
          <h3 style="color:#a78bfa;font-size:1rem;margin-bottom:0.5rem;">Pinky's Script Review (Gatekeeper)</h3>
          <div id="pinkyScriptDetails" style="font-size:0.85rem;color:#e8e8ef;line-height:1.6;">
            <p><strong>Score:</strong> <span id="pinkyScriptScore">-</span>/10</p>
            <p><strong>Status:</strong> <span id="pinkyScriptStatus">-</span></p>
            <p><strong>Feedback:</strong> <span id="pinkyScriptFeedback">-</span></p>
            <div id="pinkyScriptIssues"></div>
          </div>
        </div>

        <div id="pinkyDiffPanel" style="display:none;margin-top:0.75rem;padding:0.85rem;background:rgba(15,23,42,0.95);border:1px solid rgba(245,158,11,0.4);border-radius:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.45rem;flex-wrap:wrap;gap:0.5rem;">
            <span style="color:#fbbf24;font-weight:600;font-size:0.82rem;">📊 Pinky — สรุปก่อน / หลัง</span>
            <button type="button" onclick="document.getElementById('pinkyDiffPanel').style.display='none'" style="padding:0.2rem 0.55rem;background:transparent;border:1px solid #6b7280;color:#9ca3af;border-radius:6px;cursor:pointer;font-size:0.72rem;">ปิด</button>
          </div>
          <p id="pinkyDiffSummary" style="font-size:0.74rem;color:#9ca3af;margin-bottom:0.5rem;line-height:1.5;"></p>
          <div id="pinkyDiffUnified" style="max-height:200px;overflow-y:auto;font-family:Consolas,monospace;font-size:0.7rem;background:rgba(0,0,0,0.28);padding:0.5rem;border-radius:6px;border:1px solid #2a2a44;"></div>
          <details style="margin-top:0.55rem;font-size:0.72rem;color:#9ca3af;">
            <summary style="cursor:pointer;color:#7eb3ff;">ดูบทเต็มก่อน / หลัง</summary>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-top:0.4rem;">
              <div><div style="color:#f87171;font-size:0.65rem;margin-bottom:0.2rem;">ก่อน</div><pre id="pinkyDiffBefore" style="white-space:pre-wrap;max-height:140px;overflow:auto;margin:0;font-size:0.65rem;color:#e8e8ef;"></pre></div>
              <div><div style="color:#4ade80;font-size:0.65rem;margin-bottom:0.2rem;">หลัง</div><pre id="pinkyDiffAfter" style="white-space:pre-wrap;max-height:140px;overflow:auto;margin:0;font-size:0.65rem;color:#e8e8ef;"></pre></div>
            </div>
          </details>
        </div>

        <!-- Script Actions -->
        <div style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
          <button id="pinkyReviewBtn" class="btn secondary" onclick="requestPinkyScriptReview()">🔎 Ask Pinky</button>
          <button type="button" class="btn secondary" onclick="checkMinnieCompliance()" title="ตรวจ CTA / Social proof กับ Structured Brief">✅ CTA &amp; Social</button>
          <button type="button" id="sendToRockyBtn" class="btn" onclick="sendToRocky()" title="ต้องให้ Pinky ให้คะแนน ≥8 ก่อน (หรือลองส่ง — ระบบจะบอกถ้ายังไม่ผ่าน)" style="opacity:0.65;">🎬 Send to Rocky</button>
          <button class="btn secondary" onclick="saveScript()">Save</button>
          <button onclick="openTranslatePanel()" style="padding:0.5rem 1rem;background:rgba(245,158,11,0.15);border:1px solid #f59e0b;color:#f59e0b;border-radius:6px;cursor:pointer;font-size:0.85rem;">🌏 Translate & Localize</button>
        </div>

        <!-- Translate Panel (hidden by default) -->
        <div id="translatePanel" style="display:none;margin-top:1rem;padding:1rem;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:8px;">
          <h4 style="color:#f59e0b;margin-bottom:0.5rem;">🌏 Global localization</h4>
          <p style="color:#9ca3af;font-size:0.72rem;margin:0 0 0.5rem 0;line-height:1.45;">เลือกภาษา/ตลาด (Ctrl+คลิกหลายรายการ) — แปล+ปรับบริบท ไม่ใช่คำต่อคำ; เก็บ scene markers เดิม</p>
          <select id="localizeLocaleSelect" multiple size="9" style="width:100%;max-width:480px;padding:0.4rem;background:rgba(30,30,50,0.9);border:1px solid #3a3a5e;border-radius:6px;color:#e8e8ef;font-size:0.78rem;box-sizing:border-box;"></select>
          <div style="margin-top:0.55rem;display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
            <button type="button" onclick="applyLocalizeToScriptEditor()" style="background:rgba(16,185,129,0.2);border:1px solid #10b981;color:#6ee7b7;padding:0.4rem 0.85rem;border-radius:6px;cursor:pointer;font-size:0.8rem;">ใช้ใน Editor + Save (ตัวแรกที่เลือก)</button>
            <button type="button" onclick="translateScript()" style="background:rgba(245,158,11,0.2);border:1px solid #f59e0b;color:#f59e0b;padding:0.4rem 0.85rem;border-radius:6px;cursor:pointer;font-size:0.8rem;">แปลทุกตัวที่เลือก (พรีวิว)</button>
          </div>
          <div id="translateResults" style="margin-top:0.75rem;"></div>
        </div>
      </div>

      <div class="chat-interface">
        <h2>Chat with Minnie</h2>
        <!-- New Project Form -->
        <div style="padding:0.75rem;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.25);border-radius:8px;margin-bottom:0.75rem;">
          <div style="font-weight:600;color:#10b981;font-size:0.85rem;margin-bottom:0.35rem;">+ New Project — Minnie Structured Brief</div>
          <p style="color:#9ca3af;font-size:0.72rem;margin:0 0 0.5rem 0;line-height:1.45;">โครง Hook → Value → Social Proof → CTA (บังคับใน prompt + แพตช์อัตโนมัติ)</p>
          <label style="display:flex;align-items:center;gap:0.4rem;color:#b8b8c8;font-size:0.76rem;margin-bottom:0.5rem;cursor:pointer;">
            <input type="checkbox" id="minnieBriefModeLegacy" onchange="toggleMinnieBriefMode()" />
            ใช้ Brief ข้อความเดียว (legacy)
          </label>
          <div id="structuredBriefFields" style="display:flex;flex-direction:column;gap:0.45rem;">
            <div>
              <label style="font-size:0.72rem;color:#9ca3af;">Hook Type</label>
              <select id="sbHookType" style="width:100%;margin-top:0.2rem;padding:0.4rem;background:rgba(30,30,50,0.9);border:1px solid #3a3a5e;border-radius:6px;color:#e8e8ef;font-size:0.8rem;box-sizing:border-box;">
                <option value="pain_question">คำถามแทงใจ</option>
                <option value="instant_result">โชว์ผลลัพธ์ทันที</option>
                <option value="secret_reveal">เผยความลับ</option>
                <option value="story_open">เปิดด้วยเรื่องเล่า</option>
                <option value="trend_hook">ผูกเทรนด์ / FOMO</option>
                <option value="other">อื่นๆ</option>
              </select>
            </div>
            <div>
              <label style="font-size:0.72rem;color:#9ca3af;">Hook Insight — หยุดนิ้วใน ~3 วินาที?</label>
              <textarea id="sbHookInsight" rows="2" placeholder="เช่น ทำไมทุกคนถึงเสียเงินกับครีมที่ไม่ทำงาน..." style="width:100%;margin-top:0.2rem;padding:0.45rem;background:rgba(30,30,50,0.9);border:1px solid #3a3a5e;border-radius:6px;color:#e8e8ef;font-size:0.8rem;resize:vertical;box-sizing:border-box;"></textarea>
            </div>
            <div>
              <label style="font-size:0.72rem;color:#9ca3af;">Problem / Solution</label>
              <textarea id="sbProblemSolution" rows="3" placeholder="ปัญหาคืออะไร สินค้าแก้อย่างไร" style="width:100%;margin-top:0.2rem;padding:0.45rem;background:rgba(30,30,50,0.9);border:1px solid #3a3a5e;border-radius:6px;color:#e8e8ef;font-size:0.8rem;resize:vertical;box-sizing:border-box;"></textarea>
            </div>
            <div>
              <label style="font-size:0.72rem;color:#9ca3af;">Product / Service</label>
              <input id="sbProduct" type="text" placeholder="ชื่อสินค้า/บริการ" style="width:100%;margin-top:0.2rem;padding:0.45rem;background:rgba(30,30,50,0.9);border:1px solid #3a3a5e;border-radius:6px;color:#e8e8ef;font-size:0.8rem;box-sizing:border-box;" />
            </div>
            <div>
              <label style="font-size:0.72rem;color:#9ca3af;">Promotion / ลิงก์ตะกร้า / รหัสโปร</label>
              <input id="sbPromo" type="text" placeholder="เช่น AQOND100 หรือลิงก์ Shopee" style="width:100%;margin-top:0.2rem;padding:0.45rem;background:rgba(30,30,50,0.9);border:1px solid #3a3a5e;border-radius:6px;color:#e8e8ef;font-size:0.8rem;box-sizing:border-box;" />
            </div>
            <div>
              <label style="font-size:0.72rem;color:#9ca3af;">Call to Action — ให้ผู้ชมทำอะไร?</label>
              <input id="sbCta" type="text" placeholder="เช่น กดลิงก์ในคอมเมนต์ ใส่รหัส AQOND100" style="width:100%;margin-top:0.2rem;padding:0.45rem;background:rgba(30,30,50,0.9);border:1px solid #3a3a5e;border-radius:6px;color:#e8e8ef;font-size:0.8rem;box-sizing:border-box;" />
            </div>
            <div>
              <label style="font-size:0.72rem;color:#9ca3af;">โน้ตเพิ่ม (ไม่บังคับ)</label>
              <input id="sbExtra" type="text" placeholder="ข้อจำกัดแบรนด์ ฯลฯ" style="width:100%;margin-top:0.2rem;padding:0.45rem;background:rgba(30,30,50,0.9);border:1px solid #3a3a5e;border-radius:6px;color:#e8e8ef;font-size:0.8rem;box-sizing:border-box;" />
            </div>
          </div>
          <div id="legacyBriefOnly" style="display:none;margin-top:0.35rem;">
            <label style="font-size:0.72rem;color:#9ca3af;">Brief (legacy)</label>
            <textarea id="newProjectBrief" rows="3" placeholder="ข้อความอิสระ..." style="width:100%;margin-top:0.2rem;padding:0.45rem;background:rgba(30,30,50,0.9);border:1px solid #3a3a5e;border-radius:6px;color:#e8e8ef;font-size:0.8rem;resize:vertical;box-sizing:border-box;"></textarea>
          </div>
          <div style="display:flex;gap:0.5rem;margin-top:0.5rem;align-items:center;flex-wrap:wrap;">
            <select id="newProjectTier" style="padding:0.35rem;background:rgba(30,30,50,0.9);border:1px solid #3a3a5e;border-radius:6px;color:#e8e8ef;font-size:0.82rem;">
              <option value="marketing">Marketing / Fantasy</option>
              <option value="tutorial">Tutorial / Educational</option>
            </select>
            <button id="createProjectBtn" onclick="createNewProject()" style="padding:0.4rem 1rem;background:rgba(16,185,129,0.2);border:1px solid #10b981;color:#10b981;border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:600;">Create</button>
          </div>
        </div>

        <div style="padding:0.75rem;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.28);border-radius:8px;margin-bottom:0.75rem;">
          <div style="font-weight:600;color:#93c5fd;font-size:0.85rem;margin-bottom:0.35rem;">⚡ Brainstorm Ideas (Navy → Minnie)</div>
          <p style="color:#9ca3af;font-size:0.72rem;margin:0 0 0.5rem 0;line-height:1.45;">ดึงเทรนด์ล่าสุด แล้วเจน Structured Brief 10 หัวข้อ — ติ๊กเลือกหลายแถวแล้วกด Turbo ให้รัน Minnie → Pinky → Rocky → เรนเดอร์จนถึง QC (ใช้เวลานานต่อคลิป)</p>
          <div style="display:flex;flex-wrap:wrap;gap:0.45rem;align-items:center;margin-bottom:0.45rem;">
            <button type="button" id="minnieBrainstormBtn" onclick="runMinnieBrainstorm()" style="padding:0.4rem 0.9rem;background:rgba(59,130,246,0.2);border:1px solid #3b82f6;color:#93c5fd;border-radius:6px;cursor:pointer;font-size:0.82rem;font-weight:600;">Brainstorm Ideas</button>
            <button type="button" onclick="selectAllBrainstormCheckboxes(true)" style="padding:0.35rem 0.65rem;background:rgba(55,65,81,0.5);border:1px solid #4b5563;color:#9ca3af;border-radius:6px;cursor:pointer;font-size:0.72rem;">เลือกทั้งหมด</button>
            <button type="button" onclick="selectAllBrainstormCheckboxes(false)" style="padding:0.35rem 0.65rem;background:rgba(55,65,81,0.5);border:1px solid #4b5563;color:#9ca3af;border-radius:6px;cursor:pointer;font-size:0.72rem;">ยกเลิกทั้งหมด</button>
            <button type="button" id="minnieBrainstormTurboBtn" onclick="autoRunSelectedBrainstormIdeas()" style="padding:0.4rem 0.85rem;background:linear-gradient(135deg,#f97316,#ea580c);border:1px solid #fb923c;color:#ffedd5;border-radius:6px;cursor:pointer;font-size:0.78rem;font-weight:700;">⚡ Auto-Run Selected</button>
            <span id="minnieBrainstormSource" style="color:#6b7280;font-size:0.7rem;"></span>
          </div>
          <div style="margin-top:0.55rem;max-height:280px;overflow:auto;border:1px solid #334155;border-radius:8px;">
            <table style="width:100%;border-collapse:collapse;font-size:0.72rem;">
              <thead><tr style="background:rgba(30,41,59,0.9);color:#9ca3af;text-align:left;"><th style="padding:0.35rem;width:28px;"></th><th style="padding:0.35rem;">#</th><th style="padding:0.35rem;">Product</th><th style="padding:0.35rem;">Hook</th><th style="padding:0.35rem;"></th></tr></thead>
              <tbody id="minnieBrainstormTableBody"></tbody>
            </table>
          </div>
        </div>

        <div id="chatMessages"></div>
        <div style="margin-bottom:0.5rem;padding:0.45rem 0;background:transparent;border-top:1px solid rgba(58,58,94,0.5);">
          <div style="font-size:0.7rem;color:#9ca3af;margin-bottom:0.35rem;">ลัดแชท Minnie</div>
          <div style="display:flex;flex-wrap:wrap;gap:0.35rem;">
            <button type="button" onclick="sendMinniePreset('intense')" style="padding:0.3rem 0.65rem;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);color:#fca5a5;border-radius:999px;cursor:pointer;font-size:0.72rem;">เข้มขึ้น</button>
            <button type="button" onclick="sendMinniePreset('shorter')" style="padding:0.3rem 0.65rem;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.35);color:#93c5fd;border-radius:999px;cursor:pointer;font-size:0.72rem;">สั้นลง</button>
            <button type="button" onclick="sendMinniePreset('cta')" style="padding:0.3rem 0.65rem;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.35);color:#6ee7b7;border-radius:999px;cursor:pointer;font-size:0.72rem;">เพิ่ม CTA</button>
          </div>
        </div>
        <div class="chat-input-group">
          <input id="chatInput" type="text" placeholder="พิมพ์คำสั่งแก้บท... (เช่น 'ทำให้ Hook ดุดันขึ้น')" />
          <button class="btn" onclick="sendChat()">Send</button>
        </div>
      </div>
    </div>
  </div>
  
  <!-- ROCKY TAB -->
  <div id="rocky-tab" class="tab-content">
    <div class="rocky-workshop">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.75rem;margin-bottom:1rem;">
        <div>
          <h2 style="font-size:1.8rem;color:#7eb3ff;margin:0;">Instant Storyboard Grid</h2>
          <p style="color:#9ca3af;font-size:0.78rem;margin:0.35rem 0 0;">โปสเตอร์จากคลิป Grok — เห็นทุกฉากในหน้าเดียว</p>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;">
          <select id="regenAllCreativity" style="padding:0.35rem 0.5rem;background:rgba(30,30,50,0.9);border:1px solid #3a3a5e;border-radius:6px;color:#e8e8ef;font-size:0.78rem;">
            <option value="medium">Regen All — Normal</option>
            <option value="high">Regen All — High</option>
            <option value="extreme">Regen All — EXTREME</option>
          </select>
          <button type="button" class="btn-sm" style="background:linear-gradient(135deg,#7c3aed,#a78bfa);border-color:#a78bfa;" onclick="regenAllScenes()">Regen All</button>
        </div>
        <div style="width:100%;margin-top:0.5rem;">
          <label style="font-size:0.72rem;color:#9ca3af;">โน้ต Regen All (บันทึกในประวัติโปรเจกต์ — ไม่บังคับ)</label>
          <input type="text" id="regenAllNoteInput" maxlength="500" placeholder="เช่น โทนรวมไม่เข้าพวก — อยากให้สม่ำเสมอ" style="width:100%;max-width:560px;margin-top:0.2rem;padding:0.4rem;background:rgba(30,30,50,0.9);border:1px solid #3a3a5e;border-radius:6px;color:#e8e8ef;font-size:0.78rem;box-sizing:border-box;" />
        </div>
        <!-- Rocky Mode Controls -->
        <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;">
          <div style="background:rgba(30,30,50,0.7);border:1px solid #3a3a5e;border-radius:8px;padding:0.5rem 0.75rem;display:flex;align-items:center;gap:0.75rem;">
            <span style="color:#9ca3af;font-size:0.82rem;">Beat-Sync:</span>
            <label style="position:relative;display:inline-block;width:36px;height:20px;">
              <input type="checkbox" id="beatSyncToggle" checked style="opacity:0;width:0;height:0;" />
              <span onclick="document.getElementById('beatSyncToggle').click()" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#10b981;border-radius:20px;transition:0.3s;"></span>
            </label>
            <span style="color:#10b981;font-size:0.8rem;font-weight:600;">ON</span>
          </div>
          <div style="background:rgba(30,30,50,0.7);border:1px solid #3a3a5e;border-radius:8px;padding:0.5rem 0.75rem;display:flex;align-items:center;gap:0.75rem;">
            <span style="color:#9ca3af;font-size:0.82rem;">Edu Overlays:</span>
            <label style="position:relative;display:inline-block;width:36px;height:20px;">
              <input type="checkbox" id="eduOverlayToggle" style="opacity:0;width:0;height:0;" />
              <span onclick="toggleEduOverlay()" id="eduOverlaySwitch" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#3a3a5e;border-radius:20px;transition:0.3s;"></span>
            </label>
            <span id="eduOverlayLabel" style="color:#9ca3af;font-size:0.8rem;">OFF</span>
          </div>
        </div>
      </div>

      <div style="margin-bottom:1.25rem;padding:0.85rem 1rem;background:rgba(30,30,50,0.75);border:1px solid #3a3a5e;border-radius:10px;">
        <div style="color:#e8e8ef;font-weight:600;font-size:0.88rem;margin-bottom:0.5rem;">เลือก Variant ที่จะเรนเดอร์ (A / B / C)</div>
        <div style="display:flex;flex-wrap:wrap;gap:1rem;align-items:center;font-size:0.82rem;color:#e8e8ef;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:0.35rem;"><input type="checkbox" id="rockyVarA" checked onchange="saveRockyVariantPrefs()" /> <span style="color:#7eb3ff;font-weight:600;">A</span> Sci-Fi / Fantasy</label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:0.35rem;"><input type="checkbox" id="rockyVarB" checked onchange="saveRockyVariantPrefs()" /> <span style="color:#c9a227;font-weight:600;">B</span> Instories</label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:0.35rem;"><input type="checkbox" id="rockyVarC" checked onchange="saveRockyVariantPrefs()" /> <span style="color:#fbbf24;font-weight:600;">C</span> Viral</label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:0.35rem;margin-left:0.5rem;padding-left:0.75rem;border-left:1px solid #3a3a5e;"><input type="checkbox" id="rockyAutoRenderAfterVisual" onchange="saveRockyVariantPrefs()" /> <span>เริ่มเรนเดอร์อัตโนมัติเมื่อคลิป Grok พร้อม</span></label>
        </div>
        <p style="color:#6b7280;font-size:0.72rem;margin:0.45rem 0 0;">บันทึกลงโปรเจกต์ทันที — Worker จะใช้เฉพาะช่องที่ติ๊ก (และไม่ล็อกแท็บอื่น)</p>
      </div>

      <!-- Edu Overlay Settings (shown when Tutorial mode) -->
      <div id="eduOverlaySettings" style="display:none;margin-bottom:1rem;padding:0.75rem;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:8px;">
        <div style="color:#f59e0b;font-weight:600;font-size:0.85rem;margin-bottom:0.5rem;">Educational Overlay Settings</div>
        <div style="display:flex;gap:1rem;flex-wrap:wrap;font-size:0.82rem;color:#e8e8ef;">
          <label><input type="checkbox" checked /> Arrow Callouts</label>
          <label><input type="checkbox" checked /> Step Numbers</label>
          <label><input type="checkbox" checked /> Zoom Indicators</label>
          <label><input type="checkbox" /> Highlight Boxes</label>
        </div>
      </div>

      <div id="refUploadPanel" style="margin-bottom:1.25rem;padding:1rem;background:rgba(126,179,255,0.08);border:1px solid rgba(126,179,255,0.35);border-radius:10px;">
        <h3 style="color:#7eb3ff;font-size:1rem;margin-bottom:0.5rem;">🎯 ตัวละครแบรนด์ &amp; Ref ต่อฉาก</h3>
        <p style="color:#9ca3af;font-size:0.8rem;line-height:1.5;margin-bottom:0.75rem;">
          อัปโหลด<strong>รูปตัวละครหลัก</strong>ครั้งเดียว — ระบบใช้<strong>ไฟล์เดียวกัน</strong>เป็น image-to-video ทุกฉาก เพื่อให้<strong>หน้าตาเดียวกัน จดจำได้</strong> (ไม่สุ่มคนใหม่)<br/>
          Ref ต่อฉาก = ภาพประกอบ (UI / สินค้า) เสริมในบท — ไม่แทนที่ใบหน้าหลัก
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:1rem;align-items:flex-end;">
          <div>
            <div style="color:#e8e8ef;font-size:0.82rem;margin-bottom:0.35rem;">รูปตัวละครหลัก (บังคับเพื่อความสม่ำเสมอ)</div>
            <input type="file" id="characterRefFile" accept="image/jpeg,image/png,image/webp" style="font-size:0.8rem;color:#e8e8ef;" />
            <button type="button" onclick="uploadCharacterRef()" style="margin-left:0.5rem;padding:0.35rem 0.85rem;background:rgba(16,185,129,0.2);border:1px solid #10b981;color:#10b981;border-radius:6px;cursor:pointer;font-size:0.8rem;">อัปโหลด</button>
          </div>
          <div id="characterRefPreview" style="display:none;">
            <img id="characterRefImg" alt="character ref" style="max-height:100px;border-radius:8px;border:1px solid #3a3a5e;" />
          </div>
        </div>
        <div id="refStatusLine" style="margin-top:0.5rem;font-size:0.78rem;color:#9ca3af;"></div>
      </div>

      <div id="multiShotWizard" style="margin-bottom:1.25rem;padding:1rem;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.35);border-radius:10px;">
        <h3 style="color:#6ee7b7;font-size:1rem;margin:0 0 0.5rem 0;">Multi-Shot Production Manager</h3>
        <p style="color:#9ca3af;font-size:0.78rem;margin:0 0 0.65rem 0;line-height:1.45;">เลือกจำนวนช็อต (4/6/8) + Director Style — Beat-sync ผูกกับ narration; คลิปสั้นกว่าช่วงเสียงจะถูกขยายด้วย freeze-frame (L-cut style)</p>
        <div style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:center;margin-bottom:0.55rem;">
          <label style="font-size:0.82rem;color:#e8e8ef;">จำนวนช็อต</label>
          <select id="targetShotCount" style="padding:0.35rem 0.5rem;background:rgba(30,30,50,0.9);border:1px solid #3a3a5e;border-radius:6px;color:#e8e8ef;font-size:0.8rem;">
            <option value="0">อัตโนมัติจากบท</option>
            <option value="4">4 ช็อต</option>
            <option value="6">6 ช็อต</option>
            <option value="8">8 ช็อต</option>
          </select>
          <label style="font-size:0.82rem;color:#e8e8ef;margin-left:0.35rem;">Director</label>
          <select id="directorPresetSelect" style="padding:0.35rem 0.5rem;background:rgba(30,30,50,0.9);border:1px solid #3a3a5e;border-radius:6px;color:#e8e8ef;font-size:0.8rem;">
            <option value="corporate">Corporate</option>
            <option value="tiktok_fast">TikTok Fast-Cut</option>
            <option value="cinematic_slow">Cinematic Slow</option>
          </select>
          <span id="creditEstLine" style="font-size:0.76rem;color:#a7f3d0;"></span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;">
          <button type="button" class="btn-sm" style="background:rgba(16,185,129,0.25);border-color:#34d399;color:#6ee7b7;" onclick="applyProductionSettings()">บันทึกการตั้งค่า</button>
          <button type="button" class="btn-sm" onclick="wizardNextShot()">Next Shot (wizard)</button>
          <button type="button" class="btn-sm" style="background:rgba(59,130,246,0.2);border-color:#60a5fa;color:#93c5fd;" onclick="refreshProductionEstimate()">ประมาณการ credit</button>
          <span id="wizardStepLine" style="font-size:0.76rem;color:#9ca3af;"></span>
        </div>
        <div style="margin-top:0.75rem;padding-top:0.65rem;border-top:1px solid rgba(58,58,94,0.6);">
          <div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;margin-bottom:0.5rem;">
            <button type="button" class="btn-sm" style="background:linear-gradient(135deg,#7c3aed,#a78bfa);border-color:#c4b5fd;color:#fff;font-weight:600;" onclick="startBatchProduction()">Start Batch Production</button>
            <button type="button" class="btn-sm" style="background:linear-gradient(135deg,#f59e0b,#fbbf24);border-color:#fcd34d;color:#1f2937;font-weight:600;" onclick="masterAssemblyRender()" id="masterAssemblyBtn" disabled>Final Master Assembly</button>
            <a id="walletTopupLink" href="#" target="_blank" rel="noopener" style="display:none;font-size:0.74rem;color:#f472b6;text-decoration:underline;">Top up Wallet</a>
          </div>
          <div id="batchProgressBar" style="display:none;width:100%;max-width:520px;">
            <div style="font-size:0.72rem;color:#c4b5fd;margin-bottom:0.25rem;" id="batchProgressLabel">—</div>
            <div style="height:8px;background:rgba(30,30,50,0.9);border-radius:999px;overflow:hidden;border:1px solid #7c3aed;">
              <div id="batchProgressFill" style="height:100%;width:0%;background:linear-gradient(90deg,#a78bfa,#ec4899);transition:width 0.35s ease;"></div>
            </div>
          </div>
          <p style="font-size:0.72rem;color:#9ca3af;margin-top:0.45rem;line-height:1.45;max-width:640px;">Tip — <strong style="color:#c4b5fd;">Regen</strong> แทนที่แค่ <strong>Take A</strong> (มาสเตอร์หลัก) · <strong style="color:#6ee7b7;">Gen B/C</strong> สะสมทางเลือกเพิ่ม ไม่ทับ A — ประหยัดพื้นที่และลดความสับสน</p>
        </div>
      </div>

      <div id="rockyFluxConsole" class="rocky-flux-panel" style="display:none;">
        <div class="flux-head"><span class="flux-dot" aria-hidden="true"></span> Live pipeline</div>
        <div id="rockyLiveHero" aria-live="polite"></div>
        <div id="rockyFluxPhase" class="flux-phase">—</div>
        <div id="rockyVariantBars" class="rocky-variant-bars" style="display:none;">
          <div class="rv-row"><span class="rv-label">Variant A</span><div class="rv-track"><div id="rockyProgFillA" class="rv-fill rv-fill-a" style="width:0%;"></div></div><span id="rockyProgPctA" style="width:36px;text-align:right;color:#9ca3af;">0%</span></div>
          <div class="rv-row"><span class="rv-label">Variant B</span><div class="rv-track"><div id="rockyProgFillB" class="rv-fill rv-fill-b" style="width:0%;"></div></div><span id="rockyProgPctB" style="width:36px;text-align:right;color:#9ca3af;">0%</span></div>
          <div class="rv-row"><span class="rv-label">Variant C</span><div class="rv-track"><div id="rockyProgFillC" class="rv-fill rv-fill-c" style="width:0%;"></div></div><span id="rockyProgPctC" style="width:36px;text-align:right;color:#9ca3af;">0%</span></div>
        </div>
        <pre id="rockyFluxLog" class="flux-log"></pre>
      </div>

      <div id="storyboard" class="storyboard">
        <p style="text-align:center;color:#9ca3af;">Select a project from Minnie tab first...</p>
      </div>
      <div class="final-actions" style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:center;">
        <button id="finalRenderBtn" class="btn-large" onclick="finalRender()">Final Render (Combine All)</button>
        <button type="button" class="btn-sm" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.45);color:#fca5a5;" onclick="cancelRockyRender()">หยุดเรนเดอร์</button>
      </div>
    </div>
  </div>

  <div id="masterCelebrationOverlay" style="display:none;position:fixed;inset:0;z-index:2100;background:rgba(5,8,22,0.94);flex-direction:column;align-items:center;justify-content:center;padding:1rem;overflow:auto;">
    <div style="text-align:center;margin-bottom:0.75rem;">
      <div style="font-size:1.35rem;font-weight:800;background:linear-gradient(90deg,#fde047,#a78bfa,#34d399);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">ภารกิจสำเร็จ! · Mission accomplished</div>
      <div style="font-size:0.85rem;color:#9ca3af;margin-top:0.35rem;">Master พร้อมแล้ว — ชมเต็มจอด้านล่าง</div>
    </div>
    <video id="masterCelebrationVideo" controls playsinline preload="metadata" style="width:100%;max-width:min(96vw,960px);max-height:min(72vh,640px);border-radius:14px;border:2px solid rgba(167,139,250,0.55);box-shadow:0 0 56px rgba(99,102,241,0.4);background:#000;"></video>
    <button type="button" onclick="closeMasterCelebration()" style="margin-top:1rem;padding:0.65rem 1.5rem;border-radius:12px;border:1px solid rgba(167,139,250,0.5);background:rgba(99,102,241,0.25);color:#e8e8ef;font-weight:600;cursor:pointer;">ปิด</button>
  </div>
  
  <!-- THOMAS TAB -->
  <div id="thomas-tab" class="tab-content">
    <div class="thomas-terminal">
      <h2 style="font-size: 1.8rem; color: #7eb3ff; margin-bottom: 1.5rem;">Distribution Terminal (Zero-Touch)</h2>
      
      <!-- Production Dashboard -->
      <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(167, 139, 250, 0.1) 100%); border: 1px solid #10b981; border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem;">
        <h3 style="color: #10b981; margin-bottom: 1rem;">📊 Today's Production Summary</h3>
        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 1rem; font-size: 0.9rem;">
          <div>
            <strong>Completed:</strong> <span id="todayCompleted" style="color: #10b981; font-size: 1.5rem; font-weight: 700;">0</span>
          </div>
          <div>
            <strong>In Progress:</strong> <span id="todayInProgress" style="color: #f59e0b; font-size: 1.5rem; font-weight: 700;">0</span>
          </div>
          <div>
            <strong>Scheduled:</strong> <span id="todayScheduled" style="color: #3b82f6; font-size: 1.5rem; font-weight: 700;">0</span>
          </div>
          <div>
            <strong>Posted:</strong> <span id="todayPosted" style="color: #8b5cf6; font-size: 1.5rem; font-weight: 700;">0</span>
          </div>
          <div>
            <strong>Target:</strong> <span style="color: #9ca3af; font-size: 1.5rem; font-weight: 700;">7-10</span>
          </div>
        </div>
      </div>
      
      <!-- Pinky Insights -->
      <div style="background: rgba(167, 139, 250, 0.1); border: 1px solid #a78bfa; border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem;">
        <h3 style="color: #a78bfa; margin-bottom: 1rem;">🎯 Pinky's Quality Control</h3>
        <div id="pinkyInsights" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; font-size: 0.9rem;">
          <div><strong>Total Reviews:</strong> <span id="pinkyTotal">0</span></div>
          <div><strong>Avg Score:</strong> <span id="pinkyAvgScore">0.0/10</span></div>
          <div><strong>Approval Rate:</strong> <span id="pinkyApprovalRate">0</span>%</div>
          <div><strong>Reworks:</strong> <span id="pinkyReworks">0</span></div>
        </div>
      </div>
      
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.75rem;margin-bottom:1rem;padding:0.65rem 0.85rem;background:rgba(30,30,50,0.6);border:1px solid #3a3a5e;border-radius:10px;">
        <span style="color:#9ca3af;font-size:0.82rem;">Variant ใน Thomas:</span>
        <label style="display:flex;align-items:center;gap:0.35rem;cursor:pointer;font-size:0.82rem;color:#e8e8ef;">
          <input type="radio" name="thomasVarView" id="thomasVarLatest" value="latest" checked onchange="onThomasVariantViewChange()" /> รอบล่าสุดเท่านั้น
        </label>
        <label style="display:flex;align-items:center;gap:0.35rem;cursor:pointer;font-size:0.82rem;color:#e8e8ef;">
          <input type="radio" name="thomasVarView" id="thomasVarAll" value="all" onchange="onThomasVariantViewChange()" /> ทั้งหมดบนดิสก์
        </label>
      </div>
      <div id="videoGrid" class="video-grid">
        <p style="color: #9ca3af;">No videos ready for distribution yet...</p>
      </div>
      
      <!-- Video Preview Modal -->
      <div id="videoPreviewModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 1000; align-items: center; justify-content: center;">
        <div style="background: rgba(20,20,30,0.98); border-radius: 16px; padding: 2rem; max-width: 900px; width: 90%;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 style="color: #7eb3ff;">Video Preview</h3>
            <button onclick="closePreview()" style="background: none; border: none; color: #fff; font-size: 1.5rem; cursor: pointer;">&times;</button>
          </div>
          <video id="previewPlayer" controls style="width: 100%; border-radius: 8px; margin-bottom: 1rem;"></video>
          <div id="previewInfo" style="color: #b8b8c8; font-size: 0.9rem;"></div>
          <div id="thomasCaptionPanel" style="display:none;margin-top:1rem;padding-top:1rem;border-top:1px solid #3a3a5e;">
            <div style="color:#7eb3ff;font-size:0.85rem;margin-bottom:0.35rem;">Suggested Caption (Structured Brief + Navy trends)</div>
            <textarea id="thomasSuggestedCaption" rows="5" style="width:100%;padding:0.5rem;background:rgba(20,20,35,0.9);border:1px solid #3a3a5e;border-radius:8px;color:#e8e8ef;font-size:0.82rem;resize:vertical;box-sizing:border-box;"></textarea>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.5rem;">
              <button type="button" onclick="fetchThomasSuggestedCaption()" style="padding:0.35rem 0.75rem;background:rgba(126,179,255,0.2);border:1px solid #7eb3ff;color:#7eb3ff;border-radius:6px;cursor:pointer;font-size:0.78rem;">สร้าง Caption</button>
              <button type="button" onclick="copyThomasSuggestedCaption()" style="padding:0.35rem 0.75rem;background:rgba(16,185,129,0.2);border:1px solid #10b981;color:#6ee7b7;border-radius:6px;cursor:pointer;font-size:0.78rem;">คัดลอก</button>
              <button type="button" onclick="embedThomasSocialMeta()" style="padding:0.35rem 0.75rem;background:rgba(167,139,250,0.2);border:1px solid #a78bfa;color:#c4b5fd;border-radius:6px;cursor:pointer;font-size:0.78rem;">ฝัง Metadata ลง MP4</button>
              <button type="button" onclick="(function(){var t=document.getElementById('thomasSuggestedCaption');var s=document.getElementById('scheduleCaption');if(t&&s)s.value=(t.value||'').replace(/\\n/g,' ').trim().slice(0,500);})()" style="padding:0.35rem 0.75rem;background:rgba(245,158,11,0.15);border:1px solid #f59e0b;color:#fbbf24;border-radius:6px;cursor:pointer;font-size:0.78rem;">ใส่ช่อง Schedule</button>
              <button type="button" onclick="copyThomasTikTokBundle()" style="padding:0.35rem 0.75rem;background:rgba(236,72,153,0.15);border:1px solid #ec4899;color:#f9a8d4;border-radius:6px;cursor:pointer;font-size:0.78rem;">Copy for TikTok</button>
              <button type="button" onclick="auditThomasPreviewMetadata()" style="padding:0.35rem 0.75rem;background:rgba(148,163,184,0.12);border:1px solid #64748b;color:#cbd5e1;border-radius:6px;cursor:pointer;font-size:0.78rem;">Audit Metadata</button>
            </div>
          </div>
        </div>
      </div>

      <div id="thomasSyncModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.92); z-index: 1001; align-items: center; justify-content: center;">
        <div style="background: rgba(20,20,30,0.98); border-radius: 16px; padding: 1.25rem; max-width: 1200px; width: 96%; max-height: 96vh; overflow: auto;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
            <h3 style="color:#7eb3ff;font-size:1rem;">เปรียบเทียบ A / B / C (sync timeline)</h3>
            <button type="button" onclick="closeThomasSyncModal()" style="background:none;border:none;color:#fff;font-size:1.5rem;cursor:pointer;">&times;</button>
          </div>
          <p style="color:#9ca3af;font-size:0.78rem;margin-bottom:0.65rem;">เล่นจากคลิปเดียวกัน — เลือกว่าจะเปิดเสียงแทร็กไหน</p>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;margin-bottom:0.75rem;">
            <div><div style="color:#7eb3ff;font-size:0.72rem;margin-bottom:0.25rem;">A</div><video id="thomasSyncV0" playsinline style="width:100%;max-height:220px;border-radius:8px;background:#000;"></video></div>
            <div><div style="color:#34d399;font-size:0.72rem;margin-bottom:0.25rem;">B</div><video id="thomasSyncV1" playsinline style="width:100%;max-height:220px;border-radius:8px;background:#000;"></video></div>
            <div><div style="color:#fbbf24;font-size:0.72rem;margin-bottom:0.25rem;">C</div><video id="thomasSyncV2" playsinline style="width:100%;max-height:220px;border-radius:8px;background:#000;"></video></div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:center;margin-bottom:0.5rem;">
            <span style="color:#9ca3af;font-size:0.78rem;">เปิดเสียง:</span>
            <label style="font-size:0.78rem;color:#e8e8ef;cursor:pointer;"><input type="radio" name="thomasSyncAudio" value="0" checked onchange="thomasSyncSetAudio(0)" /> A</label>
            <label style="font-size:0.78rem;color:#e8e8ef;cursor:pointer;"><input type="radio" name="thomasSyncAudio" value="1" onchange="thomasSyncSetAudio(1)" /> B</label>
            <label style="font-size:0.78rem;color:#e8e8ef;cursor:pointer;"><input type="radio" name="thomasSyncAudio" value="2" onchange="thomasSyncSetAudio(2)" /> C</label>
          </div>
          <input type="range" id="thomasSyncSeek" min="0" max="1000" value="0" step="1" style="width:100%;margin-bottom:0.35rem;" />
          <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
            <button type="button" onclick="thomasSyncPlayPause()" style="padding:0.35rem 0.85rem;background:rgba(126,179,255,0.2);border:1px solid #7eb3ff;color:#7eb3ff;border-radius:6px;cursor:pointer;font-size:0.8rem;">Play / Pause</button>
          </div>
        </div>
      </div>

      <div id="thomasNavyModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.92); z-index: 1002; align-items: center; justify-content: center;">
        <div style="background: rgba(20,20,30,0.98); border-radius: 16px; padding: 1.25rem; max-width: 720px; width: 94%; max-height: 90vh; overflow: auto;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.65rem;">
            <h3 style="color:#60a5fa;font-size:1rem;margin:0;">Navy — Check Stats</h3>
            <button type="button" onclick="closeThomasNavyModal()" style="background:none;border:none;color:#fff;font-size:1.5rem;cursor:pointer;line-height:1;">&times;</button>
          </div>
          <p id="thomasNavyProjectLabel" style="color:#9ca3af;font-size:0.82rem;margin:0 0 0.5rem;"></p>
          <div id="thomasNavyBody" style="color:#e8e8ef;font-size:0.82rem;min-height:2rem;"></div>
          <p id="thomasNavyNote" style="color:#6b7280;font-size:0.72rem;margin-top:0.85rem;line-height:1.45;"></p>
        </div>
      </div>
      
      <!-- Smart Schedule + Aspect Ratio (NEW) -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:1.5rem;">
        <!-- Best Time to Post -->
        <div class="card" style="background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <h3 style="color:#10b981;font-size:1rem;">⏰ Best Time to Post</h3>
            <button onclick="loadBestPostTimes()" style="background:rgba(16,185,129,0.15);border:1px solid #10b981;color:#10b981;padding:0.3rem 0.7rem;border-radius:6px;cursor:pointer;font-size:0.78rem;">Refresh</button>
          </div>
          <div id="bestPostTimes">
            <div style="margin-bottom:0.5rem;padding:0.5rem;background:rgba(16,185,129,0.1);border-radius:6px;">
              <div style="display:flex;justify-content:space-between;"><span style="color:#e8e8ef;font-size:0.85rem;">Facebook</span><span style="color:#10b981;font-weight:600;font-size:0.85rem;">20:00-22:00</span></div>
              <div style="color:#9ca3af;font-size:0.75rem;">Prime time — highest engagement</div>
            </div>
            <div style="margin-bottom:0.5rem;padding:0.5rem;background:rgba(245,158,11,0.1);border-radius:6px;">
              <div style="display:flex;justify-content:space-between;"><span style="color:#e8e8ef;font-size:0.85rem;">TikTok</span><span style="color:#f59e0b;font-weight:600;font-size:0.85rem;">19:00-23:00</span></div>
              <div style="color:#9ca3af;font-size:0.75rem;">After-dinner entertainment zone</div>
            </div>
            <div style="padding:0.5rem;background:rgba(139,92,246,0.1);border-radius:6px;">
              <div style="display:flex;justify-content:space-between;"><span style="color:#e8e8ef;font-size:0.85rem;">YouTube</span><span style="color:#8b5cf6;font-weight:600;font-size:0.85rem;">20:00-23:00</span></div>
              <div style="color:#9ca3af;font-size:0.75rem;">Evening education binge</div>
            </div>
          </div>
        </div>

        <!-- Aspect Ratio Auto-Adapt -->
        <div class="card" style="background:rgba(126,179,255,0.05);border:1px solid rgba(126,179,255,0.3);">
          <h3 style="color:#7eb3ff;font-size:1rem;margin-bottom:0.75rem;">📐 Aspect Ratio Auto-Adapt</h3>
          <p style="color:#9ca3af;font-size:0.82rem;margin-bottom:0.75rem;">Export 3 sizes automatically when you approve</p>
          <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:0.75rem;">
            <label style="display:flex;align-items:center;gap:0.5rem;color:#e8e8ef;font-size:0.85rem;cursor:pointer;">
              <input type="checkbox" id="ratio916" checked /> 9:16 — TikTok / Reels
            </label>
            <label style="display:flex;align-items:center;gap:0.5rem;color:#e8e8ef;font-size:0.85rem;cursor:pointer;">
              <input type="checkbox" id="ratio169" checked /> 16:9 — YouTube
            </label>
            <label style="display:flex;align-items:center;gap:0.5rem;color:#e8e8ef;font-size:0.85rem;cursor:pointer;">
              <input type="checkbox" id="ratio11" /> 1:1 — Facebook / IG
            </label>
          </div>
          <button onclick="exportAspectRatios()" id="exportRatioBtn" style="width:100%;background:rgba(126,179,255,0.15);border:1px solid #7eb3ff;color:#7eb3ff;padding:0.5rem;border-radius:6px;cursor:pointer;font-size:0.85rem;" disabled>Select videos above first</button>
          <div id="exportRatioStatus" style="margin-top:0.5rem;font-size:0.8rem;color:#9ca3af;"></div>
        </div>
      </div>

      <div class="scheduler">
        <h2>Schedule Distribution</h2>
        <div class="schedule-form">
          <div class="form-group">
            <label>Selected Videos: <span id="selectedCount">0</span></label>
          </div>
          <div class="form-group">
            <label>Platforms</label>
            <div class="platform-checks">
              <label><input type="checkbox" name="platform" value="facebook" checked /> Facebook</label>
              <label><input type="checkbox" name="platform" value="tiktok" checked /> TikTok</label>
              <label><input type="checkbox" name="platform" value="instagram" /> Instagram</label>
              <label><input type="checkbox" name="platform" value="youtube" /> YouTube</label>
            </div>
          </div>
          <div class="form-group">
            <label>Schedule Date & Time <span id="suggestedTimeHint" style="color:#10b981;font-size:0.8rem;"></span></label>
            <input type="datetime-local" id="scheduleTime" />
            <button type="button" onclick="applyThomasBestPostTime()" style="margin-top:0.35rem;padding:0.3rem 0.65rem;background:rgba(16,185,129,0.12);border:1px solid #10b981;color:#6ee7b7;border-radius:6px;cursor:pointer;font-size:0.75rem;">แนะนำเวลา (Navy Best Time)</button>
          </div>
          <div class="form-group">
            <label>Target Post Time (โน้ต / คิว) <span style="color:#6b7280;font-size:0.72rem;">บันทึกใน schedule.json</span></label>
            <input type="text" id="targetPostTimeNote" placeholder="เช่น: TikTok หัวค่ำ ~21:00 ไทย — ลำดับความสำคัญสูง" style="width:100%;padding:0.45rem;background:rgba(30,30,50,0.9);border:1px solid #3a3a5e;border-radius:6px;color:#e8e8ef;font-size:0.82rem;box-sizing:border-box;" />
          </div>
          <div class="form-group">
            <label>Caption (Optional)</label>
            <input type="text" id="scheduleCaption" placeholder="เช่น: เรียนออนไลน์ยุคใหม่กับ Aqond" />
          </div>
          <div class="form-group">
            <label>Social Sync Webhook <span id="socialWebhookStatus" style="color:#6b7280;font-size:0.72rem;"></span></label>
            <input type="url" id="socialWebhookOverride" placeholder="ทับค่า .env ชั่วคราว (ว่าง = ใช้ SOCIAL_SYNC_WEBHOOK_URL)" style="width:100%;padding:0.45rem;background:rgba(30,30,50,0.9);border:1px solid #3a3a5e;border-radius:6px;color:#e8e8ef;font-size:0.78rem;box-sizing:border-box;" />
            <label style="display:flex;align-items:center;gap:0.4rem;margin-top:0.35rem;color:#9ca3af;font-size:0.74rem;cursor:pointer;">
              <input type="checkbox" id="webhookRequirePinky" checked /> Webhook: ส่งเฉพาะโปรเจกต์ที่ pinky_approved
            </label>
          </div>
          <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:center;">
            <button class="btn-large" onclick="schedulePost()">Schedule Selected</button>
            <button type="button" class="btn-large" style="background:linear-gradient(135deg,#ec4899,#a855f7);border:1px solid #e879f9;color:#fce7f3;" onclick="pushSelectedToSocialWebhook()">Push to Social Sync</button>
            <button type="button" class="btn-large" style="background:rgba(16,185,129,0.18);border:1px solid #10b981;color:#6ee7b7;" onclick="approveSelectedToQueue(false)">อนุมัติที่เลือก → คิวโพสต์</button>
            <button type="button" class="btn-large" style="background:rgba(245,158,11,0.15);border:1px solid #f59e0b;color:#fbbf24;" onclick="approveSelectedToQueue(true)" title="ตั้ง pinky_approved ให้โปรเจกต์ที่ยังไม่ผ่านระบบ — ใช้เมื่อคุณติ๊ก Checklist QC แล้ว">คิว + เชื่อ Checklist QC</button>
            <button type="button" class="btn-large" style="background:rgba(59,130,246,0.25);border:1px solid #3b82f6;color:#93c5fd;" onclick="processDueSchedule()">Run due scheduled posts</button>
            <button class="btn-large" style="background:linear-gradient(135deg,#10b981 0%,#34d399 100%);" onclick="approveAndPostAll()">Approve &amp; Post All (Zero-Touch)</button>
            <button type="button" class="btn-sm" style="background:rgba(55,65,81,0.6);border:1px solid #4b5563;color:#9ca3af;" onclick="thomasCleanupBulk()">ล้าง variant เก่า (ทุกโปรเจกต์)</button>
            <button type="button" class="btn-sm" style="background:rgba(59,130,246,0.2);border:1px solid #3b82f6;color:#93c5fd;" onclick="thomasCleanupSelected()">ล้าง variant ที่เลือก</button>
          </div>
          <p style="color:#9ca3af;font-size:0.78rem;margin-top:0.6rem;">Schedule บันทึกลง <code style="color:#7eb3ff;">output/schedule.json</code> — กด &quot;Run due&quot; เมื่อถึงเวลา (หรือตั้งเวลาเป็นอดีตเพื่อทดสอบ)</p>
        </div>
      </div>
    </div>
  </div>

  <div id="dailySuggestModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:1200;align-items:center;justify-content:center;padding:1rem;">
    <div style="background:rgba(20,24,48,0.98);border:1px solid #4c1d95;border-radius:16px;max-width:640px;width:100%;max-height:90vh;overflow:auto;padding:1.25rem;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.75rem;margin-bottom:0.75rem;">
        <h3 style="color:#c4b5fd;margin:0;font-size:1.05rem;">Minnie — ไอเดียต่อยอดวันนี้</h3>
        <button type="button" onclick="closeDailySuggestModal(true)" style="background:none;border:none;color:#fff;font-size:1.4rem;cursor:pointer;line-height:1;">&times;</button>
      </div>
      <p id="dailySuggestSummary" style="color:#9ca3af;font-size:0.82rem;line-height:1.5;margin:0 0 0.75rem;"></p>
      <div id="dailySuggestTableWrap" style="max-height:320px;overflow:auto;border:1px solid #334155;border-radius:8px;"></div>
      <p style="color:#6b7280;font-size:0.72rem;margin:0.65rem 0 0;">กดเริ่มโปรเจกต์ = เติม Structured Brief แล้วรัน Create (เหมือน Brainstorm)</p>
    </div>
  </div>
  
  <script>
    /* ============================================================
       GLOBAL STATE
    ============================================================ */
    let ws = null;
    let currentProject = null;
    let currentStructuredBrief = null;
    let selectedVideos = new Set();
    let scriptLastSavedSnapshot = '';
    let scriptDirty = false;
    window._masterAssemblyPending = false;
    window._masterAssemblyPendingProjectId = null;

    /* ============================================================
       ROCKY LIVE HERO + MASTER CELEBRATION (Final Master Assembly)
    ============================================================ */
    function updateRockyLiveHero(text) {
      var el = document.getElementById('rockyLiveHero');
      if (!el) return;
      var t = (text || '').trim();
      if (!t) {
        el.style.display = 'none';
        el.textContent = '';
        return;
      }
      el.style.display = 'block';
      el.textContent = t;
    }
    function friendlyRockyHeroLine(data) {
      var ph = (data && data.phase) ? String(data.phase) : '';
      var si = (data.scene_index != null) ? data.scene_index : null;
      var ts = (data.total_scenes != null) ? data.total_scenes : null;
      var scn = (si != null) ? (si + 1) : null;
      var vk = data.variant_key || '';
      var tk = data.take || '';
      if (ph === 'visual_start') return '🎬 Rocky is warming up the cameras…';
      if (ph === 'scene_work') return '🎥 Rocky is filming Scene ' + (scn != null ? scn : '?') + (ts ? (' of ' + ts) : '') + '…';
      if (ph === 'scene_saved') return '✅ Scene ' + (scn != null ? scn : '?') + ' in the can — rolling onward…';
      if (ph === 'visual_done') return '🎞️ All scenes captured — heading to the edit bay…';
      if (ph === 'scene_clip_missing') return '⚠️ Scene ' + (scn != null ? scn : '?') + ' needs a clip — check Grok…';
      if (ph === 'scene_regen_start') return '🔄 Regenerating Take A for Scene ' + (scn != null ? scn : '?') + '…';
      if (ph === 'scene_regen_done') return '✅ Take A refreshed for Scene ' + (scn != null ? scn : '?') + '…';
      if (ph === 'scene_regen_failed') return 'Scene regen hit a snag — see the log…';
      if (ph === 'regen_all_start') return '🔄 Regen All — updating Take A on every shot…';
      if (ph === 'regen_all_done') return '✅ Full regen complete — review your storyboard…';
      if (ph === 'take_gen_start') return '🎬 Rolling ' + (tk || 'extra take') + ' for Scene ' + (scn != null ? scn : '?') + ' — Pinky will QC…';
      if (ph === 'take_gen_done') return '✨ New take landed — pick A / B / C…';
      if (ph === 'take_gen_failed') return 'Take gen stumbled — try again in a moment…';
      if (ph === 'edit_start') return '✂️ Rocky is assembling your master timeline…';
      if (ph === 'edit_variant_start') return '🎨 Rendering ' + (vk || 'variant') + ' — Pinky is watching quality…';
      if (ph === 'edit_variant_progress') return '🎨 ' + (vk || 'Variant') + (data.progress_pct != null ? (' · ' + data.progress_pct + '%') : ' — still rendering…');
      if (ph === 'edit_variant_done') return '✅ ' + (vk || 'Variant') + ' is locked in…';
      if (ph === 'edit_variant_failed') return 'Variant render failed — check disk / ffmpeg…';
      if (ph === 'edit_all_done') return '🏁 Variants ready — ship to Thomas…';
      if (ph === 'edit_cancelled') return 'Render stopped — queue cleared…';
      if (ph === 'edit_variants_skipped') return '🎙️ Skipping A/B/C — no narration file; single-render mode…';
      if (ph === 'edit_error' || ph === 'edit_fallback') return 'Rocky hit a snag — check the log…';
      if (ph === 'grok_done') return '🎥 Grok delivered a clip — moving to QC…';
      if (ph === 'grok_sdk_start') return '🎥 Grok is generating the next shot…';
      if (ph === 'grok_retry_download') return '⬇️ Pulling a fresh take from Grok…';
      if (ph === 'edit_skipped') return 'Another render is running — hang tight…';
      if (ph === 'visual_failed') return 'Rocky could not finish visuals — check logs…';
      return '';
    }
    function playTaDaSound() {
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        var ctx = new Ctx();
        var now = ctx.currentTime;
        var freqs = [523.25, 659.25, 783.99];
        freqs.forEach(function(f, i) {
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = f;
          g.gain.setValueAtTime(0, now);
          g.gain.linearRampToValueAtTime(0.12, now + 0.02 + i * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.45 + i * 0.08);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(now + i * 0.08);
          o.stop(now + 0.55 + i * 0.08);
        });
        setTimeout(function() { try { ctx.close(); } catch (e) {} }, 900);
      } catch (e) {}
    }
    function showMasterCelebration(videoUrl) {
      var ov = document.getElementById('masterCelebrationOverlay');
      var vid = document.getElementById('masterCelebrationVideo');
      if (!ov || !vid || !videoUrl) return;
      vid.src = videoUrl;
      try { vid.play(); } catch (e) {}
      ov.style.display = 'flex';
      playTaDaSound();
      if (typeof confetti === 'function') {
        confetti({ particleCount: 110, spread: 76, origin: { y: 0.65 }, colors: ['#a78bfa', '#34d399', '#f472b6', '#fde047'] });
        setTimeout(function() {
          confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0, y: 0.65 }, colors: ['#7eb3ff', '#ec4899'] });
        }, 220);
        setTimeout(function() {
          confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1, y: 0.65 }, colors: ['#22d3ee', '#fbbf24'] });
        }, 400);
      }
    }
    function closeMasterCelebration() {
      var ov = document.getElementById('masterCelebrationOverlay');
      var vid = document.getElementById('masterCelebrationVideo');
      if (vid) {
        try { vid.pause(); } catch (e) {}
        vid.removeAttribute('src');
        try { vid.load(); } catch (e2) {}
      }
      if (ov) ov.style.display = 'none';
    }
    window.closeMasterCelebration = closeMasterCelebration;
    window.showMasterCelebration = showMasterCelebration;

    /* ============================================================
       TOAST NOTIFICATION — visible feedback on every action
    ============================================================ */
    function showToast(msg, type) {
      type = type || 'info';
      const colors = {success:'#10b981', error:'#ef4444', info:'#7eb3ff', warn:'#f59e0b'};
      const t = document.createElement('div');
      t.style.cssText = [
        'position:fixed;bottom:24px;right:24px;z-index:9999;',
        'padding:0.75rem 1.25rem;border-radius:10px;max-width:380px;',
        'font-size:0.9rem;font-weight:600;color:#fff;cursor:pointer;',
        'box-shadow:0 4px 20px rgba(0,0,0,0.4);',
        'background:' + (colors[type]||colors.info) + ';',
        'animation:slideIn 0.3s ease-out;'
      ].join('');
      t.innerHTML = msg;
      t.onclick = () => t.remove();
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 5000);
    }

    /* ============================================================
       PINKY INLINE REVIEW PANEL
    ============================================================ */
    function showPinkyReviewInline(data, mode) {
      const panel = document.getElementById('pinkyScriptReview');
      const scoreEl = document.getElementById('pinkyScriptScore');
      const statusEl = document.getElementById('pinkyScriptStatus');
      const feedbackEl = document.getElementById('pinkyScriptFeedback');
      const issuesEl = document.getElementById('pinkyScriptIssues');
      if (!panel) return;

      panel.style.display = 'block';
      const score = data.score || 0;
      const approved = data.approved;
      const scoreColor = score >= 8 ? '#10b981' : score >= 6 ? '#f59e0b' : '#ef4444';

      if (scoreEl) scoreEl.innerHTML = `<span style="color:${scoreColor};font-size:1.3rem;font-weight:700;">${score}</span>`;
      if (statusEl) statusEl.innerHTML = approved
        ? '<span style="color:#10b981;font-weight:700;">APPROVED</span>'
        : '<span style="color:#ef4444;font-weight:700;">REJECTED — Auto-fixed</span>';
      if (feedbackEl) feedbackEl.textContent = data.feedback || '';

      if (issuesEl && data.issues && data.issues.length) {
        issuesEl.innerHTML = '<ul style="margin:0.5rem 0 0 0;padding-left:1.2rem;color:#ef4444;font-size:0.82rem;">'
          + data.issues.map(i => `<li>${i}</li>`).join('') + '</ul>';
      }

      var scriptPb = document.getElementById('scriptPinkyBadge');
      if (scriptPb) scriptPb.textContent = 'Pinky: ' + score + '/10' + (approved ? ' ✓' : '');

      // Visual hint for Send to Rocky (คลิกได้เสมอ — เซิร์ฟเวอร์ gate คะแนน Pinky)
      const rockyBtn = document.getElementById('sendToRockyBtn');
      if (rockyBtn) {
        rockyBtn.disabled = false;
        rockyBtn.style.opacity = approved ? '1' : '0.65';
        rockyBtn.textContent = approved ? '🎬 Send to Rocky' : '🔒 Send to Rocky (Pinky < 8)';
      }

      showToast(approved ? 'Pinky APPROVED (' + score + '/10)' : 'Pinky REJECTED (' + score + '/10) — Script auto-fixed!',
                approved ? 'success' : 'warn');
    }

    function updateWsStatusIndicator() {
      var wrap = document.getElementById('minnieWsDot');
      var led = wrap && wrap.querySelector && wrap.querySelector('.minnie-ws-led');
      var txt = document.getElementById('minnieWsStatusText');
      var ok = ws && ws.readyState === 1;
      if (led) led.style.background = ok ? '#10b981' : '#ef4444';
      if (txt) txt.textContent = ok ? 'Real-time ON' : 'Real-time OFF';
      if (wrap) wrap.title = ok ? 'WebSocket เชื่อมต่อ — แชท Minnie พร้อม' : 'WebSocket ไม่เชื่อมต่อ — แชท/บางอัปเดตอาจไม่ทำงาน (รีเฟรชหน้า)';
    }

    function refreshScriptEditorChrome() {
      var ta = document.getElementById('scriptContent');
      var t = (ta && ta.value) || '';
      var cc = document.getElementById('scriptCharCount');
      if (cc) cc.textContent = t.length.toLocaleString() + ' ตัวอักษร · ~' + Math.max(1, Math.round(t.length / 22)) + ' บรรทัดโดยประมาณ';
      var db = document.getElementById('scriptDirtyBadge');
      if (db) db.style.display = scriptDirty ? 'inline' : 'none';
      updateScriptTimeline();
    }

    function updateScriptTimeline() {
      var ta = document.getElementById('scriptContent');
      var wrap = document.getElementById('scriptTimelineWrap');
      var track = document.getElementById('scriptTimelineTrack');
      var leg = document.getElementById('scriptTimelineLegend');
      var totEl = document.getElementById('scriptTimelineTotal');
      var hint = document.getElementById('scriptTimelineHint');
      if (!ta || !wrap || !track) return;
      var text = ta.value || '';
      var re = new RegExp('\[(\d+)\s*-\s*(\d+)\s*s\]', 'gi');
      var m, segs = [];
      while ((m = re.exec(text)) !== null) {
        var a = parseInt(m[1], 10), b = parseInt(m[2], 10);
        if (!isNaN(a) && !isNaN(b)) {
          var s = Math.min(a, b), e = Math.max(a, b);
          segs.push({ start: s, end: e, label: m[0] });
        }
      }
      if (!segs.length) {
        wrap.style.display = 'none';
        return;
      }
      wrap.style.display = 'block';
      var maxT = 0;
      segs.forEach(function(seg) { if (seg.end > maxT) maxT = seg.end; });
      if (maxT < 1) maxT = 45;
      if (totEl) totEl.textContent = String(maxT);
      if (hint) hint.textContent = '(' + segs.length + ' ช่วง)';
      track.innerHTML = '';
      var colors = ['#4c6fff', '#a78bfa', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#f97316'];
      segs.forEach(function(seg, i) {
        var left = (seg.start / maxT) * 100;
        var w = Math.max(0.6, ((seg.end - seg.start) / maxT) * 100);
        var d = document.createElement('div');
        d.style.cssText = 'position:absolute;left:' + left + '%;width:' + w + '%;top:5px;height:24px;border-radius:6px;background:' + colors[i % colors.length] + ';opacity:0.88;box-shadow:0 0 0 1px rgba(0,0,0,0.25);cursor:default;transition:transform 0.15s;';
        d.title = seg.label + ' → ' + (seg.end - seg.start) + 's';
        d.onmouseenter = function() { this.style.transform = 'scaleY(1.08)'; };
        d.onmouseleave = function() { this.style.transform = 'none'; };
        track.appendChild(d);
      });
      var ticks = document.createElement('div');
      ticks.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:4px;background:linear-gradient(90deg,transparent 0%,rgba(126,179,255,0.15) 50%,transparent 100%);pointer-events:none;';
      track.appendChild(ticks);
      if (leg) {
        var uniq = [];
        segs.forEach(function(s) { if (uniq.indexOf(s.label) < 0 && uniq.length < 8) uniq.push(s.label); });
        leg.textContent = uniq.join(' · ');
      }
    }

    function setMinnieFocusMode(on, opts) {
      opts = opts || {};
      var root = document.getElementById('minnieStudioRoot');
      var ban = document.getElementById('minnieFocusBanner');
      var btn = document.getElementById('minnieFocusToggleBtn');
      if (!root) return;
      if (on) {
        root.classList.add('focus-mode');
        if (ban) ban.style.display = 'flex';
        if (btn) { btn.textContent = '✓ โฟกัส'; btn.style.opacity = '0.6'; }
        try { localStorage.setItem('minnieFocusMode', '1'); } catch (e) {}
        if (!opts.silent) showToast('โหมดโฟกัส — แก้บทเต็มพื้นที่', 'info');
      } else {
        root.classList.remove('focus-mode');
        if (ban) ban.style.display = 'none';
        if (btn) { btn.textContent = '🎯 โหมดโฟกัส'; btn.style.opacity = '1'; }
        try { localStorage.setItem('minnieFocusMode', '0'); } catch (e) {}
      }
    }

    function escapeHtmlMinnie(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function showPinkyDiffPanel(before, after) {
      if (before == null) before = '';
      if (after == null) after = '';
      var panel = document.getElementById('pinkyDiffPanel');
      if (!panel) return;
      if (before === after) {
        panel.style.display = 'none';
        return;
      }
      panel.style.display = 'block';
      var bl = before.split(/\\r?\\n/);
      var al = after.split(/\\r?\\n/);
      var sum = document.getElementById('pinkyDiffSummary');
      if (sum) {
        sum.textContent = 'บรรทัด ' + bl.length + ' → ' + al.length + ' · ตัวอักษร ' + before.length.toLocaleString() + ' → ' + after.length.toLocaleString() + ' · บรรทัดที่ต่าง (ตำแหน่งเดียวกัน):';
      }
      var html = [];
      var maxL = Math.max(bl.length, al.length);
      var shown = 0;
      for (var i = 0; i < maxL && shown < 28; i++) {
        var o = bl[i], n = al[i];
        if (o === n) continue;
        shown += 2;
        html.push('<div style="margin:0.15rem 0;"><span style="color:#f87171;font-weight:700;">−</span> ' + escapeHtmlMinnie((o || '').slice(0, 200)) + '</div>');
        html.push('<div style="margin:0.15rem 0;"><span style="color:#4ade80;font-weight:700;">+</span> ' + escapeHtmlMinnie((n || '').slice(0, 200)) + '</div>');
      }
      if (!html.length) html.push('<div style="color:#9ca3af;">โครงสร้างเปลี่ยนมาก — ดูบทเต็มในกล่องด้านล่าง</div>');
      var un = document.getElementById('pinkyDiffUnified');
      if (un) un.innerHTML = html.join('');
      var pb = document.getElementById('pinkyDiffBefore');
      var pa = document.getElementById('pinkyDiffAfter');
      if (pb) pb.textContent = before.slice(0, 12000);
      if (pa) pa.textContent = after.slice(0, 12000);
    }

    function markScriptBaselineFromServer(text) {
      scriptLastSavedSnapshot = typeof text === 'string' ? text : '';
      scriptDirty = false;
      refreshScriptEditorChrome();
    }

    function copyScriptToClipboard() {
      var ta = document.getElementById('scriptContent');
      if (!ta || !ta.value) { showToast('ไม่มีข้อความให้คัดลอก', 'warn'); return; }
      navigator.clipboard.writeText(ta.value).then(function() {
        showToast('คัดลอกบทแล้ว', 'success');
      }).catch(function() {
        showToast('คัดลอกไม่ได้ — ลองเลือกข้อความแล้ว Ctrl+C', 'error');
      });
    }

    function applyScriptContextFromApi(data) {
      var pb = document.getElementById('scriptPinkyBadge');
      var st = document.getElementById('scriptStateBadge');
      var pr = (data && data.pinky_script_review) || {};
      var sc = typeof pr.score === 'number' ? pr.score : (pr.score != null ? parseInt(pr.score, 10) : NaN);
      if (pb) {
        if (!isNaN(sc)) pb.textContent = 'Pinky: ' + sc + '/10' + (pr.approved ? ' ✓' : '');
        else pb.textContent = 'Pinky: ยังไม่ตรวจ';
      }
      if (st) st.textContent = 'สถานะ: ' + ((data && data.state) || '—');
      var rockyBtn = document.getElementById('sendToRockyBtn');
      if (rockyBtn) {
        if (!isNaN(sc)) {
          var appr = sc >= 8;
          rockyBtn.style.opacity = appr ? '1' : '0.65';
          rockyBtn.textContent = appr ? '🎬 Send to Rocky' : '🔒 Send to Rocky (Pinky < 8)';
        } else {
          rockyBtn.style.opacity = '0.65';
          rockyBtn.textContent = '🔒 Send to Rocky (Pinky < 8)';
        }
      }
    }

    async function loadProjectsFromHttp() {
      try {
        const r = await fetch('/api/projects');
        if (!r.ok) {
          const sel = document.getElementById('projectSelect');
          if (sel) sel.innerHTML = '<option value="">โหลดรายการไม่สำเร็จ (HTTP ' + r.status + ') — กด ↻ รีเฟรชโปรเจกต์</option>';
          return;
        }
        const data = await r.json();
        if (data.projects && Array.isArray(data.projects)) updateProjects(data.projects);
      } catch (e) {
        console.error('[Projects HTTP]', e);
        const sel = document.getElementById('projectSelect');
        if (sel) sel.innerHTML = '<option value="">เครือข่ายผิดพลาด — กด ↻ หรือรีเฟรชหน้า</option>';
      }
    }
    
    function connectWS() {
      var wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(wsProto + '//' + location.host + '/ws');
      
      ws.onopen = () => {
        console.log('[WS] Connected');
        loadProjects();
        updateWsStatusIndicator();
        loadFactoryQueue(false);
        if (window.__factoryQueueInterval) clearInterval(window.__factoryQueueInterval);
        window.__factoryQueueInterval = setInterval(function() { loadFactoryQueue(false); }, 45000);
      };
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'projects') {
          updateProjects(data.projects);
        } else if (data.type === 'chat_response') {
          addChatMessage('minnie', data.message);
          if (data.updated_script) {
            document.getElementById('scriptContent').value = data.updated_script;
            markScriptBaselineFromServer(data.updated_script);
            refreshScriptEditorChrome();
          }
        } else if (data.type === 'scenes_updated') {
          if (data.project_id && currentProject === data.project_id) {
            loadStoryboard(currentProject);
          } else if (data.project_id && data.project_id !== currentProject) {
            showToast('โปรเจกต์ ' + data.project_id + ' — คลิป/ฉากพร้อมแล้ว (Rocky)', 'info');
          }
          loadFactoryQueue(false);
        } else if (data.type === 'scene_updated') {
          // Single scene updated — refresh that card only
          if (currentProject === data.project_id) {
            setTimeout(() => loadStoryboard(currentProject), 2000);
          }
        } else if (data.type === 'script_ready') {
          // Minnie finished writing — auto-load script into editor
          if (!currentProject || currentProject === data.project_id) {
            currentProject = data.project_id;
            const sel = document.getElementById('projectSelect');
            if (sel) sel.value = data.project_id;
            loadProjectScript(data.project_id);
          }
          showToast('Minnie finished! Script ready in editor.', 'success');
        } else if (data.type === 'render_complete') {
          const vcount = data.variant_count || 1;
          const pid = data.project_id;
          var pendingMatch = !!(pid && window._masterAssemblyPending && window._masterAssemblyPendingProjectId === pid);
          if (pendingMatch) {
            window._masterAssemblyPending = false;
            window._masterAssemblyPendingProjectId = null;
          }
          if (pid && typeof currentProject !== 'undefined' && pid !== currentProject) {
            showToast('โปรเจกต์ ' + pid + ' เรนเดอร์เสร็จแล้ว (' + vcount + ' variant) → Thomas', 'success');
          } else {
            showToast('Render complete! ' + vcount + ' variant(s) ready in Thomas tab.', 'success');
          }
          if (pendingMatch && data.video_url && pid === currentProject) {
            showMasterCelebration(data.video_url);
          }
          window._rockyShowVariantBarsUntilDone = null;
          if (pid) resetRockyVariantProgress(pid);
          loadProjects();
          loadDoneVideos();
          loadFactoryQueue(false);
        } else if (data.type === 'variant_updated') {
          if (data.project_id && typeof currentProject !== 'undefined' && data.project_id !== currentProject) {
            showToast('โปรเจกต์ ' + data.project_id + ' — อัปเดต variant ' + (data.variant_key || '') + ' แล้ว (Thomas)', 'success');
          } else {
            showToast('Quick Re-edit done! Variant ' + data.variant_key + ' updated.', 'success');
          }
          loadDoneVideos();
        } else if (data.type === 'pinky_review_complete') {
          const approved = data.approved;
          showPinkyReviewInline(data, 'video');
          if (!approved) loadDoneVideos();
        } else if (data.type === 'pinky_script_review') {
          var prevScr = '';
          if (currentProject === data.project_id) {
            var tEl = document.getElementById('scriptContent');
            prevScr = tEl ? tEl.value : '';
          }
          showPinkyReviewInline(data, 'script');
          if (currentProject === data.project_id && data.auto_fixed_script) {
            if (prevScr !== data.auto_fixed_script) showPinkyDiffPanel(prevScr, data.auto_fixed_script);
            document.getElementById('scriptContent').value = data.auto_fixed_script;
            markScriptBaselineFromServer(data.auto_fixed_script);
            updateScriptTimeline();
          } else if (currentProject === data.project_id) {
            loadProjectScript(currentProject);
          }
        } else if (data.type === 'batch_gen_progress') {
          if (data.project_id === currentProject) {
            var bar = document.getElementById('batchProgressBar');
            var fill = document.getElementById('batchProgressFill');
            var lbl = document.getElementById('batchProgressLabel');
            if (bar && fill && lbl) {
              bar.style.display = 'block';
              var tot = (data.total != null) ? data.total : 1;
              var cur = (data.shot_index != null) ? (data.shot_index + 1) : (data.current || 0);
              if (data.phase === 'batch_done') {
                fill.style.width = '100%';
                lbl.textContent = data.message || 'Batch done';
                updateRockyLiveHero('🎉 Batch complete — review your storyboard…');
                loadStoryboard(data.project_id);
              } else if (data.phase === 'batch_skip') {
                lbl.textContent = data.message || ('Skip shot ' + (data.shot_index + 1));
                var pctS = Math.min(100, Math.round(100 * (data.shot_index + 1) / Math.max(1, tot)));
                fill.style.width = pctS + '%';
                updateRockyLiveHero('⏭️ Skipping a locked shot — ' + (lbl.textContent || '') + '…');
              } else if (data.phase === 'batch_shot_done') {
                var pctD = Math.min(100, Math.round(100 * (data.shot_index + 1) / Math.max(1, tot)));
                fill.style.width = pctD + '%';
                lbl.textContent = data.message || ('Shot ' + (data.shot_index + 1) + '/' + tot);
                updateRockyLiveHero((data.ok ? '📼 ' : '⚠️ ') + 'Shot ' + (data.shot_index + 1) + '/' + tot + ' — ' + (data.ok ? 'Rocky is moving to the next setup…' : 'needs a retry…'));
              } else {
                var pctB = Math.min(100, Math.round(100 * cur / Math.max(1, tot)));
                fill.style.width = pctB + '%';
                lbl.textContent = data.message || ('Processing shot ' + cur + ' of ' + tot);
                if (data.phase === 'batch_start') {
                  updateRockyLiveHero('🚀 Batch production launched — ' + tot + ' shots queued…');
                } else {
                  updateRockyLiveHero('🎥 Batch: ' + lbl.textContent + '…');
                }
              }
            }
          }
        } else if (data.type === 'rocky_live') {
          var pid = data.project_id;
          if (pid) {
            if (data.phase === 'edit_start') {
              window._rockyShowVariantBarsUntilDone = pid;
              resetRockyVariantProgress(pid);
            }
            if (data.phase === 'edit_skipped' || data.phase === 'edit_all_done' || data.phase === 'edit_error' || data.phase === 'edit_variants_skipped') window._rockyShowVariantBarsUntilDone = null;
            if (data.variant_key && (data.progress_pct != null || data.phase === 'edit_variant_done' || data.phase === 'edit_variant_failed')) {
              var pct = data.progress_pct;
              if (pct == null) {
                if (data.phase === 'edit_variant_done') pct = 100;
                else if (data.phase === 'edit_variant_failed') pct = 0;
              }
              if (pct != null) setRockyVariantProgressPct(pid, data.variant_key, pct);
            }
          }
          var forLog = !pid || !currentProject || pid === currentProject;
          if (forLog) {
            var panel = document.getElementById('rockyFluxConsole');
            var logEl = document.getElementById('rockyFluxLog');
            var phaseEl = document.getElementById('rockyFluxPhase');
            if (panel && logEl && phaseEl) {
              panel.style.display = 'block';
              var ph = (data.phase || 'live').replace(/_/g, ' ');
              phaseEl.textContent = ph + (data.variant_key ? (' · ' + data.variant_key) : '') + (data.grok_status ? (' · ' + data.grok_status) : '');
              var msg = data.message || '';
              if (data.scene_index != null && data.total_scenes != null) {
                msg = (msg ? msg + ' ' : '') + '[ฉาก ' + (data.scene_index + 1) + '/' + data.total_scenes + ']';
              } else if (data.scene_index != null) {
                msg = (msg ? msg + ' ' : '') + '[ฉาก ' + (data.scene_index + 1) + ']';
              }
              if (data.elapsed_sec != null) msg = (msg ? msg + ' ' : '') + '(' + data.elapsed_sec + 's)';
              var ts = new Date().toLocaleTimeString();
              var line = '[' + ts + '] ' + ph + (msg ? ' — ' + msg : '');
              var acc = (logEl.textContent ? logEl.textContent + '\\n' : '') + line;
              logEl.textContent = acc.slice(-4500);
              logEl.scrollTop = logEl.scrollHeight;
              var heroLine = friendlyRockyHeroLine(data);
              if (data.phase === 'edit_error' && data.message) {
                heroLine = '⚠️ ' + String(data.message).slice(0, 280);
              } else if (!heroLine && data.message) heroLine = '✨ ' + String(data.message);
              updateRockyLiveHero(heroLine);
            }
          }
          if (currentProject === pid) refreshRockyVariantBarsDom(pid);
          if (data.phase === 'edit_skipped') showToast((data.message || 'Rocky กำลังเรนเดอร์อยู่แล้ว'), 'warn');
          if (data.phase === 'edit_cancelled' && forLog) showToast(data.message || 'Rocky: หยุดการเรนเดอร์แล้ว', 'warn');
          if (data.phase === 'visual_done' || data.phase === 'edit_all_done' || data.phase === 'visual_failed' ||
              data.phase === 'scene_saved' || data.phase === 'scene_regen_done' || data.phase === 'take_gen_done') {
            if (currentProject === data.project_id) loadStoryboard(data.project_id);
          }
        }
      };
      
      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
        updateWsStatusIndicator();
        loadProjectsFromHttp();
      };
      ws.onclose = () => {
        console.log('[WS] Disconnected — reconnecting...');
        updateWsStatusIndicator();
        loadProjectsFromHttp();
        setTimeout(connectWS, 3000);
      };
    }
    
    
    // === NAVY INTELLIGENCE FUNCTIONS (GLOBAL) ===
    window.loadNavyIntelligence = async function() {
      console.log('[Navy] Loading intelligence...');
      
      try {
        // Load news
        console.log('[Navy] Fetching news...');
        const newsResp = await fetch('/api/navy/news');
        console.log('[Navy] News response:', newsResp.status);
        if (newsResp.ok) {
          const news = await newsResp.json();
          console.log('[Navy] News loaded:', news.length, 'items');
          renderNavyNews(news);
        } else {
          document.getElementById('navy-news-feed').innerHTML = '<p style="color: #ef4444;">Failed to load news</p>';
        }
        
        // Load trends
        console.log('[Navy] Fetching trends...');
        const trendsResp = await fetch('/api/navy/trends');
        console.log('[Navy] Trends response:', trendsResp.status);
        if (trendsResp.ok) {
          const trends = await trendsResp.json();
          console.log('[Navy] Trends loaded:', trends.length, 'items');
          renderNavyTrends(trends);
        } else {
          document.getElementById('navy-trends').innerHTML = '<p style="color: #ef4444;">Failed to load trends</p>';
        }
        
        // Load predictions
        console.log('[Navy] Fetching predictions...');
        const predResp = await fetch('/api/navy/predictions');
        console.log('[Navy] Predictions response:', predResp.status);
        if (predResp.ok) {
          const predictions = await predResp.json();
          console.log('[Navy] Predictions loaded:', predictions.length, 'items');
          renderNavyPredictions(predictions);
        } else {
          document.getElementById('navy-predictions').innerHTML = '<p style="color: #ef4444;">Failed to load predictions</p>';
        }
        
        console.log('[Navy] All data loaded successfully!');
      } catch (e) {
        console.error('[Navy] Load error:', e);
        document.getElementById('navy-news-feed').innerHTML = '<p style="color: #ef4444;">Error: ' + e.message + '</p>';
      }
    };
    
    function renderNavyNews(news) {
      const container = document.getElementById('navy-news-feed');
      if (!news || news.length === 0) {
        container.innerHTML = '<p style="color: #666;">No news available</p>';
        return;
      }
      
      container.innerHTML = news.slice(0, 10).map(item => `
        <div style="margin-bottom: 1rem; padding: 0.75rem; background: rgba(40, 40, 60, 0.3); border-radius: 6px; border-left: 3px solid #7eb3ff;">
          <div style="font-weight: 600; margin-bottom: 0.25rem;">${item.title}</div>
          <div style="color: #9ca3af; font-size: 0.85rem;">${item.source} • ${item.date || 'Today'}</div>
          ${item.importance ? `<div style="margin-top: 0.5rem;"><span style="background: ${item.importance >= 8 ? '#ef4444' : item.importance >= 6 ? '#f59e0b' : '#10b981'}; color: #fff; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">Importance: ${item.importance}/10</span></div>` : ''}
        </div>
      `).join('');
    }
    
    function renderNavyTrends(trends) {
      const container = document.getElementById('navy-trends');
      if (!trends || trends.length === 0) {
        container.innerHTML = '<p style="color: #666;">No trends detected</p>';
        return;
      }
      
      container.innerHTML = trends.slice(0, 8).map((trend, i) => `
        <div style="margin-bottom: 0.75rem; padding: 0.75rem; background: rgba(167, 139, 250, 0.1); border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="flex: 1;">
              <div style="font-weight: 600;">${trend.topic}</div>
              <div style="color: #9ca3af; font-size: 0.85rem; margin-top: 0.25rem;">${trend.description || ''}</div>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <div style="background: linear-gradient(90deg, #7eb3ff, #a78bfa); color: #fff; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 700;">${trend.heat || 0}°</div>
              <button data-action="pin-trend" data-topic="${trend.topic}" style="background: #a78bfa; color: #fff; border: none; padding: 0.3rem 0.6rem; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: 600;">Pin</button>
            </div>
          </div>
        </div>
      `).join('');
    }
    
    async function pinToPinkyCalendar(topic) {
      try {
        const resp = await fetch('/api/navy/pin_to_calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic })
        });
        
        if (resp.ok) {
          alert(`✓ "${topic}" added to Pinky's calendar!`);
          // Refresh Pinky calendar if visible
          if (document.getElementById('pinky-tab').classList.contains('active')) {
            loadPinkyWarRoom();
          }
        } else {
          alert('Failed to pin trend');
        }
      } catch (e) {
        console.error('[Navy->Pinky] Pin error:', e);
        alert('Error pinning trend');
      }
    }
    
    function renderNavyPredictions(predictions) {
      const container = document.getElementById('navy-predictions');
      if (!predictions || predictions.length === 0) {
        container.innerHTML = '<p style="color: #666;">No predictions available</p>';
        return;
      }
      
      container.innerHTML = predictions.slice(0, 5).map((pred, i) => `
        <div style="margin-bottom: 0.75rem; padding: 0.75rem; background: rgba(16, 185, 129, 0.1); border-radius: 6px; border-left: 3px solid #10b981;">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div style="flex: 1;">
              <div style="font-weight: 600; margin-bottom: 0.25rem;">#${i+1} ${pred.topic}</div>
              <div style="color: #9ca3af; font-size: 0.85rem;">${pred.reason || ''}</div>
            </div>
            <div style="background: #10b981; color: #fff; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 700;">${pred.score}%</div>
          </div>
        </div>
      `).join('');
    }
    
    // === PINKY WAR ROOM FUNCTIONS (GLOBAL) ===
    // ============================================================
    // COMPETITOR SPY
    // ============================================================
    async function loadCompetitorSpy() {
      const btn = document.getElementById('spyBtn');
      const container = document.getElementById('navy-spy-results');
      if (btn) { btn.disabled = true; btn.textContent = 'Spying...'; }
      if (container) container.innerHTML = '<div style="color:#7eb3ff;padding:1rem;text-align:center;font-weight:600;animation:pulse 1s infinite;">Navy is analyzing viral competitors with Grok...</div>';
      try {
        const resp = await fetch('/api/navy/competitor_spy');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        container.innerHTML = data.map(item => `
          <div style="margin-bottom:0.75rem;padding:0.75rem;background:rgba(245,158,11,0.08);border-radius:8px;border-left:3px solid #f59e0b;">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.5rem;">
              <div style="font-weight:600;color:#f59e0b;">${item.title}</div>
              <div style="display:flex;gap:0.4rem;">
                <span style="background:#f59e0b;color:#000;padding:0.15rem 0.5rem;border-radius:4px;font-size:0.75rem;font-weight:700;">${item.platform}</span>
                <span style="background:rgba(245,158,11,0.3);color:#f59e0b;padding:0.15rem 0.5rem;border-radius:4px;font-size:0.75rem;">${item.views}</span>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;font-size:0.8rem;margin-bottom:0.5rem;">
              <div><span style="color:#9ca3af;">Hook:</span> ${item.hook}</div>
              <div><span style="color:#9ca3af;">Value:</span> ${item.value}</div>
              <div><span style="color:#9ca3af;">CTA:</span> ${item.cta}</div>
            </div>
            <div style="background:rgba(16,185,129,0.1);padding:0.4rem 0.6rem;border-radius:4px;font-size:0.8rem;color:#10b981;">
              Aqond Recommendation: ${item.recommendation}
            </div>
          </div>`).join('');
      } catch (e) {
        container.innerHTML = '<p style="color:#ef4444;">Spy failed: ' + e.message + '</p>';
      }
      btn.textContent = 'Spy Now';
      btn.disabled = false;
    }

    // ============================================================
    // TONE OF VOICE (MINNIE)
    // ============================================================
    let currentTone = 'professional';
    const TONE_BTN_IDS = {
      toon: 'toneToon',
      funny: 'toneFunny',
      professional: 'toneProfessional',
      'sci-fi': 'toneScifi',
      warm: 'toneWarm',
    };
    const toneDescs = {
      toon: 'Cartoon energy, big reactions — still sells the product clearly',
      funny: 'Humor, wit, relatable jokes — fun and energetic',
      professional: 'Formal, authoritative, ROI-focused language',
      'sci-fi': 'Futuristic, AI/space references — visionary and inspiring',
      warm: 'Empathetic, community-focused, feel-good and caring',
    };
    function setTone(tone, opts) {
      opts = opts || {};
      currentTone = tone;
      Object.keys(TONE_BTN_IDS).forEach(t => {
        const btn = document.getElementById(TONE_BTN_IDS[t]);
        if (!btn) return;
        const active = t === tone;
        btn.style.background = active ? 'rgba(16,185,129,0.3)' : 'rgba(30,30,50,0.5)';
        btn.style.color = active ? '#10b981' : '#9ca3af';
        btn.style.border = active ? '1px solid #10b981' : '1px solid #3a3a5e';
        btn.style.fontWeight = active ? '600' : '400';
      });
      const d = document.getElementById('toneDesc');
      if (d) d.textContent = toneDescs[tone] || '';
      if (!opts.silent && currentProject) {
        fetch('/api/project/' + currentProject + '/settings', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ tone: tone })
        }).then(function(r) {
          if (!r.ok) showToast('บันทึกโทนลงโปรเจกต์ไม่สำเร็จ', 'warn');
        }).catch(function() { showToast('บันทึกโทนลงโปรเจกต์ไม่สำเร็จ', 'warn'); });
      }
    }

    // ============================================================
    // PINKY DUAL-TIER
    // ============================================================
    let currentTier = 'marketing';
    function setPinkyTier(tier) {
      currentTier = tier;
      const mBtn = document.getElementById('tierMarketing');
      const tBtn = document.getElementById('tierTutorial');
      const badge = document.getElementById('tierBadge');
      const checklist = document.getElementById('tutorialChecklist');
      if (tier === 'marketing') {
        mBtn.style.background = 'rgba(167,139,250,0.8)'; mBtn.style.color = '#fff'; mBtn.style.border = 'none';
        tBtn.style.background = 'rgba(30,30,50,0.5)'; tBtn.style.color = '#9ca3af'; tBtn.style.border = '1px solid #3a3a5e';
        badge.textContent = '[ Emotion / Fantasy ]'; badge.style.color = '#a78bfa';
        if (checklist) checklist.style.display = 'none';
      } else {
        tBtn.style.background = 'rgba(245,158,11,0.8)'; tBtn.style.color = '#fff'; tBtn.style.border = 'none';
        mBtn.style.background = 'rgba(30,30,50,0.5)'; mBtn.style.color = '#9ca3af'; mBtn.style.border = '1px solid #3a3a5e';
        badge.textContent = '[ Accuracy / Clarity ]'; badge.style.color = '#f59e0b';
        if (checklist) checklist.style.display = 'block';
      }
    }

    // ============================================================
    // CALENDAR DAY DETAIL MODAL
    // ============================================================
    function openCalendarDay(dayData) {
      const modal = document.getElementById('calendarDayModal');
      const dateEl = document.getElementById('calModalDate');
      const contentEl = document.getElementById('calModalContent');
      dateEl.textContent = dayData.date || 'Scheduled Day';
      const videos = dayData.videos || [];
      contentEl.innerHTML = videos.length === 0
        ? '<p style="color:#666;">No videos scheduled for this day.</p>'
        : videos.map(v => `
          <div style="margin-bottom:0.75rem;padding:0.75rem;background:rgba(${v.tier==='Tier 1'?'167,139,250':'245,158,11'},0.1);border-radius:8px;border-left:3px solid ${v.tier==='Tier 1'?'#a78bfa':'#f59e0b'};">
            <div style="font-weight:600;margin-bottom:0.35rem;">${v.title || 'Untitled'}</div>
            <div style="color:#9ca3af;font-size:0.82rem;margin-bottom:0.35rem;">${v.tier || 'General'} • ${v.status || 'Pending'}</div>
            ${v.brief ? `<div style="color:#e8e8ef;font-size:0.82rem;line-height:1.5;">${v.brief}</div>` : ''}
          </div>`).join('');
      modal.style.display = 'flex';
    }

    // ============================================================
    // EDUCATIONAL OVERLAY TOGGLE (ROCKY)
    // ============================================================
    let eduOverlayOn = false;
    function toggleEduOverlay() {
      eduOverlayOn = !eduOverlayOn;
      const sw = document.getElementById('eduOverlaySwitch');
      const lbl = document.getElementById('eduOverlayLabel');
      const settings = document.getElementById('eduOverlaySettings');
      sw.style.background = eduOverlayOn ? '#f59e0b' : '#3a3a5e';
      lbl.textContent = eduOverlayOn ? 'ON' : 'OFF';
      lbl.style.color = eduOverlayOn ? '#f59e0b' : '#9ca3af';
      if (settings) settings.style.display = eduOverlayOn ? 'block' : 'none';
    }

    // ============================================================
    // TRANSLATE SCRIPT (MINNIE)
    // ============================================================
    window.__minnieLocalesHydrated = false;
    async function hydrateLocalizeLocales() {
      if (window.__minnieLocalesHydrated) return;
      var sel = document.getElementById('localizeLocaleSelect');
      if (!sel) return;
      try {
        var r = await fetch('/api/minnie/locales');
        var d = await r.json();
        var list = d.locales || [];
        sel.innerHTML = list.map(function(x) {
          return '<option value="' + String(x.code).replace(/"/g, '') + '">' + escapeHtmlSq(x.label || x.code) + '</option>';
        }).join('');
        window.__minnieLocalesHydrated = true;
      } catch (e) {
        sel.innerHTML = '<option value="en">English</option><option value="vi">Vietnamese</option><option value="id">Indonesian</option>';
        window.__minnieLocalesHydrated = true;
      }
    }
    function openTranslatePanel() {
      hydrateLocalizeLocales();
      var p = document.getElementById('translatePanel');
      if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
    }
    function _selectedLocalizeCodes() {
      var sel = document.getElementById('localizeLocaleSelect');
      if (!sel || !sel.selectedOptions) return [];
      var out = [];
      for (var i = 0; i < sel.selectedOptions.length; i++) {
        var v = (sel.selectedOptions[i].value || '').trim();
        if (v) out.push(v);
      }
      return out;
    }
    async function applyLocalizeToScriptEditor() {
      if (!currentProject) { showToast('เลือกโปรเจกต์จาก dropdown ก่อน', 'warn'); return; }
      var langs = _selectedLocalizeCodes();
      if (!langs.length) { showToast('เลือกภาษาอย่างน้อย 1 รายการในรายการ', 'warn'); return; }
      var code = langs[0];
      showToast('กำลัง localize → ' + code + '...', 'info');
      try {
        var resp = await fetch('/api/project/' + currentProject + '/translate_script', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ languages: [code] })
        });
        var data = await resp.json();
        if (!resp.ok) throw new Error((data.detail && (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail))) || 'HTTP ' + resp.status);
        var text = (data.translations || {})[code];
        if (!text || String(text).indexOf('[Error') === 0) throw new Error(text || 'ว่าง');
        var ta = document.getElementById('scriptContent');
        if (ta) ta.value = text;
        markScriptBaselineFromServer(text);
        var sr = await fetch('/api/project/' + currentProject + '/script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script: text })
        });
        var sj = await sr.json().catch(function() { return {}; });
        if (!sr.ok) throw new Error((sj.detail && (typeof sj.detail === 'string' ? sj.detail : 'บันทึกไม่สำเร็จ')) || 'บันทึกไม่สำเร็จ');
        var ls = document.getElementById('scriptLastSaved');
        if (ls) ls.textContent = 'บันทึกล่าสุด: ' + new Date().toLocaleTimeString();
        showToast('แปลและบันทึกแล้ว (' + code + ')', 'success');
      } catch (e) {
        showToast('Localize ล้มเหลว: ' + (e && e.message ? e.message : e), 'error');
      }
    }
    window.applyLocalizeToScriptEditor = applyLocalizeToScriptEditor;
    async function translateScript() {
      if (!currentProject) { showToast('เลือกโปรเจกต์จาก dropdown ก่อน (หรือกด Create เพื่อสร้าง)', 'warn'); return; }
      var langs = _selectedLocalizeCodes();
      if (!langs.length) { showToast('เลือกอย่างน้อยหนึ่งภาษา (Ctrl+คลิก)', 'warn'); return; }
      var res = document.getElementById('translateResults');
      if (res) res.innerHTML = '<p style="color:#9ca3af;">Localizing...</p>';
      try {
        var resp = await fetch('/api/project/' + currentProject + '/translate_script', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ languages: langs })
        });
        var data = await resp.json();
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        if (res) {
          res.innerHTML = Object.entries(data.translations || {}).map(function(ent) {
            var lang = ent[0];
            var text = ent[1];
            return '<div style="margin-bottom:0.75rem;"><div style="color:#f59e0b;font-weight:600;font-size:0.82rem;margin-bottom:0.25rem;">' + escapeHtmlSq(lang) + '</div><pre style="background:rgba(30,30,50,0.7);padding:0.75rem;border-radius:6px;font-size:0.8rem;color:#e8e8ef;white-space:pre-wrap;max-height:180px;overflow-y:auto;">' + escapeHtmlSq(String(text)) + '</pre></div>';
          }).join('');
        }
      } catch (e) {
        if (res) res.innerHTML = '<p style="color:#ef4444;">Error: ' + escapeHtmlSq(e.message) + '</p>';
      }
    }

    // ============================================================
    // BEST POST TIMES + ASPECT RATIO (THOMAS)
    // ============================================================
    async function loadBestPostTimes() {
      try {
        const resp = await fetch('/api/thomas/best_post_times');
        if (!resp.ok) return;
        const data = await resp.json();
        const container = document.getElementById('bestPostTimes');
        const colors = {facebook:'#10b981', tiktok:'#f59e0b', youtube:'#8b5cf6', instagram:'#ec4899'};
        container.innerHTML = Object.entries(data).map(([platform, slots]) => {
          const best = slots.reduce((a,b) => a.score >= b.score ? a : b, slots[0]);
          const c = colors[platform] || '#7eb3ff';
          return `<div style="margin-bottom:0.5rem;padding:0.5rem;background:rgba(30,30,50,0.5);border-radius:6px;">
            <div style="display:flex;justify-content:space-between;">
              <span style="color:#e8e8ef;font-size:0.85rem;text-transform:capitalize;">${platform}</span>
              <span style="color:${c};font-weight:600;font-size:0.85rem;">${best.time}</span>
            </div>
            <div style="color:#9ca3af;font-size:0.75rem;">${best.reason}</div>
          </div>`;
        }).join('');
        // Auto-set suggested time
        const hint = document.getElementById('suggestedTimeHint');
        if (hint) hint.textContent = '— Navy recommends 20:00-22:00 tonight';
      } catch(e) { console.error('[Thomas] Best times error:', e); }
    }

    async function exportAspectRatios() {
      const selected = Array.from(selectedVideos);
      if (!selected.length) { alert('Select videos first'); return; }
      const ratios = [];
      if (document.getElementById('ratio916').checked) ratios.push('9:16');
      if (document.getElementById('ratio169').checked) ratios.push('16:9');
      if (document.getElementById('ratio11').checked) ratios.push('1:1');
      if (!ratios.length) { alert('Select at least one aspect ratio'); return; }
      const btn = document.getElementById('exportRatioBtn');
      const status = document.getElementById('exportRatioStatus');
      btn.disabled = true; btn.textContent = 'Exporting...';
      status.textContent = '';
      try {
        const resp = await fetch('/api/thomas/export_aspect_ratios', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({project_ids: selected, ratios})
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        status.textContent = 'Done! ' + (data.exported || 0) + ' files created in output/exports/';
        status.style.color = '#10b981';
      } catch(e) {
        status.textContent = 'Error: ' + e.message;
        status.style.color = '#ef4444';
      }
      btn.disabled = false; btn.textContent = 'Export Selected';
    }

    // ============================================================
    // PINKY WAR ROOM LOADER
    // ============================================================
    window.loadPinkyWarRoom = async function() {
      console.log('[Pinky] Loading war room...');
      
      try {
        // Load calendar
        const calResp = await fetch('/api/pinky/calendar');
        if (calResp.ok) {
          const calendar = await calResp.json();
          console.log('[Pinky] Calendar loaded:', calendar);
          renderPinkyCalendar(calendar);
        } else {
          document.getElementById('pinky-calendar').innerHTML = '<p style="color: #ef4444;">Failed to load calendar</p>';
        }
        
        // Load quality checks
        const qcResp = await fetch('/api/pinky/quality_checks');
        if (qcResp.ok) {
          const checks = await qcResp.json();
          console.log('[Pinky] Quality checks loaded:', checks.length);
          renderPinkyQualityChecks(checks);
        } else {
          document.getElementById('pinky-quality-checks').innerHTML = '<p style="color: #ef4444;">Failed to load checks</p>';
        }
        
        // Load insights
        const insightResp = await fetch('/api/pinky/insights');
        if (insightResp.ok) {
          const insights = await insightResp.json();
          console.log('[Pinky] Insights loaded');
          renderPinkyInsights(insights);
        } else {
          document.getElementById('pinky-insights').innerHTML = '<p style="color: #ef4444;">Failed to load insights</p>';
        }
      } catch (e) {
        console.error('[Pinky] Load error:', e);
        document.getElementById('pinky-calendar').innerHTML = '<p style="color: #ef4444;">Error: ' + e.message + '</p>';
      }
    };
    
    function renderPinkyCalendar(calendar) {
      const container = document.getElementById('pinky-calendar');
      if (!calendar || !calendar.days || calendar.days.length === 0) {
        container.innerHTML = '<p style="color: #666;">No calendar data</p>';
        return;
      }
      
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const tierColors = { 'Tier 1': '#a78bfa', 'Tier 2': '#f59e0b', 'default': '#7eb3ff' };
      
      // Store calendar data globally for modal access
      window._calendarData = calendar.days;

      container.innerHTML = calendar.days.map((day, di) => `
        <div onclick="openCalendarDay(window._calendarData[${di}])"
             style="margin-bottom:0.75rem;padding:0.85rem;background:rgba(40,40,60,0.3);border-radius:8px;cursor:pointer;transition:background 0.2s;"
             onmouseover="this.style.background='rgba(60,60,90,0.5)'" onmouseout="this.style.background='rgba(40,40,60,0.3)'">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem;">
            <div>
              <div style="font-weight:700;font-size:1rem;">${day.date}</div>
              <div style="color:#9ca3af;font-size:0.8rem;">${days[new Date(day.date).getDay()] || ''}</div>
            </div>
            <div style="display:flex;gap:0.4rem;align-items:center;">
              <div style="background:#7eb3ff;color:#fff;padding:0.2rem 0.6rem;border-radius:6px;font-weight:700;font-size:0.82rem;">${(day.videos && day.videos.length) || 0} videos</div>
              <span style="color:#9ca3af;font-size:0.75rem;">Click to view</span>
            </div>
          </div>
          ${(day.videos || []).slice(0, 2).map(v => `
            <div style="margin-bottom:0.3rem;padding:0.4rem 0.6rem;background:rgba(${v.tier==='Tier 1'?'167,139,250':'245,158,11'},0.1);border-left:3px solid ${tierColors[v.tier]||tierColors.default};border-radius:4px;">
              <div style="font-weight:600;font-size:0.82rem;">${v.title || 'Untitled'}</div>
              <div style="color:#9ca3af;font-size:0.75rem;">${v.tier || 'General'} • ${v.status || 'Planned'}</div>
            </div>`).join('')}
          ${((day.videos && day.videos.length) || 0) > 2 ? `<div style="color:#7eb3ff;font-size:0.78rem;margin-top:0.3rem;">+${day.videos.length-2} more videos...</div>` : ''}
        </div>
      `).join('');
    }
    
    function renderPinkyQualityChecks(checks) {
      const container = document.getElementById('pinky-quality-checks');
      if (!checks || checks.length === 0) {
        container.innerHTML = '<p style="color: #666;">No active quality reviews</p>';
        return;
      }
      
      container.innerHTML = checks.map(check => `
        <div style="margin-bottom: 1rem; padding: 0.75rem; background: rgba(40, 40, 60, 0.3); border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <div style="font-weight: 600;">${check.project_id || 'Unknown'}</div>
            <div style="background: ${check.passed ? '#10b981' : '#ef4444'}; color: #fff; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem;">${check.passed ? 'PASS' : 'FAIL'}</div>
          </div>
          ${(check.items || []).map(item => `
            <div style="display: flex; justify-content: space-between; padding: 0.3rem 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
              <span style="color: #9ca3af; font-size: 0.85rem;">${item.name}</span>
              <span style="color: ${item.status === 'PASS' ? '#10b981' : '#ef4444'}; font-weight: 600; font-size: 0.85rem;">${item.status}</span>
            </div>
          `).join('')}
        </div>
      `).join('');
    }
    
    function renderPinkyInsights(insights) {
      const container = document.getElementById('pinky-insights');
      if (!insights || !insights.text) {
        container.innerHTML = '<p style="color: #666;">No insights available</p>';
        return;
      }
      
      container.innerHTML = `
        <div style="padding: 1rem; background: rgba(167, 139, 250, 0.1); border-radius: 8px; border-left: 4px solid #a78bfa;">
          <div style="font-weight: 600; margin-bottom: 0.5rem; color: #a78bfa;">💡 Today's Insight</div>
          <div style="color: #e8e8ef; line-height: 1.6;">${insights.text}</div>
          ${insights.date ? `<div style="color: #9ca3af; font-size: 0.8rem; margin-top: 0.5rem;">${insights.date}</div>` : ''}
        </div>
      `;
    }
    
    function loadProjects() {
      loadProjectsFromHttp();
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ action: 'list_projects' }));
      }
    }
    
    function projectDropdownStateTag(state) {
      var s = state || '';
      var emo = { editing: '🎬', visual_paused: '⏸', visual_gen: '✨', qc: '📋', scripting: '📝', script_paused: '⏸', draft: '📂', approved: '✓', done: '🏁', failed: '✖', edit_rejected: '↩', script_rejected: '✖' };
      var e = emo[s] || '●';
      return e + ' [' + s + ']';
    }

    function updateProjects(projects) {
      const select = document.getElementById('projectSelect');
      if (!select) return;
      window.__projectsById = window.__projectsById || {};
      const prev = currentProject;
      if (!projects || !projects.length) {
        select.innerHTML = '<option value="">— ยังไม่มีโปรเจกต์ — กรอกฟอร์มแล้วกด Create</option>';
        currentProject = null;
        window.__projectsById = {};
      } else {
        window.__projectsById = {};
        select.innerHTML = '<option value="">-- Select Project --</option>';
        projects.forEach(p => {
          window.__projectsById[p.project_id] = p;
          const opt = document.createElement('option');
          opt.value = p.project_id;
          opt.textContent = p.project_id + ' ' + projectDropdownStateTag(p.state);
          select.appendChild(opt);
        });
        const still = prev && projects.some(p => p.project_id === prev);
        if (still) {
          select.value = prev;
          currentProject = prev;
        }
      }
      select.onchange = (e) => {
        const v = e.target.value;
        if (scriptDirty && currentProject && v !== currentProject) {
          if (!confirm('มีการแก้บทที่ยังไม่บันทึก — ต้องการสลับโปรเจกต์ต่อหรือไม่?')) {
            e.target.value = currentProject;
            return;
          }
        }
        currentProject = v;
        if (currentProject) loadProjectScript(currentProject);
        syncRockyVariantControlsFromProject(window.__projectsById && window.__projectsById[currentProject]);
        var rt = document.getElementById('rocky-tab');
        if (currentProject && rt && rt.style.display === 'block') {
          loadStoryboard(currentProject);
          loadProjectRefs(currentProject);
        }
        if (currentProject) refreshRockyVariantBarsDom(currentProject);
      };
    }
    
    function toggleMinnieBriefMode() {
      const legacy = document.getElementById('minnieBriefModeLegacy');
      const on = legacy && legacy.checked;
      const grid = document.getElementById('structuredBriefFields');
      const leg = document.getElementById('legacyBriefOnly');
      if (grid) grid.style.display = on ? 'none' : 'flex';
      if (leg) leg.style.display = on ? 'block' : 'none';
    }

    function collectStructuredBrief() {
      const tz = document.getElementById('minnieTiktokSafeZone');
      return {
        hook_type: (document.getElementById('sbHookType') || {}).value || 'other',
        hook_insight: (document.getElementById('sbHookInsight') || {}).value || '',
        problem_solution: (document.getElementById('sbProblemSolution') || {}).value || '',
        product_service: (document.getElementById('sbProduct') || {}).value || '',
        promotion_cta: (document.getElementById('sbPromo') || {}).value || '',
        call_to_action: (document.getElementById('sbCta') || {}).value || '',
        extra_notes: (document.getElementById('sbExtra') || {}).value || '',
        tiktok_safe_zone: !!(tz && tz.checked)
      };
    }

    window.__minnieBrainstormIdeas = [];
    window.__minnieBrainstormSelected = {};
    function escapeHtmlSq(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function applyStructuredBriefToMinnieForm(sb) {
      if (!sb) return;
      var ht = document.getElementById('sbHookType');
      if (ht) ht.value = sb.hook_type || 'trend_hook';
      var map = [['sbHookInsight','hook_insight'],['sbProblemSolution','problem_solution'],['sbProduct','product_service'],['sbPromo','promotion_cta'],['sbCta','call_to_action'],['sbExtra','extra_notes']];
      map.forEach(function(pair) {
        var el = document.getElementById(pair[0]);
        if (el) el.value = sb[pair[1]] != null ? sb[pair[1]] : '';
      });
      var tz = document.getElementById('minnieTiktokSafeZone');
      if (tz) tz.checked = !!sb.tiktok_safe_zone;
    }
    function renderBrainstormTable(source) {
      window.__minnieBrainstormLastSource = source || '';
      var tb = document.getElementById('minnieBrainstormTableBody');
      var src = document.getElementById('minnieBrainstormSource');
      if (src) src.textContent = source ? ('source: ' + source) : '';
      if (!tb) return;
      var rows = window.__minnieBrainstormIdeas || [];
      var sel = window.__minnieBrainstormSelected || {};
      tb.innerHTML = rows.map(function(sb, i) {
        var ck = sel[i] ? 'checked' : '';
        return '<tr><td style="padding:0.25rem;border-bottom:1px solid #334155;text-align:center;"><input type="checkbox" aria-label="เลือกแถว ' + (i + 1) + '" ' + ck + ' onchange="toggleBrainstormSelect(' + i + ', this.checked)" /></td><td style="padding:0.3rem;border-bottom:1px solid #334155;">' + (i + 1) + '</td><td style="padding:0.3rem;border-bottom:1px solid #334155;">' + escapeHtmlSq(sb.product_service).slice(0, 90) + '</td><td style="padding:0.3rem;border-bottom:1px solid #334155;">' + escapeHtmlSq(sb.hook_insight).slice(0, 110) + '</td><td style="padding:0.3rem;border-bottom:1px solid #334155;"><button type="button" onclick="startFromBrainstormRow(' + i + ')" style="padding:0.2rem 0.5rem;font-size:0.7rem;cursor:pointer;background:rgba(16,185,129,0.2);border:1px solid #10b981;color:#6ee7b7;border-radius:4px;">เริ่มโปรเจกต์</button></td></tr>';
      }).join('');
    }
    function toggleBrainstormSelect(idx, on) {
      if (!window.__minnieBrainstormSelected) window.__minnieBrainstormSelected = {};
      if (on) window.__minnieBrainstormSelected[idx] = true;
      else delete window.__minnieBrainstormSelected[idx];
    }
    window.toggleBrainstormSelect = toggleBrainstormSelect;
    function selectAllBrainstormCheckboxes(on) {
      var rows = window.__minnieBrainstormIdeas || [];
      window.__minnieBrainstormSelected = {};
      if (on) {
        for (var i = 0; i < rows.length; i++) window.__minnieBrainstormSelected[i] = true;
      }
      renderBrainstormTable(window.__minnieBrainstormLastSource || '');
    }
    window.selectAllBrainstormCheckboxes = selectAllBrainstormCheckboxes;
    async function runMinnieBrainstorm() {
      var tier = (document.getElementById('newProjectTier') || {}).value || 'marketing';
      var btn = document.getElementById('minnieBrainstormBtn');
      if (btn) btn.disabled = true;
      showToast('Navy + Minnie กำลังปั่นไอเดีย...', 'info');
      try {
        var r = await fetch('/api/minnie/brainstorm_ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: 10, tier: tier }) });
        var d = await r.json();
        if (!r.ok) throw new Error(_thomasApiErr(d));
        window.__minnieBrainstormIdeas = d.ideas || [];
        window.__minnieBrainstormSelected = {};
        renderBrainstormTable(d.source || '');
        showToast('ได้ ' + window.__minnieBrainstormIdeas.length + ' briefs', 'success');
      } catch (e) {
        showToast('Brainstorm ล้มเหลว: ' + (e && e.message ? e.message : e), 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    }
    window.runMinnieBrainstorm = runMinnieBrainstorm;
    async function startFromBrainstormRow(idx) {
      var sb = window.__minnieBrainstormIdeas[idx];
      if (!sb) return;
      var leg = document.getElementById('minnieBriefModeLegacy');
      if (leg) leg.checked = false;
      toggleMinnieBriefMode();
      applyStructuredBriefToMinnieForm(sb);
      await createNewProject();
    }
    window.startFromBrainstormRow = startFromBrainstormRow;

    async function waitProjectStateTurbo(projectId, okStates, timeoutMs, intervalMs) {
      var t0 = Date.now();
      var want = {};
      okStates.forEach(function(s) { want[s] = true; });
      while (Date.now() - t0 < timeoutMs) {
        try {
          var r = await fetch('/api/projects');
          var d = await r.json();
          var list = d.projects || [];
          for (var i = 0; i < list.length; i++) {
            if (list[i].project_id === projectId && want[list[i].state]) return list[i].state;
          }
        } catch (e) {}
        await new Promise(function(res) { setTimeout(res, intervalMs); });
      }
      return null;
    }

    async function turboRunOneStructuredBrief(sb) {
      var tone = (typeof currentTone !== 'undefined' && currentTone) ? currentTone : 'professional';
      var tier = (document.getElementById('newProjectTier') || {}).value || 'marketing';
      var gen = await fetch('/api/minnie/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structured: sb, tone: tone, tier: tier })
      });
      var gtext = await gen.text();
      var gdata = {};
      try { gdata = JSON.parse(gtext); } catch (e) {}
      if (!gen.ok) throw new Error((gdata.detail || gtext).toString().slice(0, 220));
      var projectId = gdata.project_id;
      if (!projectId) throw new Error('ไม่ได้รับ project_id');

      var va = document.getElementById('rockyVarA');
      var vb = document.getElementById('rockyVarB');
      var vc = document.getElementById('rockyVarC');
      var au = document.getElementById('rockyAutoRenderAfterVisual');
      await fetch('/api/project/' + projectId + '/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auto_render_variants_after_visual: !!(au && au.checked),
          variants_render_enabled: {
            variant_a: !!(va && va.checked),
            variant_b: !!(vb && vb.checked),
            variant_c: !!(vc && vc.checked)
          }
        })
      });

      var passed = false;
      for (var attempt = 0; attempt < 5; attempt++) {
        var pr = await fetch('/api/project/' + projectId + '/script/pinky_review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier: tier })
        });
        var pd = await pr.json().catch(function() { return {}; });
        if (!pr.ok) throw new Error((pd.detail && (typeof pd.detail === 'string' ? pd.detail : JSON.stringify(pd.detail))) || ('Pinky HTTP ' + pr.status));
        if ((pd.score || 0) >= 8) { passed = true; break; }
      }
      if (!passed) throw new Error('Pinky ยังไม่ให้ ≥8 หลังหลายรอบ — ' + projectId);

      var scr = await fetch('/api/project/' + projectId + '/script');
      var sd = await scr.json();
      var scriptBody = sd.script || '';
      var sr = await fetch('/api/project/' + projectId + '/send_to_rocky', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: scriptBody })
      });
      var srd = await sr.json().catch(function() { return {}; });
      if (!sr.ok) throw new Error((srd.detail && (typeof srd.detail === 'string' ? srd.detail : JSON.stringify(srd.detail))) || ('Rocky ' + sr.status));

      var finalSt = await waitProjectStateTurbo(projectId, ['qc', 'approved', 'done'], 5400000, 5000);
      return { project_id: projectId, state: finalSt || 'timeout_or_running' };
    }

    async function autoRunSelectedBrainstormIdeas() {
      var rows = window.__minnieBrainstormIdeas || [];
      var sel = window.__minnieBrainstormSelected || {};
      var indices = Object.keys(sel).map(function(x) { return parseInt(x, 10); }).filter(function(i) { return !isNaN(i) && i >= 0 && i < rows.length; });
      indices.sort(function(a, b) { return a - b; });
      if (!indices.length) { showToast('ติ๊กเลือกไอเดียใน Brainstorm ก่อน', 'warn'); return; }

      try {
        var hr = await fetch('/api/config/turbo_hints');
        var hd = await hr.json();
        if (hd.require_character_ref) {
          showToast('Turbo: ปิด ROCKY_REQUIRE_CHARACTER_REF ใน .env ก่อน (แต่ละโปรเจกต์ใหม่ยังไม่มีรูปตัวละคร)', 'error');
          return;
        }
      } catch (e) {}

      if (!confirm('Auto-Run ' + indices.length + ' ไอเดีย? แต่ละอันจะใช้เวลานาน (Gen + Pinky + Rocky + Render) — ทำทีละอัน')) return;

      var btn = document.getElementById('minnieBrainstormTurboBtn');
      if (btn) { btn.disabled = true; }
      for (var t = 0; t < indices.length; t++) {
        var idx = indices[t];
        var sb = rows[idx];
        if (!sb) continue;
        showToast('Turbo [' + (t + 1) + '/' + indices.length + '] กำลังรัน...', 'info');
        try {
          var res = await turboRunOneStructuredBrief(sb);
          showToast('Turbo OK: ' + res.project_id + ' → ' + res.state, 'success');
        } catch (err) {
          showToast('Turbo หยุดที่แถว ' + (idx + 1) + ': ' + (err && err.message ? err.message : err), 'error');
          break;
        }
      }
      if (btn) { btn.disabled = false; }
      loadProjectsFromHttp();
      loadFactoryQueue(false);
    }
    window.autoRunSelectedBrainstormIdeas = autoRunSelectedBrainstormIdeas;

    var __factoryQueueInterval = null;
    async function loadFactoryQueue(showToastOk) {
      try {
        var r = await fetch('/api/factory/queue_overview');
        var d = await r.json();
        if (!r.ok) return;
        var c = d.counts || {};
        var order = ['scripting','script_paused','visual_gen','visual_paused','editing','qc','pinky_review','approved','done','draft','failed','script_rejected','edit_rejected','publishing'];
        var parts = [];
        order.forEach(function(k) { if (c[k]) parts.push(k + ':' + c[k]); });
        var el = document.getElementById('liveQueueCounts');
        if (el) el.textContent = parts.length ? parts.join(' · ') : 'ว่าง / รอโปรเจกต์';
        var tb = document.getElementById('liveQueueTableBody');
        if (tb && d.projects) {
          tb.innerHTML = d.projects.slice(0, 100).map(function(p) {
            var st = p.state || '';
            return '<tr><td style="padding:0.2rem;border-bottom:1px solid #1e293b;"><code style="color:#93c5fd;">' + escapeHtmlSq(p.project_id) + '</code></td><td style="padding:0.2rem;border-bottom:1px solid #1e293b;"><span class="status ' + escapeHtmlSq(st) + '">' + escapeHtmlSq(st) + '</span></td><td style="padding:0.2rem;border-bottom:1px solid #1e293b;color:#9ca3af;font-size:0.68rem;">' + escapeHtmlSq((p.updated_at || '').slice(0, 19)) + '</td><td style="padding:0.2rem;border-bottom:1px solid #1e293b;color:#cbd5e1;max-width:200px;overflow:hidden;text-overflow:ellipsis;">' + escapeHtmlSq(p.brief || '').slice(0, 100) + '</td></tr>';
          }).join('');
        }
        if (showToastOk) showToast('อัปเดตคิวแล้ว', 'success');
      } catch (err) { console.error('[queue]', err); }
    }
    window.loadFactoryQueue = loadFactoryQueue;
    function toggleLiveQueueDetail() {
      var d = document.getElementById('liveQueueDetail');
      var b = document.getElementById('liveQueueToggleBtn');
      if (!d) return;
      var on = d.style.display !== 'block';
      d.style.display = on ? 'block' : 'none';
      if (b) b.textContent = on ? 'ซ่อนตาราง' : 'แสดงตาราง';
      if (on) loadFactoryQueue(false);
    }

    function structuredBriefIsMeaningful(sb) {
      if (!sb || typeof sb !== 'object') return false;
      var hi = (sb.hook_insight || '').trim().length >= 5;
      var pr = (sb.product_service || '').trim().length >= 2;
      return hi || pr;
    }

    async function checkMinnieCompliance() {
      const scriptEl = document.getElementById('scriptContent');
      const script = (scriptEl && scriptEl.value || '').trim();
      if (!script) { showToast('ยังไม่มีสคริปต์ในหน้าต่างแก้ไข', 'warn'); return; }
      let structured = currentStructuredBrief;
      if (!structuredBriefIsMeaningful(structured)) structured = collectStructuredBrief();
      if (!structuredBriefIsMeaningful(structured)) {
        showToast('โปรเจกต์นี้ไม่มี Structured Brief — สร้างจากฟอร์มโครงสร้างหรือโหลดโปรเจกต์ที่บันทึก brief ไว้', 'warn');
        return;
      }
      try {
        const resp = await fetch('/api/minnie/compliance_check', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ script, structured })
        });
        const text = await resp.text();
        if (!resp.ok) throw new Error(text.slice(0, 200));
        const data = JSON.parse(text);
        if (data.patched_script) {
          scriptEl.value = data.patched_script;
          scriptDirty = (scriptEl.value !== scriptLastSavedSnapshot);
          refreshScriptEditorChrome();
          showToast('แพตช์อัตโนมัติ: ' + (data.auto_fixed_notes || []).join(' · '), 'success');
        } else if ((data.issues || []).length) {
          showToast('ตรวจพบ: ' + data.issues.join(' · ') + ' — ลองกดอีกครั้งเพื่อแพตช์', 'warn');
        } else {
          showToast('ผ่าน: พบ CTA / Social proof ตาม checklist', 'success');
        }
      } catch (e) {
        showToast('Compliance check ล้มเหลว: ' + e.message, 'error');
      }
    }

    // Minnie: Generate project + script in ONE direct call
    async function createNewProject() {
      const tier = (document.getElementById('newProjectTier') || {value:'marketing'}).value;
      const tone = currentTone || 'professional';
      const btn = document.getElementById('createProjectBtn');
      const legacyMode = document.getElementById('minnieBriefModeLegacy') && document.getElementById('minnieBriefModeLegacy').checked;
      let body;
      let previewLabel;
      if (legacyMode) {
        const brief = (document.getElementById('newProjectBrief') && document.getElementById('newProjectBrief').value || '').trim();
        if (!brief) { showToast('กรุณาพิมพ์ Brief (legacy) ก่อน', 'warn'); return; }
        body = { brief, tone, tier };
        previewLabel = brief;
        currentStructuredBrief = null;
      } else {
        const structured = collectStructuredBrief();
        body = { structured, tone, tier };
        previewLabel = (structured.product_service || structured.hook_insight || '').slice(0, 120);
        if (!previewLabel) previewLabel = '(structured brief)';
      }

      // === LOADING STATE ===
      if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; btn.style.background = 'rgba(245,158,11,0.2)'; btn.style.borderColor = '#f59e0b'; btn.style.color = '#f59e0b'; }
      document.getElementById('scriptContent').value = '⏳ Minnie is writing your script...\\n\\n' + previewLabel + '\\nTone: ' + tone + '\\nTier: ' + tier + (legacyMode ? '' : '\\n(Structured Brief + viral spine)');
      console.log('[Minnie] POST /api/minnie/generate', legacyMode ? {legacy: true, tone, tier} : {structured: true, tone, tier});

      try {
        const resp = await fetch('/api/minnie/generate', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(body)
        });
        console.log('[Minnie] Response status:', resp.status);
        const text = await resp.text();
        console.log('[Minnie] Response body (first 200):', text.slice(0, 200));
        if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + text.slice(0, 200));

        const data = JSON.parse(text);
        const script = data.script || data.script_md || '';

        if (!script || script.length < 10) throw new Error('Empty script returned from Minnie');

        // === DIRECT DOM UPDATE — no polling needed ===
        document.getElementById('scriptContent').value = script;
        markScriptBaselineFromServer(script);
        var stNew = document.getElementById('scriptStateBadge');
        if (stNew) stNew.textContent = 'สถานะ: script_ready';
        var pbNew = document.getElementById('scriptPinkyBadge');
        if (pbNew) pbNew.textContent = 'Pinky: ยังไม่ตรวจ';
        var rbNew = document.getElementById('sendToRockyBtn');
        if (rbNew) { rbNew.style.opacity = '0.65'; rbNew.textContent = '🔒 Send to Rocky (Pinky < 8)'; }
        currentProject = data.project_id;
        if (data.structured_brief && typeof data.structured_brief === 'object' && Object.keys(data.structured_brief).length) {
          currentStructuredBrief = data.structured_brief;
        } else if (!legacyMode) {
          currentStructuredBrief = collectStructuredBrief();
        }

        if (legacyMode && document.getElementById('newProjectBrief')) document.getElementById('newProjectBrief').value = '';
        else {
          ['sbHookInsight','sbProblemSolution','sbProduct','sbPromo','sbCta','sbExtra'].forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
        }

        const sel = document.getElementById('projectSelect');
        if (sel) { sel.value = data.project_id; }

        var rt = document.getElementById('rocky-tab');
        if (rt && rt.style.display === 'block') {
          loadStoryboard(data.project_id);
          loadProjectRefs(data.project_id);
        }

        var toastMsg = 'Script ready! (' + script.length + ' chars)';
        if (data.structured_mode) toastMsg += ' — Structured + compliance spine';
        showToast(toastMsg + ' — Review / CTA & Social / Pinky.', 'success');
        console.log('[Minnie] Script loaded to editor. project_id:', data.project_id);
        loadProjects();

      } catch(e) {
        console.error('[Minnie] Generate FAILED:', e);
        document.getElementById('scriptContent').value = '';
        showToast('Minnie failed: ' + e.message, 'error');
      }

      // === RESTORE BUTTON ===
      if (btn) { btn.disabled = false; btn.textContent = 'Create'; btn.style.background = 'rgba(16,185,129,0.2)'; btn.style.borderColor = '#10b981'; btn.style.color = '#10b981'; }
    }
    window.createNewProject = createNewProject;

    // Minnie: Load script
    function loadProjectScript(projectId) {
      if (!projectId) return;
      
      fetch(`/api/project/${projectId}/script`)
        .then(function(r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(data => {
          document.getElementById('scriptContent').value = data.script || '';
          var sb = data.structured_brief;
          currentStructuredBrief = (sb && typeof sb === 'object' && (sb.hook_insight || sb.product_service)) ? sb : null;
          if (data.tone) setTone(data.tone, { silent: true });
          if (data.tier === 'marketing' || data.tier === 'tutorial') setPinkyTier(data.tier);
          var nt = document.getElementById('newProjectTier');
          if (nt && data.tier) nt.value = data.tier;
          applyScriptContextFromApi(data);
          markScriptBaselineFromServer(data.script || '');
          document.getElementById('chatMessages').innerHTML = '<p style="color: #9ca3af;">Chat history cleared. Start editing...</p>';
        })
        .catch(function(e) {
          showToast('โหลดสคริปต์ไม่ได้: ' + e.message, 'error');
        });
    }
    
    // Minnie: Chat
    function sendMinnieMessage(msg) {
      msg = String(msg || '').trim();
      if (!msg) { showToast('พิมพ์คำสั่งแก้บทก่อน', 'warn'); return; }
      if (!currentProject) { showToast('เลือกโปรเจกต์จากด้านซ้ายก่อน (หรือกด Create)', 'warn'); return; }
      if (!ws || ws.readyState !== 1) {
        showToast('ยังไม่เชื่อมต่อ WebSocket — รอสักครู่หรือรีเฟรชหน้า (กด F5)', 'error');
        return;
      }
      addChatMessage('user', msg);
      ws.send(JSON.stringify({
        action: 'chat_minnie',
        project_id: currentProject,
        message: msg,
        current_script: document.getElementById('scriptContent').value
      }));
    }

    function sendMinniePreset(key) {
      var map = {
        intense: 'ทำให้โทนและคำพูดเข้มขึ้น กระชับ ดุดัน — รักษาโครง scene marker [Xs-Ys] และ markdown เดิม',
        shorter: 'ตัดบทให้สั้นลงประมาณ 25–35% คงประเด็นขายและ CTA — รักษา scene markers ถ้ามี',
        cta: 'เสริมช่วง CTA ท้ายคลิปให้ชัดเจน พูดช้า เน้นลิงก์หรือรหัสโปร — ไม่ให้บทยืดเกินไป'
      };
      var t = map[key];
      if (!t) return;
      sendMinnieMessage(t);
    }

    function sendChat() {
      const input = document.getElementById('chatInput');
      const msg = (input && input.value || '').trim();
      sendMinnieMessage(msg);
      if (input) input.value = '';
    }
    
    function addChatMessage(role, text) {
      const container = document.getElementById('chatMessages');
      const div = document.createElement('div');
      div.className = 'msg ' + role;
      div.innerHTML = `<div class="label">${role === 'user' ? 'You' : 'Minnie'}</div><div>${text}</div>`;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }
    
    function saveScript() {
      if (!currentProject) {
        showToast('ยังไม่มีโปรเจกต์ — เลือกจาก dropdown หรือกด Create ให้สร้างโปรเจกต์ก่อน', 'warn');
        return;
      }
      const script = document.getElementById('scriptContent').value;
      fetch(`/api/project/${currentProject}/script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script })
      })
      .then(function(r) { return r.json().then(function(data) { return { ok: r.ok, data: data }; }); })
      .then(function(res) {
        if (!res.ok) {
          var d = res.data && res.data.detail;
          throw new Error(typeof d === 'string' ? d : 'บันทึกไม่สำเร็จ');
        }
        var ls = document.getElementById('scriptLastSaved');
        if (ls) ls.textContent = 'บันทึกล่าสุด: ' + new Date().toLocaleTimeString();
        markScriptBaselineFromServer(script);
        showToast(res.data.message || 'บันทึกสคริปต์แล้ว', 'success');
      })
      .catch(function(e) { showToast('Save ล้มเหลว: ' + e.message, 'error'); });
    }
    
    function requestPinkyScriptReview() {
      if (!currentProject) { showToast('Please select a project first', 'warn'); return; }
      var taSnap = document.getElementById('scriptContent');
      var scriptBeforePinky = taSnap ? taSnap.value : '';
      const btn = document.getElementById('pinkyReviewBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'กำลังตรวจ...'; }

      fetch('/api/project/' + currentProject + '/script/pinky_review', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({tier: currentTier})
      })
      .then(function(r) { return r.text().then(function(text) { return {ok: r.ok, status: r.status, text: text}; }); })
      .then(function(result) {
        if (btn) { btn.disabled = false; btn.textContent = '🔎 Ask Pinky'; }
        if (!result.ok) throw new Error('HTTP ' + result.status + ': ' + result.text.slice(0, 200));
        const data = JSON.parse(result.text);
        showPinkyReviewInline(data, 'script');
        var afterTxt = data.auto_fixed_script;
        if (afterTxt && afterTxt !== scriptBeforePinky) {
          showPinkyDiffPanel(scriptBeforePinky, afterTxt);
          document.getElementById('scriptContent').value = afterTxt;
          markScriptBaselineFromServer(afterTxt);
          updateScriptTimeline();
        } else if (afterTxt) {
          document.getElementById('scriptContent').value = afterTxt;
          markScriptBaselineFromServer(afterTxt);
          updateScriptTimeline();
        }
      })
      .catch(function(err) {
        if (btn) { btn.disabled = false; btn.textContent = '🔎 Ask Pinky'; }
        showToast('Pinky review failed: ' + err.message, 'error');
        console.error('[Pinky Review]', err);
      });
    }
    function sendToRocky() {
      if (!currentProject) {
        showToast('เลือกโปรเจกต์จาก dropdown ก่อน — ถ้ายังว่าง ให้รีเฟรชหน้า (โหลดรายชื่อผ่าน /api/projects)', 'warn');
        return;
      }
      const script = document.getElementById('scriptContent').value;
      if (!script || script.trim().length < 5) {
        showToast('สคริปต์สั้นเกินไปหรือว่าง — แก้ใน Script Editor ก่อน', 'warn');
        return;
      }
      fetch(`/api/project/${currentProject}/send_to_rocky`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script })
      })
      .then(function(r) { return r.text().then(function(text) { return { ok: r.ok, status: r.status, text: text }; }); })
      .then(function(res) {
        var data = {};
        try { data = JSON.parse(res.text); } catch (e) {}
        if (!res.ok) {
          var d = data.detail;
          var msg = typeof d === 'string' ? d : (d ? JSON.stringify(d) : res.text.slice(0, 200));
          throw new Error(msg || ('HTTP ' + res.status));
        }
        showToast(data.message || 'ส่งไป Rocky แล้ว — สลับแท็บ...', 'success');
        setTimeout(function() { switchTab('rocky'); }, 600);
      })
      .catch(function(err) {
        showToast('ส่ง Rocky ไม่ได้: ' + err.message, 'error');
      });
    }
    
    async function loadProjectRefs(projectId) {
      if (!projectId) return;
      var st = document.getElementById('refStatusLine');
      try {
        var r = await fetch('/api/project/' + projectId + '/refs');
        if (!r.ok) return;
        var d = await r.json();
        var prev = document.getElementById('characterRefPreview');
        var img = document.getElementById('characterRefImg');
        if (d.character_ref_url) {
          img.src = d.character_ref_url + '?t=' + Date.now();
          prev.style.display = 'block';
        } else {
          prev.style.display = 'none';
        }
        if (st) {
          st.textContent = d.character_ref_url
            ? '✓ มีรูปตัวละครหลัก — ใช้ไฟล์เดียวกันทุกฉาก (image-to-video)'
            : '⚠ ยังไม่มีรูปตัวละครหลัก — แนะนำอัปโหลดก่อน Gen เพื่อให้หน้าเดียวกันทุกคลิป';
        }
        document.querySelectorAll('.scene-ref-badge').forEach(function(el) { el.textContent = ''; });
        (d.scene_refs || []).forEach(function(sr) {
          var el = document.querySelector('.scene-ref-badge[data-idx="' + sr.index + '"]');
          if (el) el.textContent = '✓ ref';
        });
      } catch (e) { console.error('[refs]', e); }
    }

    async function uploadCharacterRef() {
      if (!currentProject) { showToast('เลือกโปรเจกต์ก่อน', 'warn'); return; }
      var inp = document.getElementById('characterRefFile');
      if (!inp.files || !inp.files[0]) { showToast('เลือกไฟล์รูป', 'warn'); return; }
      var fd = new FormData();
      fd.append('file', inp.files[0]);
      try {
        var r = await fetch('/api/project/' + currentProject + '/refs/character', { method: 'POST', body: fd });
        var data = await r.json().catch(function() { return {}; });
        if (!r.ok) throw new Error((typeof data.detail === 'string' ? data.detail : data.message) || ('HTTP ' + r.status));
        showToast('อัปโหลดตัวละครหลักแล้ว — จะใช้ทุกฉาก', 'success');
        loadProjectRefs(currentProject);
      } catch (e) { showToast('อัปโหลดล้มเหลว: ' + e.message, 'error'); }
    }

    async function uploadSceneRef(projectId, sceneIdx, inputEl) {
      if (!inputEl.files || !inputEl.files[0]) return;
      var fd = new FormData();
      fd.append('file', inputEl.files[0]);
      try {
        var r = await fetch('/api/project/' + projectId + '/refs/scene/' + sceneIdx, { method: 'POST', body: fd });
        var data = await r.json().catch(function() { return {}; });
        if (!r.ok) throw new Error((typeof data.detail === 'string' ? data.detail : data.message) || ('HTTP ' + r.status));
        showToast('อัปโหลด ref ฉาก ' + (sceneIdx + 1), 'success');
        loadProjectRefs(projectId);
      } catch (e) { showToast(e.message, 'error'); }
      inputEl.value = '';
    }

    window.loadProjectRefs = loadProjectRefs;

    window._rockyVariantPct = window._rockyVariantPct || {};
    function resetRockyVariantProgress(projectId) {
      if (!projectId) return;
      window._rockyVariantPct[projectId] = { variant_a: 0, variant_b: 0, variant_c: 0 };
      refreshRockyVariantBarsDom(projectId);
    }
    function setRockyVariantProgressPct(projectId, variantKey, pct) {
      if (!projectId || !variantKey) return;
      if (!window._rockyVariantPct[projectId]) window._rockyVariantPct[projectId] = { variant_a: 0, variant_b: 0, variant_c: 0 };
      var n = Math.max(0, Math.min(100, Number(pct) || 0));
      window._rockyVariantPct[projectId][variantKey] = n;
    }
    function refreshRockyVariantBarsDom(projectId) {
      if (!projectId || projectId !== currentProject) return;
      var wrap = document.getElementById('rockyVariantBars');
      if (!wrap) return;
      var st = window._rockyVariantPct[projectId];
      var any = st && (st.variant_a > 0 || st.variant_b > 0 || st.variant_c > 0);
      var panel = document.getElementById('rockyFluxConsole');
      var editing = panel && panel.style.display === 'block' && st && (st.variant_a < 100 || st.variant_b < 100 || st.variant_c < 100);
      var force = window._rockyShowVariantBarsUntilDone === projectId;
      wrap.style.display = (any || editing || force) ? 'block' : 'none';
      function row(key, fillId, pctId) {
        var p = st ? (st[key] || 0) : 0;
        var f = document.getElementById(fillId);
        var t = document.getElementById(pctId);
        if (f) f.style.width = p + '%';
        if (t) t.textContent = Math.round(p) + '%';
      }
      row('variant_a', 'rockyProgFillA', 'rockyProgPctA');
      row('variant_b', 'rockyProgFillB', 'rockyProgPctB');
      row('variant_c', 'rockyProgFillC', 'rockyProgPctC');
    }

    function syncRockyVariantControlsFromProject(p) {
      var va = document.getElementById('rockyVarA');
      var vb = document.getElementById('rockyVarB');
      var vc = document.getElementById('rockyVarC');
      var au = document.getElementById('rockyAutoRenderAfterVisual');
      if (!va || !vb || !vc) return;
      var ve = (p && p.variants_render_enabled) || {};
      va.checked = ve.variant_a !== false;
      vb.checked = ve.variant_b !== false;
      vc.checked = ve.variant_c !== false;
      if (au) au.checked = !!(p && p.auto_render_variants_after_visual);
    }

    async function saveRockyVariantPrefs() {
      if (!currentProject) return;
      var body = {
        variants_render_enabled: {
          variant_a: !!(document.getElementById('rockyVarA') && document.getElementById('rockyVarA').checked),
          variant_b: !!(document.getElementById('rockyVarB') && document.getElementById('rockyVarB').checked),
          variant_c: !!(document.getElementById('rockyVarC') && document.getElementById('rockyVarC').checked)
        },
        auto_render_variants_after_visual: !!(document.getElementById('rockyAutoRenderAfterVisual') && document.getElementById('rockyAutoRenderAfterVisual').checked)
      };
      try {
        var r = await fetch('/api/project/' + currentProject + '/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (r.ok && window.__projectsById && window.__projectsById[currentProject]) {
          var j = await r.json().catch(function() { return {}; });
          window.__projectsById[currentProject].variants_render_enabled = j.variants_render_enabled || body.variants_render_enabled;
          window.__projectsById[currentProject].auto_render_variants_after_visual = j.auto_render_variants_after_visual;
        }
      } catch (e) { console.warn('[Rocky prefs]', e); }
    }

    function regenAllScenes() {
      if (!currentProject) { showToast('เลือกโปรเจกต์ก่อน', 'warn'); return; }
      if (!confirm('Regen ทุกฉากตามลำดับ? ใช้เวลานานและเรียก API หลายครั้ง')) return;
      var sel = document.getElementById('regenAllCreativity');
      var cr = sel ? sel.value : 'medium';
      var noteEl = document.getElementById('regenAllNoteInput');
      var note = noteEl ? (noteEl.value || '').trim() : '';
      fetch('/api/project/' + currentProject + '/scenes/regen_all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creativity_level: cr, note: note })
      }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); })
        .then(function(x) {
          if (!x.ok) throw new Error(x.d.detail || x.d.message || 'HTTP error');
          showToast(x.d.message || 'Regen All เริ่มแล้ว', 'success');
        })
        .catch(function(e) { showToast('Regen All ไม่สำเร็จ: ' + e.message, 'error'); });
    }
    window.regenAllScenes = regenAllScenes;
    window.saveRockyVariantPrefs = saveRockyVariantPrefs;

    async function loadProductionPanel(projectId) {
      if (!projectId) return;
      try {
        var r = await fetch('/api/project/' + encodeURIComponent(projectId) + '/production');
        var d = await r.json();
        var ts = document.getElementById('targetShotCount');
        var ds = document.getElementById('directorPresetSelect');
        var ce = document.getElementById('creditEstLine');
        var ws = document.getElementById('wizardStepLine');
        if (ts) ts.value = String(d.target_shot_count != null ? d.target_shot_count : 0);
        if (ds) ds.value = d.director_preset || 'corporate';
        if (ce) ce.textContent = 'ประมาณการ credit: ~' + (d.credit_estimate_units || 0) + ' units';
        if (ws) ws.textContent = 'Wizard step: ' + (d.production_wizard_step || 0);
      } catch (e) { console.warn('[production]', e); }
    }
    async function applyProductionSettings() {
      if (!currentProject) { showToast('เลือกโปรเจกต์ก่อน', 'warn'); return; }
      var ts = document.getElementById('targetShotCount');
      var ds = document.getElementById('directorPresetSelect');
      var body = {
        target_shot_count: ts ? parseInt(ts.value, 10) || 0 : 0,
        director_preset: ds ? ds.value : 'corporate'
      };
      await fetch('/api/project/' + currentProject + '/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      showToast('บันทึก Multi-Shot settings แล้ว', 'success');
      refreshProductionEstimate();
    }
    async function wizardNextShot() {
      if (!currentProject) { showToast('เลือกโปรเจกต์ก่อน', 'warn'); return; }
      var r = await fetch('/api/project/' + encodeURIComponent(currentProject) + '/production');
      var d = await r.json();
      var step = (d.production_wizard_step || 0) + 1;
      await fetch('/api/project/' + currentProject + '/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ production_wizard_step: step }) });
      loadProductionPanel(currentProject);
      showToast('Wizard step ' + step + ' — ทำงานต่อกับฉากถัดไปใน storyboard', 'info');
    }
    async function refreshProductionEstimate() {
      if (!currentProject) return;
      var r = await fetch('/api/project/' + encodeURIComponent(currentProject) + '/production');
      var d = await r.json();
      var ce = document.getElementById('creditEstLine');
      if (ce) ce.textContent = 'ประมาณการ credit: ~' + (d.credit_estimate_units || 0) + ' units';
    }
    window.loadProductionPanel = loadProductionPanel;
    window.applyProductionSettings = applyProductionSettings;
    window.wizardNextShot = wizardNextShot;
    window.refreshProductionEstimate = refreshProductionEstimate;

    function cancelRockyRender() {
      if (!currentProject) { showToast('เลือกโปรเจกต์ก่อน', 'warn'); return; }
      fetch('/api/project/' + currentProject + '/rocky/render/cancel', { method: 'POST' })
        .then(function(r) { return r.json().catch(function() { return {}; }); })
        .then(function() { showToast('ส่งสัญญาณหยุดแล้ว — รอ FFmpeg รอบปัจจุบัน', 'info'); })
        .catch(function(e) { showToast('หยุดไม่สำเร็จ: ' + e.message, 'error'); });
    }
    window.cancelRockyRender = cancelRockyRender;
    window.syncRockyVariantControlsFromProject = syncRockyVariantControlsFromProject;
    window.refreshRockyVariantBarsDom = refreshRockyVariantBarsDom;

    // Rocky: Storyboard — ดูไฟล์จิ๋วบนดิสก์ (เช่น error body ~27KB) เมื่อ debug
    function forceShowStubVideo(projectId, idx) {
      var card = document.getElementById('scene-card-' + idx);
      if (!card) return;
      var wrap = card.querySelector('.scene-poster-wrap');
      if (!wrap) return;
      var src = '/api/project/' + encodeURIComponent(projectId) + '/scene/' + idx + '/video?force=1&t=' + Date.now();
      wrap.className = 'scene-poster-wrap scene-poster-wrap--video';
      wrap.innerHTML = '<video class="scene-thumb-video" controls autoplay muted loop playsinline preload="metadata"><source src="' + src + '" type="video/mp4" /></video>';
    }
    window.forceShowStubVideo = forceShowStubVideo;

    async function checkCreditBeforeBatch() {
      if (!currentProject) return false;
      try {
        var r = await fetch('/api/project/' + encodeURIComponent(currentProject) + '/production/credit_check');
        var d = await r.json();
        var w = document.getElementById('walletTopupLink');
        if (w && d.wallet_url) {
          w.href = d.wallet_url || '#';
          w.style.display = d.ok ? 'none' : 'inline';
        }
        return !!d.ok;
      } catch (e) { return true; }
    }
    async function startBatchProduction() {
      if (!currentProject) { showToast('เลือกโปรเจกต์ก่อน', 'warn'); return; }
      var ok = await checkCreditBeforeBatch();
      if (!ok) { showToast('Credit ไม่พอ — ตั้ง FACTORY_CREDIT_BUDGET ใน .env หรือเติม wallet', 'error'); return; }
      if (!confirm('เริ่ม Batch Gen ทีละช็อต (ข้ามช็อตที่ Locked แล้ว)?')) return;
      try {
        var r = await fetch('/api/project/' + currentProject + '/production/batch_generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ creativity: 'medium' }) });
        var errJ = await r.json().catch(function() { return {}; });
        if (!r.ok) {
          var det = errJ.detail || {};
          var msg = (typeof det === 'object' && det.message) ? det.message : (errJ.detail || 'Batch ไม่สำเร็จ');
          if (typeof det === 'object' && det.wallet_url) {
            var w = document.getElementById('walletTopupLink');
            if (w) { w.href = det.wallet_url; w.style.display = 'inline'; }
          }
          showToast(msg, 'error');
          return;
        }
        showToast('Batch queue เริ่มแล้ว', 'success');
      } catch (e) { showToast('Batch error: ' + e.message, 'error'); }
    }
    async function masterAssemblyRender() {
      if (!currentProject) return;
      var sr = await fetch('/api/project/' + currentProject + '/scenes');
      var sd = await sr.json();
      if (!sd.master_ready) { showToast('ทุกช็อตต้อง Pinky PASS ก่อน Master Assembly', 'warn'); return; }
      var dpEl = document.getElementById('directorPresetSelect');
      var dp = dpEl ? dpEl.value : 'corporate';
      var beatSyncEl = document.getElementById('beatSyncToggle');
      var beatSync = beatSyncEl ? beatSyncEl.checked : true;
      try {
        var r = await fetch('/api/project/' + currentProject + '/master_assembly', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ director_preset: dp, beat_sync: beatSync, edu_overlay: typeof eduOverlayOn !== 'undefined' ? eduOverlayOn : false, tier: typeof currentTier !== 'undefined' ? currentTier : 'marketing', tone: typeof currentTone !== 'undefined' ? currentTone : 'professional' })
        });
        if (!r.ok) {
          var errJ = await r.json().catch(function() { return {}; });
          var det = errJ.detail;
          var msg = (typeof det === 'object' && det && det.message) ? det.message : (errJ.detail || ('HTTP ' + r.status));
          showToast(String(msg), 'error');
          return;
        }
        window._masterAssemblyPending = true;
        window._masterAssemblyPendingProjectId = currentProject;
        updateRockyLiveHero('✂️ Final Master Assembly queued — Rocky is cutting the full timeline…');
        showToast('Master Assembly เริ่มแล้ว — ดู Live Panel', 'success');
      } catch (e) {
        showToast('Master Assembly: ' + (e && e.message ? e.message : String(e)), 'error');
      }
    }
    function selectShotTake(pid, idx, take) {
      fetch('/api/project/' + encodeURIComponent(pid) + '/shot/' + idx + '/select_take', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ take: take }) })
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); })
        .then(function(x) {
          if (!x.ok) throw new Error((x.d && x.d.detail) ? String(x.d.detail) : 'select failed');
          loadStoryboard(pid);
        })
        .catch(function(e) { showToast(e.message, 'error'); });
    }
    function genShotTake(pid, idx, take) {
      var cr = (take === 'variant_c') ? 'high' : 'medium';
      fetch('/api/project/' + encodeURIComponent(pid) + '/shot/' + idx + '/generate_take', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ take: take, creativity: cr }) })
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); })
        .then(function(x) {
          if (!x.ok) {
            var det = x.d.detail || {};
            var msg = (typeof det === 'object' && det.message) ? det.message : 'Gen take failed';
            throw new Error(msg);
          }
          showToast(x.d.message || 'Queued take gen', 'info');
        })
        .catch(function(e) { showToast(e.message, 'error'); });
    }
    window.startBatchProduction = startBatchProduction;
    window.masterAssemblyRender = masterAssemblyRender;
    window.selectShotTake = selectShotTake;
    window.genShotTake = genShotTake;

    function loadStoryboard(projectId) {
      if (!projectId) return;
      
      fetch(`/api/project/${projectId}/scenes`)
        .then(r => r.json())
        .then(data => {
          const container = document.getElementById('storyboard');
          container.innerHTML = '';
          
          if (!data.scenes || data.scenes.length === 0) {
            container.innerHTML = '<p style="color: #9ca3af; text-align: center;">No scenes generated yet. Send script from Minnie tab.</p>';
            loadProjectRefs(projectId);
            return;
          }
          
          data.scenes.forEach((scene, idx) => {
            const card = document.createElement('div');
            card.className = 'scene-card';
            card.id = `scene-card-${idx}`;
            
            /* สตรีม .mp4 จาก Grok ตรงๆ — ไม่ใช้ <img> ทับ; โหลด = Grok is Imaging + spinner เท่านั้น */
            const videoSrc = (scene.status === 'done')
              ? ('/api/project/' + encodeURIComponent(projectId) + '/scene/' + idx + '/video?t=' + Date.now())
              : '';
            let mediaHtml = '';
            if (scene.status === 'done' && videoSrc) {
              mediaHtml =
                '<div class="scene-poster-wrap scene-poster-wrap--video">' +
                '<video class="scene-thumb-video" autoplay muted loop playsinline controls preload="auto">' +
                '<source src="' + videoSrc + '" type="video/mp4" />' +
                '</video></div>';
            } else if (scene.status === 'stub') {
              var stubKb = (scene.clip_bytes != null) ? (' (~' + Math.round(scene.clip_bytes / 1024) + ' KB บนดิสก์)') : '';
              mediaHtml =
                '<div class="scene-poster-wrap scene-grok-loading">' +
                '<div class="grok-imaging"><div class="grok-spinner"></div>' +
                '<span>ไฟล์คลิปเล็กเกินไป' + stubKb +
                ' — ระบบดาวน์โหลด Grok ใช้ Bearer + re-poll URL อัตโนมัติแล้ว; ถ้ายังค้าง กด Regen หรือดู log <code>[Grok Video] Download Failed</code></span></div></div>';
            } else if (scene.status === 'missing') {
              var pend = (scene.pinky_badge === 'pending');
              var missMsg = pend
                ? 'รอสร้างคลิป — Grok ยังไม่ถึงคิวนี้หรือกำลังประมวลผล'
                : 'คลิปยังไม่พร้อมบนดิสก์ — ลอง Regen หรือตรวจ path ใน log';
              mediaHtml =
                '<div class="scene-poster-wrap scene-grok-loading">' +
                '<div class="grok-imaging"><div class="grok-spinner"></div><span>' + missMsg + '</span></div></div>';
            } else {
              mediaHtml =
                '<div class="scene-poster-wrap scene-grok-loading">' +
                '<div class="grok-imaging"><div class="grok-spinner"></div><span>Grok is Imaging…</span></div></div>';
            }
            var badge = scene.pinky_badge || '—';
            var badgeBg = badge === 'pass' ? '#065f46' : (badge === 'warn' ? '#92400e' : (badge === 'pending' ? '#1e3a8a' : '#7f1d1d'));
            var badgeTxt = (badge === 'pending') ? 'รอคลิป (ยังไม่มีไฟล์)' : ('Pinky ' + badge);
            var blk = (scene.block || '').replace(/</g, '&lt;');
            var takes = scene.takes || {};
            var sel = takes.selected || 'variant_a';
            var takeTiles = '';
            ['variant_a','variant_b','variant_c'].forEach(function(k) {
              var tt = takes[k] || {};
              var has = tt.has_file;
              var neon = (k === sel) ? 'box-shadow:0 0 12px rgba(232,121,249,0.95);border-color:#f0abfc;' : 'border-color:#3a3a5e;';
              var vUrl = (has && tt.video_url) ? (tt.video_url + '?t=' + Date.now()) : '';
              var lab = k.replace('variant_','').toUpperCase();
              takeTiles += '<div class="take-tile" onclick="selectShotTake(\\'' + projectId + '\\',' + idx + ',\\'' + k + '\\')" style="border:2px solid;border-radius:8px;padding:0.25rem;' + neon + 'cursor:pointer;min-width:76px;">';
              if (has && vUrl) {
                takeTiles += '<video muted playsinline loop style="width:76px;height:48px;object-fit:cover;border-radius:4px;background:#000;" src="' + vUrl + '"></video>';
              } else {
                takeTiles += '<div style="width:76px;height:48px;background:#1e1e2e;display:flex;align-items:center;justify-content:center;font-size:0.55rem;color:#9ca3af;">—</div>';
              }
              takeTiles += '<div style="font-size:0.55rem;text-align:center;color:#e9d5ff;margin-top:0.12rem;">' + lab + '</div></div>';
            });
            var takeStrip = '<div style="margin-top:0.5rem;"><div style="font-size:0.7rem;color:#d8b4fe;margin-bottom:0.25rem;">Takes — คลิกเลือก Master</div><div style="display:flex;gap:0.45rem;flex-wrap:wrap;align-items:flex-start;">' + takeTiles + '</div><div style="margin-top:0.35rem;display:flex;gap:0.35rem;flex-wrap:wrap;"><button type="button" class="btn-sm" onclick="genShotTake(\\'' + projectId + '\\',' + idx + ',\\'variant_b\\')">Gen B</button><button type="button" class="btn-sm" onclick="genShotTake(\\'' + projectId + '\\',' + idx + ',\\'variant_c\\')">Gen C</button></div></div>';
            card.innerHTML = `
              <div class="scene-header">
                <div class="scene-title">Shot ${idx + 1}${blk ? ' · ' + blk : ''}</div>
                <div style="display:flex;align-items:center;gap:0.35rem;flex-wrap:wrap;">
                  <span style="font-size:0.65rem;padding:0.12rem 0.4rem;border-radius:4px;background:${badgeBg};color:#f0fdf4;">${badgeTxt}</span>
                  <div class="status ${scene.status}">${scene.status}</div>
                </div>
              </div>
              ${mediaHtml}
              ${scene.status === 'stub' ? '<div style="margin-top:0.35rem;"><button type="button" class="btn-sm" style="width:100%;opacity:0.92;" data-force-stub="1">Force Show Anyway (debug)</button></div>' : ''}
              ${(function() {
                var esc = function(s) { return String(s || '').replace(/</g, '&lt;'); };
                var vp = scene.visual_prompt || '';
                var vo = scene.voiceover || '';
                var bits = '';
                if (vp) bits += '<div style="font-size:0.78rem;line-height:1.45;margin-bottom:0.35rem;"><strong style="color:#7eb3ff;">Visual</strong> ' + esc(vp).replace(/\\n/g,'<br/>') + '</div>';
                if (vo) bits += '<div style="font-size:0.78rem;line-height:1.45;margin-bottom:0.35rem;"><strong style="color:#a78bfa;">VO</strong> ' + esc(vo).replace(/\\n/g,'<br/>') + '</div>';
                bits += '<div class="scene-desc" style="margin-top:0.25rem;">' + esc(scene.description || 'N/A') + '</div>';
                return bits;
              })()}
              ${takeStrip}
              <div style="margin-top:0.45rem;padding:0.45rem;background:rgba(30,30,50,0.5);border-radius:6px;border:1px solid #3a3a5e;">
                <div style="font-size:0.72rem;color:#9ca3af;">Ref ฉาก ${idx + 1} <span class="scene-ref-badge" data-idx="${idx}" style="color:#10b981;font-weight:600;"></span> (UI/สินค้า)</div>
                <input type="file" accept="image/jpeg,image/png,image/webp" style="font-size:0.72rem;margin-top:0.25rem;max-width:100%;"
                  onchange="uploadSceneRef('${projectId}',${idx},this)" />
              </div>
              <div class="scene-actions">
                <button class="btn-sm" onclick="regenScene('${projectId}', ${idx}, 'medium')">Regen (Normal)</button>
                <button class="btn-sm" style="background: linear-gradient(135deg, #a78bfa 0%, #c4b5fd 100%);" onclick="regenScene('${projectId}', ${idx}, 'high')">Regen (High Creativity)</button>
                <button class="btn-sm" style="background: linear-gradient(135deg, #ec4899 0%, #f472b6 100%);" onclick="regenScene('${projectId}', ${idx}, 'extreme')">Regen (EXTREME)</button>
              </div>
            `;
            container.appendChild(card);
            if (scene.status === 'stub') {
              var _fsb = card.querySelector('button[data-force-stub]');
              if (_fsb) {
                _fsb.addEventListener('click', function() { forceShowStubVideo(projectId, idx); });
              }
            }
          });
          var mb = document.getElementById('masterAssemblyBtn');
          if (mb) mb.disabled = !data.master_ready;
          loadProjectRefs(projectId);
          loadProductionPanel(projectId);
        });
    }
    
    function regenScene(projectId, sceneIdx, creativity) {
      const creativityLabels = {
        'medium': 'Normal',
        'high': 'High Creativity',
        'extreme': 'EXTREME Fantasy'
      };
      
      if (!confirm(`Regenerate Scene ${sceneIdx + 1} with ${creativityLabels[creativity]}?`)) return;
      
      fetch(`/api/project/${projectId}/scene/${sceneIdx}/regen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creativity_level: creativity })
      })
      .then(r => r.json())
      .then(data => {
        alert(data.message || 'Regenerating with ' + creativityLabels[creativity] + '...');
        setTimeout(() => loadStoryboard(projectId), 3000);
      });
    }
    
    async function finalRender() {
      if (!currentProject) { showToast('Select a project first', 'warn'); return; }
      await saveRockyVariantPrefs();
      var va = document.getElementById('rockyVarA') && document.getElementById('rockyVarA').checked;
      var vb = document.getElementById('rockyVarB') && document.getElementById('rockyVarB').checked;
      var vc = document.getElementById('rockyVarC') && document.getElementById('rockyVarC').checked;
      var picked = [va?'A':null, vb?'B':null, vc?'C':null].filter(Boolean).join(', ') || 'A,B,C';
      if (!confirm('เริ่มเรนเดอร์ Variant: ' + picked + ' จากคลิปปัจจุบัน? (ทำงานเบื้องหลัง — สลับไป Minnie ได้)')) return;
      const beatSyncEl = document.getElementById('beatSyncToggle');
      const beatSync = beatSyncEl ? beatSyncEl.checked : true;
      const eduOverlay = typeof eduOverlayOn !== 'undefined' ? eduOverlayOn : false;
      const renderBtn = document.getElementById('finalRenderBtn');
      if (renderBtn) { renderBtn.textContent = 'Queued…'; }
      showToast('Rocky เริ่มเรนเดอร์เบื้องหลัง — ดูความคืบหน้าใน Live Panel', 'info');

      var dpEl = document.getElementById('directorPresetSelect');
      var directorPreset = dpEl ? dpEl.value : 'corporate';
      fetch('/api/project/' + currentProject + '/final_render', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({beat_sync: beatSync, edu_overlay: eduOverlay, tier: currentTier, tone: currentTone, director_preset: directorPreset})
      })
      .then(function(r) { return r.text().then(function(t) { return {ok: r.ok, status: r.status, text: t}; }); })
      .then(function(result) {
        if (!result.ok) throw new Error('HTTP ' + result.status + ': ' + result.text.slice(0,200));
        const data = JSON.parse(result.text);
        showToast(data.message || 'Render started — ตรวจ Thomas เมื่อเสร็จ', 'success');
        if (renderBtn) { renderBtn.textContent = 'Final Render (Combine All)'; }
      })
      .catch(function(err) {
        showToast('Render failed: ' + err.message, 'error');
        if (renderBtn) { renderBtn.textContent = 'Final Render (Combine All)'; }
      });
    }
    
    function restoreThomasVariantViewRadios() {
      try {
        var pref = localStorage.getItem('thomasVariantView') || 'latest';
        var a = document.getElementById('thomasVarLatest');
        var b = document.getElementById('thomasVarAll');
        if (pref === 'all' && b) b.checked = true;
        else if (a) a.checked = true;
      } catch (e) {}
    }

    function onThomasVariantViewChange() {
      try {
        var all = document.getElementById('thomasVarAll');
        localStorage.setItem('thomasVariantView', (all && all.checked) ? 'all' : 'latest');
      } catch (e) {}
      loadDoneVideos();
    }
    window.onThomasVariantViewChange = onThomasVariantViewChange;

    function thomasSyncMasterTimeUpdate() {
      var refs = window.__thomasSyncRefs || [];
      if (!refs.length || !refs[0]) return;
      var m = refs[0];
      var t = m.currentTime;
      for (var i = 1; i < refs.length; i++) {
        if (refs[i].src && Math.abs(refs[i].currentTime - t) > 0.15) refs[i].currentTime = t;
      }
      var sk = document.getElementById('thomasSyncSeek');
      if (sk && m.duration && isFinite(m.duration)) {
        sk.value = String(Math.min(1000, Math.floor((t / m.duration) * 1000)));
      }
    }

    function thomasSyncSetAudio(idx) {
      window.__thomasSyncAudioIdx = idx;
      var refs = window.__thomasSyncRefs || [];
      refs.forEach(function(el, i) {
        if (!el) return;
        el.muted = (i !== idx);
      });
    }
    window.thomasSyncSetAudio = thomasSyncSetAudio;

    function thomasSyncPlayPause() {
      var refs = window.__thomasSyncRefs || [];
      var anyPlaying = refs.some(function(el) { return el && !el.paused; });
      refs.forEach(function(el) {
        if (!el || !el.src) return;
        if (anyPlaying) el.pause();
        else el.play().catch(function() {});
      });
    }
    window.thomasSyncPlayPause = thomasSyncPlayPause;

    function closeThomasSyncModal() {
      var modal = document.getElementById('thomasSyncModal');
      if (modal) modal.style.display = 'none';
      var refs = window.__thomasSyncRefs || [];
      refs.forEach(function(el) {
        if (!el) return;
        el.removeEventListener('timeupdate', thomasSyncMasterTimeUpdate);
        el.pause();
        el.src = '';
      });
      window.__thomasSyncRefs = [];
    }
    window.closeThomasSyncModal = closeThomasSyncModal;

    function thomasVariantMediaUrl(vr) {
      if (!vr) return '';
      return (vr.public_url || (vr.filename ? ('/variants/' + vr.filename) : ''));
    }
    function thomasVariantThumbHover(el) {
      if (!el || !el.getAttribute('data-tv-src')) return;
      if (!el.dataset.tvLoaded) {
        el.dataset.tvLoaded = '1';
        el.onerror = function() {
          el.onerror = null;
          try { el.removeAttribute('src'); } catch (e) {}
          el.style.display = 'none';
        };
        el.src = el.getAttribute('data-tv-src') + '?t=' + Date.now();
      }
      el.play().catch(function() {});
    }

    function openThomasSyncCompare(projectId) {
      var v = window.__thomasVideosById && window.__thomasVideosById[projectId];
      if (!v || !v.variants || v.variants.length < 2) {
        showToast('ต้องมีอย่างน้อย 2 variant ในมุมมองปัจจุบัน', 'warn');
        return;
      }
      var order = ['variant_a', 'variant_b', 'variant_c'];
      var byKey = {};
      v.variants.forEach(function(x) { byKey[x.key] = x; });
      var els = [
        document.getElementById('thomasSyncV0'),
        document.getElementById('thomasSyncV1'),
        document.getElementById('thomasSyncV2')
      ];
      var loaded = [];
      for (var i = 0; i < 3; i++) {
        var vr = byKey[order[i]];
        var el = els[i];
        if (!el) continue;
        el.removeEventListener('timeupdate', thomasSyncMasterTimeUpdate);
        el.pause();
        var u = thomasVariantMediaUrl(vr);
        if (vr && u) {
          el.onerror = function(ev) {
            ev.target.onerror = null;
            try { ev.target.removeAttribute('src'); } catch (e) {}
          };
          el.src = u + '?t=' + Date.now();
          loaded.push(el);
        } else {
          el.src = '';
        }
      }
      window.__thomasSyncRefs = loaded;
      if (!loaded.length) { showToast('ไม่มีไฟล์ variant สำหรับ sync', 'warn'); return; }
      var master = loaded[0];
      master.addEventListener('timeupdate', thomasSyncMasterTimeUpdate);
      master.addEventListener('loadedmetadata', function onMeta() {
        master.removeEventListener('loadedmetadata', onMeta);
        var sk = document.getElementById('thomasSyncSeek');
        if (sk && master.duration && isFinite(master.duration)) sk.max = '1000';
      });
      thomasSyncSetAudio(0);
      var ar0 = document.querySelector('input[name="thomasSyncAudio"][value="0"]');
      if (ar0) ar0.checked = true;
      var seek = document.getElementById('thomasSyncSeek');
      if (seek) {
        seek.oninput = function() {
          var refs = window.__thomasSyncRefs || [];
          var m = refs[0];
          if (!m || !m.duration || !isFinite(m.duration)) return;
          var t = (parseFloat(seek.value) / 1000) * m.duration;
          refs.forEach(function(el) { if (el && el.src) el.currentTime = t; });
        };
      }
      var modal = document.getElementById('thomasSyncModal');
      if (modal) modal.style.display = 'flex';
    }
    window.openThomasSyncCompare = openThomasSyncCompare;

    // Thomas: Done videos — with 3-variant viewer + รอบล่าสุด / ทั้งหมด
    function loadDoneVideos() {
      fetch('/api/videos/done')
        .then(r => r.json())
        .then(data => {
          const grid = document.getElementById('videoGrid');
          grid.innerHTML = '';
          if (!data.videos || data.videos.length === 0) {
            grid.innerHTML = '<p style="color:#9ca3af;">No videos ready yet...</p>';
            return;
          }
          window.__thomasVideosById = {};
          var latestEl = document.getElementById('thomasVarLatest');
          var latestOnly = !!(latestEl && latestEl.checked);
          data.videos.forEach(v => {
            window.__thomasVideosById[v.project_id] = v;
            const item = document.createElement('div');
            item.className = 'video-item';
            item.style.cssText = 'width:100%;margin-bottom:1.5rem;';
            const stars = '★'.repeat(Math.min(v.pinky_score || 3, 10)) + '☆'.repeat(Math.max(0, 5 - (v.pinky_score || 3)));
            const defaultFilename = v.video_path ? v.video_path.split(/[\\/]/).pop() : '';
            const hasTier = v.tier || 'marketing';
            const hasTone = v.tone || 'professional';

            const allVars = v.variants || [];
            let disp = allVars;
            if (latestOnly && allVars.length) {
              disp = allVars.filter(vr => vr.in_last_render_session);
            }

            let thomasMetaLine = '';
            if (v.last_render_at) {
              const sk = (v.last_render_session_id || '').slice(0, 8);
              const keys = (v.last_render_variant_keys || []).join(', ');
              thomasMetaLine = `<div style="color:#6b7280;font-size:0.72rem;margin-top:0.35rem;">รอบล่าสุด · session <code style="color:#93c5fd;">${sk}</code> · ${keys} · ${v.last_render_at}</div>`;
            }
            if (v.last_regen_all_note) {
              const safe = String(v.last_regen_all_note).replace(/</g, '&lt;').replace(/>/g, '&gt;');
              thomasMetaLine += `<div style="color:#a78bfa;font-size:0.72rem;margin-top:0.25rem;">โน้ต Regen All ล่าสุด: ${safe}</div>`;
            }

            let variantHtml = '';
            if (allVars.length > 0 && disp.length === 0 && latestOnly) {
              variantHtml = `<div style="color:#f59e0b;font-size:0.82rem;margin-top:0.5rem;padding:0.5rem;background:rgba(245,158,11,0.08);border-radius:8px;border:1px solid rgba(245,158,11,0.25);">ไม่มี variant ที่ตรงกับ<strong>รอบล่าสุด</strong> (ข้อมูลโปรเจกต์เก่า) — สลับเป็น「ทั้งหมดบนดิสก์」ด้านบน</div>`;
            } else if (disp.length > 0) {
              variantHtml = `
                <div style="display:grid;grid-template-columns:repeat(${disp.length},1fr);gap:0.75rem;margin-top:0.75rem;">
                  ${disp.map(vr => `
                    <div style="background:rgba(30,30,50,0.7);border:2px solid ${vr.selected ? vr.color : '#3a3a5e'};border-radius:10px;padding:0.75rem;cursor:pointer;"
                         onclick="selectVariant('${v.project_id}', '${vr.key}', this)"
                         title="Click to select ${vr.description}">
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                        <span style="background:${vr.color};color:#000;font-weight:700;padding:0.2rem 0.5rem;border-radius:4px;font-size:0.8rem;">Variant ${vr.label}</span>
                        ${vr.selected ? '<span style="color:#10b981;font-size:0.8rem;font-weight:600;">SELECTED</span>' : ''}
                      </div>
                      <div style="color:#e8e8ef;font-size:0.82rem;margin-bottom:0.4rem;font-weight:600;">${vr.description}</div>
                      <div style="color:#9ca3af;font-size:0.78rem;margin-bottom:0.5rem;">${vr.size_kb} KB</div>
                      <video preload="none" muted playsinline
                             data-tv-src="${(vr.public_url || '/variants/' + vr.filename)}"
                             style="width:100%;border-radius:6px;max-height:100px;object-fit:cover;background:#111;"
                             onmouseenter="thomasVariantThumbHover(this)" onmouseout="this.pause();this.currentTime=0"></video>
                      <div style="display:flex;gap:0.4rem;margin-top:0.5rem;">
                        <button onclick="playPreview('${v.project_id}','${vr.filename}','${(vr.public_url || '').replace(/'/g, "\\'")}');event.stopPropagation()" 
                                style="flex:1;background:rgba(126,179,255,0.15);border:1px solid #7eb3ff;color:#7eb3ff;padding:0.3rem;border-radius:4px;cursor:pointer;font-size:0.75rem;">Preview</button>
                        <button onclick="quickReEdit('${v.project_id}','${vr.key}');event.stopPropagation()"
                                style="flex:1;background:rgba(245,158,11,0.15);border:1px solid #f59e0b;color:#f59e0b;padding:0.3rem;border-radius:4px;cursor:pointer;font-size:0.75rem;">Re-edit</button>
                      </div>
                    </div>`).join('')}
                </div>`;
            } else if (allVars.length === 0) {
              variantHtml = `
                <div style="margin-top:0.75rem;">
                  <div style="color:#9ca3af;font-size:0.82rem;margin-bottom:0.5rem;">No variants rendered yet — click Final Render in Rocky tab</div>
                  <div class="video-thumbnail" onclick="playPreview('${v.project_id}','${defaultFilename}')" style="cursor:pointer;">
                    ${defaultFilename ? `<video src="/previews/${defaultFilename}?t=${Date.now()}" preload="metadata" style="pointer-events:none;max-height:120px;width:100%;object-fit:cover;border-radius:6px;" onerror="this.src='/final/${defaultFilename}'"></video>` : '<span style="color:#666;">No preview</span>'}
                  </div>
                </div>`;
            }

            let compareRow = '';
            if (disp.length >= 2) {
              compareRow = `<div style="margin-top:0.6rem;"><button type="button" class="btn-sm" onclick="openThomasSyncCompare('${v.project_id}')" style="background:rgba(139,92,246,0.15);border:1px solid #a78bfa;color:#c4b5fd;">เปรียบเทียบ sync A/B/C</button></div>`;
            }
            let cleanupRow = '';
            if (allVars.length > 0 || (v.video_path && String(v.video_path).length > 0)) {
              cleanupRow = `<div style="margin-top:0.45rem;display:flex;flex-wrap:wrap;gap:0.4rem;align-items:center;">
                <button type="button" class="btn-sm" onclick="openThomasNavyStats('${v.project_id}');event.stopPropagation()" style="background:rgba(59,130,246,0.2);border:1px solid #3b82f6;color:#93c5fd;font-size:0.72rem;">Check Stats</button>
                <button type="button" class="btn-sm" onclick="thomasCleanupVariants('${v.project_id}');event.stopPropagation()" style="background:rgba(55,65,81,0.45);border:1px solid #4b5563;color:#9ca3af;font-size:0.72rem;">ล้าง variant เก่า / thumb</button>
              </div>`;
            }

            item.innerHTML = `
              <div style="background:rgba(25,25,45,0.7);border:1px solid #3a3a5e;border-radius:12px;padding:1rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
                  <div style="display:flex;align-items:center;gap:0.75rem;">
                    <input type="checkbox" class="video-checkbox" onclick="toggleVideoSelect('${v.project_id}',this.closest('.video-item'))" />
                    <div>
                      <div style="font-weight:700;color:#e8e8ef;">${v.project_id}</div>
                      <div style="color:#9ca3af;font-size:0.78rem;">Tier: ${hasTier} | Tone: ${hasTone} | ${v.size_kb||'?'}KB</div>
                      ${thomasMetaLine}
                    </div>
                  </div>
                  <div style="display:flex;align-items:center;gap:0.75rem;">
                    <div style="text-align:right;">
                      <div style="color:#a78bfa;font-size:0.85rem;">${stars} ${v.pinky_score||0}/10</div>
                      <div style="color:${v.pinky_approved?'#10b981':'#f59e0b'};font-size:0.78rem;">${v.pinky_approved?'Pinky Approved':'Pending Review'}</div>
                    </div>
                    <div style="display:flex;gap:0.4rem;">
                      <button class="btn-sm" onclick="requestPinkyReview('${v.project_id}')">Review</button>
                      <button class="btn-sm btn-danger" onclick="deleteVideo('${v.project_id}')">Delete</button>
                    </div>
                  </div>
                </div>
                ${variantHtml}
                ${compareRow}
                ${cleanupRow}
              </div>`;
            grid.appendChild(item);
          });
          updateSelectedCount();
        });
    }

    async function selectVariant(projectId, variantKey, el) {
      try {
        const resp = await fetch(`/api/project/${projectId}/select_variant`, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({variant: variantKey})
        });
        if (resp.ok) {
          // Reload to update selection UI
          loadDoneVideos();
        }
      } catch(e) { console.error('[SelectVariant]', e); }
    }

    async function quickReEdit(projectId, variantKey) {
      if (!confirm('Quick Re-edit: Rocky will re-render this variant with a fresh look (~30s)')) return;
      try {
        const resp = await fetch(`/api/project/${projectId}/quick_re_edit`, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({variant: variantKey})
        });
        const data = await resp.json();
        alert(data.message || 'Re-editing...');
        setTimeout(loadDoneVideos, 5000);
      } catch(e) { alert('Re-edit failed: ' + e.message); }
    }
    
    function playPreview(projectId, filename, preferredUrl) {
      const modal = document.getElementById('videoPreviewModal');
      const player = document.getElementById('previewPlayer');
      window.__thomasPreviewProjectId = projectId || '';
      window.__thomasPreviewVideoPath = '';
      if (projectId && window.__thomasVideosById && window.__thomasVideosById[projectId]) {
        window.__thomasPreviewVideoPath = window.__thomasVideosById[projectId].video_path || '';
      }
      var capPanel = document.getElementById('thomasCaptionPanel');
      var capEl = document.getElementById('thomasSuggestedCaption');
      if (capPanel) capPanel.style.display = projectId ? 'block' : 'none';
      if (capEl) capEl.value = '';

      const tryPaths = [];
      if (preferredUrl && String(preferredUrl).trim()) tryPaths.push(String(preferredUrl).trim());
      tryPaths.push(
        `/variants/${filename}`,
        `/previews/${filename}`,
        `/final/${filename}`,
        `/previews/${filename.split('/').pop()}`,
        `/final/${filename.split('/').pop()}`
      );

      var _prevIdx = 0;
      player.src = tryPaths[0] + '?t=' + Date.now();
      modal.style.display = 'flex';
      
      player.onerror = function() {
        // อย่าใช้ indexOf(player.src) — browser คืน absolute URL ทำให้ได้ -1 แล้ววนโหลด /variants ไม่รู้จบ
        _prevIdx += 1;
        if (_prevIdx < tryPaths.length) {
          player.src = tryPaths[_prevIdx] + '?t=' + Date.now();
        } else {
          alert('Video file not found: ' + filename);
          closePreview();
        }
      };
      
      player.onloadeddata = () => {
        player.play();
      };
    }
    
    function closePreview() {
      const modal = document.getElementById('videoPreviewModal');
      const player = document.getElementById('previewPlayer');
      window.__thomasPreviewProjectId = '';
      var capPanel = document.getElementById('thomasCaptionPanel');
      if (capPanel) capPanel.style.display = 'none';

      player.pause();
      player.src = '';
      modal.style.display = 'none';
    }

    function _thomasApiErr(d) {
      if (!d) return 'HTTP error';
      var det = d.detail;
      if (typeof det === 'string') return det;
      if (Array.isArray(det))
        return det.map(function(it) {
          if (!it) return '';
          var loc = Array.isArray(it.loc) ? it.loc.join('.') + ': ' : '';
          return loc + (it.msg || it.message || JSON.stringify(it));
        }).join('; ') || d.message || 'HTTP error';
      if (det && typeof det === 'object' && det.message) return String(det.message);
      return d.message || 'HTTP error';
    }

    function _collectThomasQcWarnings(projectIds) {
      var lines = [];
      (projectIds || []).forEach(function(pid) {
        var v = window.__thomasVideosById && window.__thomasVideosById[pid];
        if (!v) {
          lines.push(pid + ': ไม่มีข้อมูลบนการ์ด (ลองโหลดรายการใหม่)');
          return;
        }
        var reasons = [];
        if (!v.pinky_approved) reasons.push('ยังไม่ pinky_approved');
        var vs = parseInt(v.pinky_score, 10);
        if (!isFinite(vs)) vs = 0;
        if (vs <= 8) reasons.push('คะแนนวิดีโอ ' + vs + '/10 (ต้องมากกว่า 8)');
        var ss = v.pinky_script_score != null ? (parseInt(v.pinky_script_score, 10) || 0) : 0;
        if (ss < 8) reasons.push('สคริปต์ ' + ss + '/10 (ต้อง ≥8)');
        if (reasons.length) lines.push(pid + ': ' + reasons.join(', '));
      });
      return lines;
    }

    function closeThomasNavyModal() {
      var m = document.getElementById('thomasNavyModal');
      if (m) m.style.display = 'none';
    }
    window.closeThomasNavyModal = closeThomasNavyModal;

    async function openThomasNavyStats(projectId) {
      function esc(s) { return String(s == null ? '' : s).replace(/</g, '&lt;').replace(/&/g, '&amp;'); }
      var m = document.getElementById('thomasNavyModal');
      var body = document.getElementById('thomasNavyBody');
      var note = document.getElementById('thomasNavyNote');
      var lbl = document.getElementById('thomasNavyProjectLabel');
      if (!m || !body) return;
      if (lbl) lbl.textContent = 'project_id: ' + projectId;
      body.innerHTML = '<span style="color:#9ca3af;">กำลังโหลดจาก Navy…</span>';
      if (note) note.textContent = '';
      m.style.display = 'flex';
      try {
        var r = await fetch('/api/project/' + encodeURIComponent(projectId) + '/thomas/navy_stats');
        var d = await r.json();
        if (!r.ok) throw new Error(_thomasApiErr(d));
        if (note) note.textContent = d.note || '';
        var rows = (d.platforms || []).map(function(p) {
          return '<tr><td style="padding:0.4rem 0.25rem;border-bottom:1px solid #374151;">' + esc(p.platform) + '</td>'
            + '<td style="padding:0.4rem 0.25rem;border-bottom:1px solid #374151;">' + Number(p.views || 0).toLocaleString() + '</td>'
            + '<td style="padding:0.4rem 0.25rem;border-bottom:1px solid #374151;">' + Number(p.likes || 0).toLocaleString() + '</td>'
            + '<td style="padding:0.4rem 0.25rem;border-bottom:1px solid #374151;">' + Number(p.shares || 0).toLocaleString() + '</td>'
            + '<td style="padding:0.4rem 0.25rem;border-bottom:1px solid #374151;">' + Number(p.comments || 0).toLocaleString() + '</td>'
            + '<td style="padding:0.4rem 0.25rem;border-bottom:1px solid #374151;">' + (p.engagement_rate_pct != null ? esc(p.engagement_rate_pct) : '—') + '%</td></tr>';
        }).join('');
        body.innerHTML = '<p style="margin:0 0 0.65rem;color:#a78bfa;font-weight:600;">' + esc(d.summary_hint) + '</p>'
          + '<table style="width:100%;border-collapse:collapse;font-size:0.78rem;"><thead><tr style="color:#9ca3af;text-align:left;">'
          + '<th style="padding:0.35rem 0.25rem;">แพลตฟอร์ม</th><th>Views</th><th>Likes</th><th>Shares</th><th>Comments</th><th>Eng%</th></tr></thead><tbody>'
          + rows + '</tbody></table><p style="margin:0.6rem 0 0;font-size:0.72rem;color:#6b7280;">source: ' + esc(d.source) + '</p>';
      } catch (e) {
        body.innerHTML = '<span style="color:#f87171;">' + esc(e.message || e) + '</span>';
        if (note) note.textContent = '';
      }
    }
    window.openThomasNavyStats = openThomasNavyStats;

    function approveSelectedToQueue(trustUserQc) {
      if (selectedVideos.size === 0) { alert('เลือกวิดีโอ (checkbox) ก่อน'); return; }
      var platforms = Array.from(document.querySelectorAll('input[name="platform"]:checked')).map(function(cb) { return cb.value; });
      if (!platforms.length) { alert('เลือกแพลตฟอร์ม'); return; }
      if (trustUserQc) {
        if (!confirm('「คิว + เชื่อ Checklist QC」 จะตั้ง pinky_approved = true ให้โปรเจกต์ที่ระบบยังไม่ยืนยัน และข้ามเกณฑ์คะแนนวิดีโอ (>8) / สคริปต์ (≥8)\\n\\nแน่ใจว่าต้องการส่งคิว?')) return;
      }
      var ids = Array.from(selectedVideos);
      var qcAck = false;
      if (!trustUserQc) {
        var w = _collectThomasQcWarnings(ids);
        if (w.length) {
          var msg = 'โปรเจกต์ต่อไปยังไม่ผ่านเกณฑ์ QC (Pinky):\\n\\n' + w.join('\\n') + '\\n\\nยืนยันส่งคิวต่อไป?';
          if (!confirm(msg)) return;
          qcAck = true;
        }
      }
      var scheduleTime = document.getElementById('scheduleTime').value;
      var caption = document.getElementById('scheduleCaption').value || '';
      fetch('/api/thomas/approve_selected_to_queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_ids: ids,
          platforms: platforms,
          schedule_time: scheduleTime || null,
          caption: caption,
          trust_user_qc: !!trustUserQc,
          qc_acknowledged: qcAck
        })
      })
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); })
        .then(function(x) {
          if (!x.ok) throw new Error(_thomasApiErr(x.d));
          alert(x.d.message || 'Done');
          selectedVideos.clear();
          document.querySelectorAll('.video-checkbox').forEach(function(cb) { cb.checked = false; });
          document.querySelectorAll('.video-item.selected').forEach(function(el) { el.classList.remove('selected'); });
          updateSelectedCount();
          loadDoneVideos();
          loadTodayDashboard();
        })
        .catch(function(e) { alert('ล้มเหลว: ' + e.message); });
    }
    window.approveSelectedToQueue = approveSelectedToQueue;

    async function applyThomasBestPostTime() {
      try {
        var r = await fetch('/api/thomas/suggested_post_times');
        var d = await r.json();
        if (!r.ok) throw new Error(_thomasApiErr(d));
        var inp = document.getElementById('scheduleTime');
        if (inp && d.recommended_datetime_local) inp.value = d.recommended_datetime_local;
        var h = document.getElementById('suggestedTimeHint');
        if (h && d.hint_th) h.textContent = d.hint_th.slice(0, 140);
        showToast('ตั้งเวลาแนะนำแล้ว (Navy — หัวค่ำไทย)', 'success');
      } catch (e) {
        showToast('โหลดเวลาแนะนำไม่ได้: ' + (e && e.message ? e.message : e), 'error');
      }
    }
    window.applyThomasBestPostTime = applyThomasBestPostTime;

    async function pushSelectedToSocialWebhook() {
      if (selectedVideos.size === 0) { showToast('เลือกวิดีโอก่อน', 'warn'); return; }
      var whEl = document.getElementById('socialWebhookOverride');
      var wh = whEl ? (whEl.value || '').trim() : '';
      var cap = (document.getElementById('scheduleCaption') || {}).value || '';
      var reqP = true;
      var cb = document.getElementById('webhookRequirePinky');
      if (cb) reqP = !!cb.checked;
      if (!confirm('ส่ง ' + selectedVideos.size + ' รายการไป Webhook (JSON batch)?')) return;
      try {
        var r = await fetch('/api/thomas/push_social_webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_ids: Array.from(selectedVideos),
            webhook_url: wh || null,
            caption: (cap || '').trim() || null,
            require_pinky_approved: reqP
          })
        });
        var d = await r.json();
        if (!r.ok) throw new Error(_thomasApiErr(d));
        var sk = (d.skipped || []).length;
        showToast('Webhook HTTP ' + d.http_status + ' — ส่ง ' + d.sent + ' รายการ (ข้าม ' + sk + ')', d.ok ? 'success' : 'warn');
      } catch (e) {
        showToast('Push webhook ล้มเหลว: ' + (e && e.message ? e.message : e), 'error');
      }
    }
    window.pushSelectedToSocialWebhook = pushSelectedToSocialWebhook;

    async function copyAllReadyVideoPaths() {
      try {
        var r = await fetch('/api/factory/ready_video_paths');
        var d = await r.json();
        if (!r.ok) throw new Error(_thomasApiErr(d));
        var lines = (d.paths || []).join(String.fromCharCode(10));
        if (!lines) { showToast('ยังไม่มี path พร้อม', 'warn'); return; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(lines);
          showToast('คัดลอก ' + d.count + ' path แล้ว', 'success');
        } else {
          window.prompt('Paths:', lines);
        }
      } catch (e) {
        showToast('คัดลอกไม่ได้: ' + (e && e.message ? e.message : e), 'error');
      }
    }
    window.copyAllReadyVideoPaths = copyAllReadyVideoPaths;

    async function loadSocialWebhookStatusForThomas() {
      try {
        var r = await fetch('/api/config/social_sync_status');
        var d = await r.json();
        var el = document.getElementById('socialWebhookStatus');
        if (el) {
          el.textContent = d.configured ? ('พร้อม: ' + (d.url_preview || 'set')) : '(ตั้ง SOCIAL_SYNC_WEBHOOK_URL ใน .env)';
        }
      } catch (e) {}
    }
    window.loadSocialWebhookStatusForThomas = loadSocialWebhookStatusForThomas;

    window.__dailySuggestIdeas = [];
    function closeDailySuggestModal(markSeen) {
      var m = document.getElementById('dailySuggestModal');
      if (m) m.style.display = 'none';
      if (markSeen) {
        try {
          localStorage.setItem('aqond_daily_suggest_v1_' + new Date().toISOString().slice(0, 10), '1');
        } catch (e) {}
      }
    }
    window.closeDailySuggestModal = closeDailySuggestModal;

    async function maybeOpenDailySuggestPopup() {
      try {
        var day = new Date().toISOString().slice(0, 10);
        if (localStorage.getItem('aqond_daily_suggest_v1_' + day)) return;
        var r = await fetch('/api/minnie/daily_suggestions');
        var d = await r.json();
        if (!r.ok || !d.ideas || !d.ideas.length) return;
        window.__dailySuggestIdeas = d.ideas;
        var sum = document.getElementById('dailySuggestSummary');
        var meta = d.analytics_meta || {};
        var extra = (meta.analytics_label && meta.digest_used) ? ('\\n\\n📊 ' + meta.analytics_label) : '';
        if (sum) sum.textContent = (d.summary || '') + extra;
        var wrap = document.getElementById('dailySuggestTableWrap');
        if (wrap) {
          wrap.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:0.75rem;"><thead><tr style="color:#9ca3af;"><th style="padding:0.3rem;">#</th><th style="padding:0.3rem;">สินค้า/ธีม</th><th style="padding:0.3rem;"></th></tr></thead><tbody>' +
            d.ideas.map(function(sb, i) {
              return '<tr><td style="padding:0.3rem;border-top:1px solid #334155;">' + (i + 1) + '</td><td style="padding:0.3rem;border-top:1px solid #334155;">' + escapeHtmlSq(sb.product_service).slice(0, 90) + '</td><td style="padding:0.3rem;border-top:1px solid #334155;"><button type="button" onclick="startDailySuggestRow(' + i + ')" style="padding:0.2rem 0.45rem;font-size:0.68rem;cursor:pointer;background:rgba(16,185,129,0.2);border:1px solid #10b981;color:#6ee7b7;border-radius:4px;">เริ่มเลย</button></td></tr>';
            }).join('') + '</tbody></table>';
        }
        var m = document.getElementById('dailySuggestModal');
        if (m) m.style.display = 'flex';
      } catch (e) {
        console.warn('[daily suggest]', e);
      }
    }

    async function startDailySuggestRow(idx) {
      var sb = window.__dailySuggestIdeas[idx];
      if (!sb) return;
      closeDailySuggestModal(true);
      switchTab('minnie');
      var leg = document.getElementById('minnieBriefModeLegacy');
      if (leg) leg.checked = false;
      toggleMinnieBriefMode();
      applyStructuredBriefToMinnieForm(sb);
      await createNewProject();
    }
    window.startDailySuggestRow = startDailySuggestRow;
    window.maybeOpenDailySuggestPopup = maybeOpenDailySuggestPopup;

    async function fetchThomasSuggestedCaption() {
      var pid = window.__thomasPreviewProjectId;
      if (!pid) { showToast('เปิด Preview จาก Thomas ก่อน', 'warn'); return; }
      try {
        var r = await fetch('/api/project/' + pid + '/thomas/suggested_caption');
        var d = await r.json();
        if (!r.ok) throw new Error(_thomasApiErr(d));
        var el = document.getElementById('thomasSuggestedCaption');
        if (el) el.value = d.caption || '';
        var sc = document.getElementById('scheduleCaption');
        if (sc && d.caption && !sc.value.trim()) sc.value = d.caption.split(String.fromCharCode(10)).join(' ').trim().slice(0, 400);
      } catch (e) { showToast('สร้าง caption ไม่สำเร็จ: ' + (e && e.message ? e.message : e), 'error'); }
    }
    window.fetchThomasSuggestedCaption = fetchThomasSuggestedCaption;

    function copyThomasSuggestedCaption() {
      var el = document.getElementById('thomasSuggestedCaption');
      var t = el ? el.value : '';
      if (!t) { showToast('ยังไม่มีข้อความ', 'warn'); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(function() { showToast('คัดลอกแล้ว', 'success'); }).catch(function() { alert(t); });
      } else { alert(t); }
    }
    window.copyThomasSuggestedCaption = copyThomasSuggestedCaption;

    async function embedThomasSocialMeta() {
      var pid = window.__thomasPreviewProjectId;
      if (!pid) { showToast('ไม่มีโปรเจกต์', 'warn'); return; }
      var ta = document.getElementById('thomasSuggestedCaption');
      var ov = {};
      if (ta && ta.value.trim()) ov.description = ta.value.trim().slice(0, 900);
      try {
        var r = await fetch('/api/project/' + pid + '/embed_social_metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ overrides: ov })
        });
        var d = await r.json();
        if (!r.ok) throw new Error(_thomasApiErr(d));
        var msg = 'ฝังแล้ว: ' + (d.ok || []).join(', ');
        showToast(msg, (d.failed && d.failed.length) ? 'warn' : 'success');
      } catch (e) { showToast('ฝัง metadata ล้มเหลว: ' + e.message, 'error'); }
    }
    window.embedThomasSocialMeta = embedThomasSocialMeta;

    async function thomasCleanupVariants(projectId) {
      if (!projectId || !confirm('ลบไฟล์ variant/thumb ที่ไม่ถูกชี้ใน state ของโปรเจกต์นี้?')) return;
      try {
        var r = await fetch('/api/project/' + projectId + '/cleanup_unused_variants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
        });
        var d = await r.json();
        if (!r.ok) throw new Error(_thomasApiErr(d));
        showToast('ลบ variant: ' + (d.deleted_variants || []).length + ' | thumb: ' + (d.deleted_thumbs || []).length, 'success');
        loadDoneVideos();
      } catch (e) { showToast('ล้างไม่สำเร็จ: ' + e.message, 'error'); }
    }
    window.thomasCleanupVariants = thomasCleanupVariants;

    async function thomasCleanupBulk() {
      if (!confirm('ล้าง variant/thumb เก่าทุกโปรเจกต์ — ใช้เวลาสักครู่')) return;
      try {
        var r = await fetch('/api/thomas/cleanup_unused_variants_bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
        });
        var d = await r.json();
        if (!r.ok) throw new Error(_thomasApiErr(d));
        showToast('ล้าง bulk เสร็จ — โหลดรายการใหม่', 'success');
        loadDoneVideos();
      } catch (e) { showToast('Bulk ล้มเหลว: ' + e.message, 'error'); }
    }
    window.thomasCleanupBulk = thomasCleanupBulk;

    async function thomasCleanupSelected() {
      if (selectedVideos.size === 0) { showToast('เลือกการ์ด (checkbox) ก่อน', 'warn'); return; }
      var n = selectedVideos.size;
      if (!confirm('ล้าง variant/thumb เก่าของโปรเจกต์ที่เลือก ' + n + ' รายการ?')) return;
      try {
        var r = await fetch('/api/thomas/cleanup_unused_variants_bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_ids: Array.from(selectedVideos) })
        });
        var d = await r.json();
        if (!r.ok) throw new Error(_thomasApiErr(d));
        var totV = 0, totT = 0;
        (d.results || []).forEach(function(x) {
          totV += (x.deleted_variants || []).length;
          totT += (x.deleted_thumbs || []).length;
        });
        showToast('ล้างแล้ว — variant ' + totV + ' | thumb ' + totT, 'success');
        loadDoneVideos();
      } catch (e) { showToast('ล้างที่เลือกล้มเหลว: ' + e.message, 'error'); }
    }
    window.thomasCleanupSelected = thomasCleanupSelected;

    async function copyThomasTikTokBundle() {
      var pid = window.__thomasPreviewProjectId;
      if (!pid) { showToast('เปิด Preview จาก Thomas ก่อน', 'warn'); return; }
      try {
        var r = await fetch('/api/project/' + encodeURIComponent(pid) + '/posting_bundle');
        var d = await r.json();
        if (!r.ok) throw new Error(_thomasApiErr(d));
        var capEl = document.getElementById('thomasSuggestedCaption');
        var cap = (capEl && capEl.value.trim()) ? capEl.value.trim() : (d.caption || '');
        var tags = (d.hashtags || []).join(' ');
        var vp = d.video_path || window.__thomasPreviewVideoPath || '';
        var block = '--- TikTok / Auto-Post Pack ---\\n\\nCaption:\\n' + cap + '\\n\\nHashtags:\\n' + tags + '\\n\\nVideo file:\\n' + vp + '\\n\\n--- End ---';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(block);
          showToast('คัดลอก Caption + Hashtags + Path แล้ว', 'success');
        } else {
          window.prompt('Copy:', block);
        }
      } catch (e) {
        showToast('คัดลอกไม่สำเร็จ: ' + (e && e.message ? e.message : e), 'error');
      }
    }
    window.copyThomasTikTokBundle = copyThomasTikTokBundle;

    async function auditThomasPreviewMetadata() {
      var pid = window.__thomasPreviewProjectId;
      if (!pid) { showToast('เปิด Preview ก่อน', 'warn'); return; }
      try {
        var r = await fetch('/api/project/' + encodeURIComponent(pid) + '/metadata_audit');
        var d = await r.json();
        if (!r.ok) throw new Error(_thomasApiErr(d));
        var miss = (d.missing_required || []).join(', ');
        var warn = (d.warnings || []).join(', ');
        var msg = d.ok ? 'Metadata OK — พร้อมส่งต่อ' : ('ขาด: ' + (miss || '—') + (warn ? (' | เตือน: ' + warn) : ''));
        showToast(msg, d.ok ? 'success' : 'warn');
      } catch (e) {
        showToast('Audit ล้มเหลว: ' + (e && e.message ? e.message : e), 'error');
      }
    }
    window.auditThomasPreviewMetadata = auditThomasPreviewMetadata;
    
    function loadPinkyInsights() {
      fetch('/api/pinky/insights')
        .then(r => r.json())
        .then(data => {
          document.getElementById('pinkyTotal').textContent = data.total_reviews || 0;
          document.getElementById('pinkyAvgScore').textContent = (data.avg_score || 0.0) + '/10';
          document.getElementById('pinkyApprovalRate').textContent = data.approval_rate || 0;
          document.getElementById('pinkyReworks').textContent = data.total_reworks || 0;
        });
    }
    
    function requestPinkyReview(projectId) {
      if (!confirm('Request Pinky to review this video?')) return;
      
      fetch(`/api/project/${projectId}/pinky_review`, {
        method: 'POST'
      })
      .then(r => r.json())
      .then(data => {
        alert(data.message || 'Pinky is reviewing...');
        setTimeout(loadDoneVideos, 5000);
      });
    }
    
    function sendBackToRocky(projectId) {
      const feedback = prompt('What needs to be fixed? (Feedback for Rocky):');
      if (!feedback) return;
      
      const rejectTarget = confirm('Is this a VISUAL problem? (Cancel = Script problem)')
        ? 'visual'
        : 'script';
      
      fetch(`/api/project/${projectId}/send_back_to_rocky`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback, reject_target: rejectTarget })
      })
      .then(r => r.json())
      .then(data => {
        alert(data.message || 'Sent back — ' + data.target);
        loadDoneVideos();
      });
    }
    
    function deleteVideo(projectId) {
      if (!confirm('Delete this video permanently? This cannot be undone.')) return;
      
      fetch(`/api/project/${projectId}/delete`, {
        method: 'POST',
        headers: { 'Accept': 'application/json' }
      })
      .then(async function(r) {
        var text = await r.text();
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (e) {
          data = { message: text ? text.slice(0, 300) : ('HTTP ' + r.status) };
        }
        if (!r.ok) {
          alert(data.message || data.detail || ('Delete failed: HTTP ' + r.status));
          return;
        }
        alert(data.message || 'Deleted');
        loadDoneVideos();
      })
      .catch(function(e) { alert('Delete failed: ' + (e && e.message ? e.message : e)); });
    }
    
    function toggleVideoSelect(projectId, element) {
      event.stopPropagation();
      
      if (selectedVideos.has(projectId)) {
        selectedVideos.delete(projectId);
        element.classList.remove('selected');
        element.querySelector('.video-checkbox').checked = false;
      } else {
        selectedVideos.add(projectId);
        element.classList.add('selected');
        element.querySelector('.video-checkbox').checked = true;
      }
      updateSelectedCount();
    }
    
    function updateSelectedCount() {
      document.getElementById('selectedCount').textContent = selectedVideos.size;
      const exportBtn = document.getElementById('exportRatioBtn');
      if (exportBtn) {
        exportBtn.disabled = selectedVideos.size === 0;
        exportBtn.textContent = selectedVideos.size > 0 ? 'Export ' + selectedVideos.size + ' Video(s)' : 'Select videos above first';
      }
    }
    
    function loadTodayDashboard() {
      fetch('/api/dashboard/today')
        .then(r => r.json())
        .then(data => {
          document.getElementById('todayCompleted').textContent = data.completed || 0;
          document.getElementById('todayInProgress').textContent = data.in_progress || 0;
          document.getElementById('todayScheduled').textContent = data.scheduled || 0;
          document.getElementById('todayPosted').textContent = data.posted || 0;
        });
    }
    
    function approveAndPostAll() {
      if (!confirm('🚀 Zero-Touch Mode: Approve and post ALL Pinky-approved videos?\\n\\nThis will:\\n- Select all approved videos\\n- Post to all enabled platforms\\n- Use current time as schedule\\n\\nContinue?')) {
        return;
      }
      
      const caption = document.getElementById('scheduleCaption').value || '🚀 Transform your learning with Aqond!';
      const platforms = Array.from(document.querySelectorAll('input[name="platform"]:checked')).map(cb => cb.value);
      
      fetch('/api/approve_and_post_all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platforms,
          caption
        })
      })
      .then(function(r) { return r.text().then(function(t) { return { ok: r.ok, status: r.status, t: t }; }); })
      .then(function(res) {
        var data = {};
        try { data = res.t ? JSON.parse(res.t) : {}; } catch (e) { data = { raw: res.t }; }
        if (!res.ok) {
          var detail = data.detail;
          var msg = typeof detail === 'string' ? detail : (detail && detail.message) || data.message || ('HTTP ' + res.status);
          if (detail && detail.failures) {
            msg += '\\n\\nรายละเอียด: ' + JSON.stringify(detail.failures).slice(0, 1200);
          }
          throw new Error(msg);
        }
        var failNote = (data.failures && data.failures.length)
          ? ('\\n\\nหมายเหตุ: ' + data.failures.length + ' โปรเจกต์มี error บางแพลตฟอร์ม — ดู console')
          : '';
        if (data.failures && data.failures.length) console.warn('[Thomas] partial failures', data.failures);
        alert('✅ ' + (data.message || 'โพสต์เสร็จ') + '\\n\\nจำนวน: ' + (data.posted_count || 0) + ' | แพลตฟอร์ม: ' + platforms.join(', ') + '\\nProject IDs: ' + (data.project_ids || []).join(', ') + failNote);
        selectedVideos.clear();
        loadDoneVideos();
        loadTodayDashboard();
      })
      .catch(function(err) {
        alert('โพสต์ล้มเหลว: ' + err.message);
      });
    }

    async function processDueSchedule() {
      try {
        var resp = await fetch('/api/thomas/process_due_schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        var data = {};
        try { data = await resp.json(); } catch (e) { data = {}; }
        if (!resp.ok) {
          var d = data.detail;
          throw new Error(typeof d === 'string' ? d : (d && d.message) || data.message || ('HTTP ' + resp.status));
        }
        var lines = (data.results || []).map(function(r) {
          return (r.project_id || '?') + ': ' + (r.ok ? 'OK ' + JSON.stringify(r.urls || {}) : 'FAIL ' + JSON.stringify(r.errors || r.error || []));
        }).join('\\n');
        alert('ประมวลผลคิวที่ถึงเวลา: ' + (data.processed || 0) + ' รายการ\\n\\n' + (lines || '(ไม่มีรายการถึงเวลา)'));
        loadDoneVideos();
        loadTodayDashboard();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    }
    
    function schedulePost() {
      if (selectedVideos.size === 0) {
        alert('Please select at least one video');
        return;
      }
      
      const scheduleTime = document.getElementById('scheduleTime').value;
      const caption = document.getElementById('scheduleCaption').value;
      const tpnEl = document.getElementById('targetPostTimeNote');
      const targetPostTime = tpnEl ? (tpnEl.value || '').trim() : '';
      const platforms = Array.from(document.querySelectorAll('input[name="platform"]:checked')).map(cb => cb.value);
      
      if (platforms.length === 0) {
        alert('Please select at least one platform');
        return;
      }
      
      fetch('/api/schedule_post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_ids: Array.from(selectedVideos),
          platforms,
          schedule_time: scheduleTime || null,
          caption,
          target_post_time: targetPostTime || null
        })
      })
      .then(function(r) { return r.json().then(function(data) { return { ok: r.ok, data: data }; }); })
      .then(function(res) {
        if (!res.ok) {
          alert(res.data.error || res.data.detail || 'Schedule failed');
          return;
        }
        alert(res.data.message || 'Scheduled successfully!');
        selectedVideos.clear();
        loadDoneVideos();
        loadTodayDashboard();
      });
    }
    
    // Auto-refresh every 5s
    setInterval(() => {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ action: 'list_projects' }));
      }
      loadTodayDashboard();
    }, 5000);
    
    // Load dashboard on tab switch
    // === PIN BUTTON EVENT DELEGATION ===
    document.addEventListener('click', function(e) {
      var target = e.target && e.target.closest ? e.target.closest('[data-action="pin-trend"]') : null;
      if (target) {
        var topic = target.getAttribute('data-topic');
        if (topic) { e.stopPropagation(); pinToPinkyCalendar(topic); }
      }
    });

    window.loadProjectsFromHttp = loadProjectsFromHttp;
    window.loadProjectScript = loadProjectScript;
    window.onMinnieTabActivated = function() {
      loadProjectsFromHttp();
      updateWsStatusIndicator();
      if (currentProject) loadProjectScript(currentProject);
    };

    // === BOOT ===
    connectWS();
    loadProjectsFromHttp();
    setTimeout(function() { loadFactoryQueue(false); }, 500);
    setTimeout(function() { if (window.maybeOpenDailySuggestPopup) maybeOpenDailySuggestPopup(); }, 1500);
    restoreThomasVariantViewRadios();
    setTone(currentTone);
    (function bindChatEnter() {
      var ci = document.getElementById('chatInput');
      if (ci) ci.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
      });
    })();
    (function bindScriptEditorChrome() {
      var sc = document.getElementById('scriptContent');
      if (sc) {
        sc.addEventListener('input', function() {
          scriptDirty = (sc.value !== scriptLastSavedSnapshot);
          refreshScriptEditorChrome();
        });
        refreshScriptEditorChrome();
      }
      document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 's') {
          var mt = document.getElementById('minnie-tab');
          if (mt && mt.style.display !== 'none') {
            e.preventDefault();
            saveScript();
          }
        }
      });
    })();
    var tierSel = document.getElementById('newProjectTier');
    if (tierSel) tierSel.addEventListener('change', function() {
      currentTier = tierSel.value;
      if (currentProject) {
        fetch('/api/project/' + currentProject + '/settings', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ tier: currentTier })
        }).catch(function() {});
      }
    });
    setInterval(updateWsStatusIndicator, 2500);
    try {
      if (localStorage.getItem('minnieFocusMode') === '1') setMinnieFocusMode(true, { silent: true });
    } catch (e) {}
    window.addEventListener('load', function() {
      window.loadNavyIntelligence();
    });
    
  </script>
</body>
</html>
"""
    return HTMLResponse(
        content=html,
        headers={"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache"},
    )


@app.get("/api/projects")
async def list_projects_api():
    """HTTP fallback สำหรับ dropdown — ใช้เมื่อ WebSocket ยังไม่ติดหรือแคชเก่า"""
    projects = pm.list_projects()
    return JSONResponse({"projects": [p.to_dict() for p in projects]})


@app.get("/api/factory/queue_overview")
async def factory_queue_overview():
    """สรุปโรงงาน — นับตาม state + รายการโปรเจกต์ล่าสุด"""
    from collections import Counter

    projects = pm.list_projects()
    counts: dict[str, int] = Counter(p.state.value for p in projects)
    rows: list[dict[str, Any]] = []
    for p in sorted(projects, key=lambda x: x.updated_at or "", reverse=True)[:250]:
        rows.append(
            {
                "project_id": p.project_id,
                "state": p.state.value,
                "brief": (p.brief or "")[:160],
                "updated_at": p.updated_at,
                "tone": p.tone,
                "tier": p.tier,
                "pinky_approved": p.pinky_approved,
                "has_script": bool((p.script_md or "").strip()),
                "clips": len(p.raw_clips or []),
                "variants": len(p.render_variants or {}),
            }
        )
    return JSONResponse({"counts": dict(counts), "projects": rows})


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time updates"""
    await websocket.accept()
    clients.append(websocket)
    log.info("[WS] Client connected (total: %d)", len(clients))
    
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            action = msg.get("action")
            
            if action == "list_projects":
                projects = pm.list_projects()
                project_data = []
                for p in projects:
                    proj_dict = p.to_dict()
                    project_data.append(proj_dict)
                
                await websocket.send_text(json.dumps({
                    "type": "projects",
                    "projects": project_data
                }))
            
            elif action == "chat_minnie":
                # Real-time chat with Minnie to edit script
                project_id = msg.get("project_id")
                user_message = msg.get("message")
                current_script = msg.get("current_script")
                
                # Call Minnie to update script based on chat
                response, updated_script = await handle_minnie_chat(project_id, user_message, current_script)
                
                await websocket.send_text(json.dumps({
                    "type": "chat_response",
                    "message": response,
                    "updated_script": updated_script
                }))
    
    except WebSocketDisconnect:
        clients.remove(websocket)
        log.info("[WS] Client disconnected (total: %d)", len(clients))


@app.post("/api/minnie/generate")
async def minnie_generate_direct(request: Request):
    """
    DIRECT (synchronous) script generation — waits for Minnie to finish,
    returns {project_id, script} in ONE response. No polling needed.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    tone = body.get("tone") or "professional"
    tier = body.get("tier") or "marketing"
    structured_raw = body.get("structured")
    legacy_brief = (body.get("brief") or "").strip()

    from factory.minnie_api import (
        generate_script_and_audio,
        normalize_structured_brief,
        validate_structured_brief,
        build_compiled_brief_line,
    )

    structured_brief: dict | None = None
    brief_line: str

    if isinstance(structured_raw, dict) and structured_raw:
        structured_brief = normalize_structured_brief(structured_raw)
        ok, vmsg = validate_structured_brief(structured_brief)
        if not ok:
            raise HTTPException(400, vmsg)
        brief_line = build_compiled_brief_line(structured_brief)
        log.info("[Minnie Direct] STRUCTURED brief line='%s' tone=%s tier=%s", brief_line[:80], tone, tier)
    elif legacy_brief:
        brief_line = legacy_brief
        log.info("[Minnie Direct] legacy brief='%s' tone=%s tier=%s", brief_line[:60], tone, tier)
    else:
        raise HTTPException(400, "กรอก Structured Brief หรือ Brief (legacy) อย่างใดอย่างหนึ่ง")

    proj = pm.create_project(
        brief_line,
        tone=tone,
        tier=tier,
        structured_brief=structured_brief or {},
    )

    project_id = proj.project_id
    log.info("[Minnie Direct] project_id=%s created", project_id)

    # Call Minnie synchronously — wait for the actual script
    try:
        script_md, audio_path, err = await asyncio.to_thread(
            generate_script_and_audio,
            brief_line,
            None,
            log,
            tone,
            tier,
            structured_brief,
        )
    except Exception as e:
        log.exception("[Minnie Direct] generate_script_and_audio raised")
        raise HTTPException(500, "Minnie script generation error: " + str(e))

    if not script_md:
        err_msg = str(err) if err else "No script returned"
        log.error("[Minnie Direct] Failed: %s", err_msg)
        raise HTTPException(500, "Minnie failed to generate script: " + err_msg)

    # Save script to project
    proj.script_md = script_md
    if audio_path:
        proj.audio_narration_path = audio_path
    pm.update_state(proj, ProductionState.SCRIPT_PAUSED)
    pm._save(proj)
    try:
        pm.sync_shots(proj)
    except Exception as e:
        log.warning("[Minnie Direct] sync_shots: %s", e)

    log.info("[Minnie Direct] Script saved for %s (%d chars)", project_id, len(script_md))

    # Notify all dashboard clients via WebSocket
    await broadcast_message({"type": "script_ready", "project_id": project_id})

    return JSONResponse({
        "project_id": project_id,
        "script": script_md,
        "state": "script_ready",
        "chars": len(script_md),
        "structured_mode": bool(structured_brief),
        "structured_brief": getattr(proj, "structured_brief", None) or {},
    })


@app.post("/api/minnie/compliance_check")
async def minnie_compliance_check(data: dict):
    """ตรวจ CTA / Social proof กับ structured brief — คืน patched_script ถ้ามีการแพตช์อัตโนมัติ"""
    from factory.minnie_api import (
        normalize_structured_brief,
        enforce_script_compliance,
        script_has_cta_coverage,
        script_has_social_proof_block,
    )

    script = (data.get("script") or "").strip()
    structured = normalize_structured_brief(data.get("structured") or {})
    issues: list[str] = []
    if structured and (
        structured.get("hook_insight")
        or structured.get("product_service")
        or structured.get("call_to_action")
    ):
        if not script_has_social_proof_block(script):
            issues.append("ไม่พบ Social Proof ชัดเจนในโครงบท")
        if not script_has_cta_coverage(
            script,
            structured.get("call_to_action", ""),
            structured.get("promotion_cta", ""),
        ):
            issues.append("CTA หรือรหัส/ลิงก์โปรไม่ตรงกับที่กรอกในฟอร์ม")
    patched, notes = enforce_script_compliance(script, structured or None, log)
    return JSONResponse(
        {
            "issues": issues,
            "auto_fixed_notes": notes,
            "patched_script": patched if notes else None,
        }
    )


@app.post("/api/minnie/brainstorm_ideas")
async def minnie_brainstorm_ideas(data: dict = Body(default_factory=dict)):
    """Navy เทรนด์ + Minnie (LLM หรือ template) → structured briefs หลายชุด"""
    from factory.minnie_api import brainstorm_structured_briefs_from_navy

    count = int(data.get("count") or 10)
    tier = (data.get("tier") or "marketing").strip()
    ideas, source = await asyncio.to_thread(
        brainstorm_structured_briefs_from_navy,
        log,
        count=count,
        tier=tier,
    )
    return JSONResponse({"ideas": ideas, "source": source, "count": len(ideas)})


@app.post("/api/new_project")
async def new_project(data: dict):
    """Create a new production project and start Minnie scripting"""
    tone = data.get("tone", "professional")
    tier = data.get("tier", "marketing")
    structured_raw = data.get("structured")
    legacy_brief = (data.get("brief") or "").strip()
    from factory.minnie_api import (
        normalize_structured_brief,
        validate_structured_brief,
        build_compiled_brief_line,
    )

    structured_brief: dict | None = None
    if isinstance(structured_raw, dict) and structured_raw:
        structured_brief = normalize_structured_brief(structured_raw)
        ok, vmsg = validate_structured_brief(structured_brief)
        if not ok:
            raise HTTPException(400, vmsg)
        brief = build_compiled_brief_line(structured_brief)
    elif legacy_brief:
        brief = legacy_brief
    else:
        raise HTTPException(400, "กรอก structured หรือ brief (legacy)")

    proj = pm.create_project(
        brief,
        tone=tone,
        tier=tier,
        structured_brief=structured_brief or {},
    )
    pm.update_state(proj, ProductionState.SCRIPTING)
    pm._save(proj)

    log.info("[New Project] %s | tone:%s | tier:%s", proj.project_id, tone, tier)

    # Kick off Minnie scripting in background
    asyncio.create_task(process_minnie_script(proj.project_id))

    return JSONResponse({"project_id": proj.project_id, "state": "scripting"})


async def process_minnie_script(project_id: str):
    """Background: Minnie generates script + audio with tone/tier settings"""
    from factory.minnie_api import generate_script_and_audio
    proj = pm.load_project(project_id)
    if not proj:
        return
    log.info("[Minnie] Scripting %s (tone:%s tier:%s)", project_id, proj.tone, proj.tier)
    sb = getattr(proj, "structured_brief", None) or {}
    structured_payload = None
    if isinstance(sb, dict) and (sb.get("hook_insight") or sb.get("product_service")):
        structured_payload = sb
    script_md, audio_path, err = await asyncio.to_thread(
        generate_script_and_audio,
        proj.brief,
        proj.spy_report,
        log,
        proj.tone,
        proj.tier,
        structured_payload,
    )
    if script_md:
        proj.script_md = script_md
        if audio_path:
            proj.audio_narration_path = audio_path
        pm.update_state(proj, ProductionState.SCRIPT_PAUSED)
        pm._save(proj)
        try:
            pm.sync_shots(proj)
        except Exception as e:
            log.warning("[process_minnie_script] sync_shots: %s", e)
        log.info("[Minnie] Script ready for %s", project_id)
        await broadcast_message({"type": "script_ready", "project_id": project_id})
    else:
        log.error("[Minnie] Scripting failed: %s", err)
        pm.update_state(proj, ProductionState.FAILED)
        pm._save(proj)


@app.get("/api/project/{project_id}/script")
async def get_script(project_id: str):
    """Get current script for a project"""
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    
    psr = getattr(proj, "pinky_script_review", None) or {}
    if not isinstance(psr, dict):
        psr = {}
    return JSONResponse({
        "project_id": project_id,
        "script": proj.script_md,
        "state": proj.state.value,
        "structured_brief": getattr(proj, "structured_brief", None) or {},
        "pinky_script_review": psr,
        "tone": getattr(proj, "tone", None) or "professional",
        "tier": getattr(proj, "tier", None) or "marketing",
    })


@app.post("/api/project/{project_id}/settings")
async def patch_project_settings(project_id: str, data: dict):
    """อัปเดต tone/tier ของโปรเจกต์ — ซิงค์กับปุ่มใน Minnie Studio"""
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    allowed_tones = {"toon", "funny", "professional", "sci-fi", "warm"}
    t = data.get("tone")
    if t is not None:
        tl = str(t).strip().lower()
        if tl in allowed_tones:
            proj.tone = tl
    tr = data.get("tier")
    if tr is not None and str(tr) in ("marketing", "tutorial"):
        proj.tier = str(tr)
    vre = data.get("variants_render_enabled")
    if isinstance(vre, dict):
        for k in ("variant_a", "variant_b", "variant_c"):
            if k in vre:
                proj.variants_render_enabled[k] = bool(vre[k])
    if "auto_render_variants_after_visual" in data:
        proj.auto_render_variants_after_visual = bool(data["auto_render_variants_after_visual"])
    if "target_shot_count" in data:
        try:
            proj.target_shot_count = max(0, min(12, int(data["target_shot_count"])))
        except (TypeError, ValueError):
            pass
    if "director_preset" in data and str(data["director_preset"]).strip():
        dp = str(data["director_preset"]).strip().lower()
        if dp in ("tiktok_fast", "cinematic_slow", "corporate"):
            proj.director_preset = dp
    if "production_wizard_step" in data:
        try:
            proj.production_wizard_step = max(0, int(data["production_wizard_step"]))
        except (TypeError, ValueError):
            pass
    if "multi_shot_mode" in data:
        proj.multi_shot_mode = bool(data["multi_shot_mode"])
    pm._save(proj)
    return JSONResponse(
        {
            "tone": proj.tone,
            "tier": proj.tier,
            "variants_render_enabled": proj.variants_render_enabled,
            "auto_render_variants_after_visual": proj.auto_render_variants_after_visual,
            "target_shot_count": getattr(proj, "target_shot_count", 0),
            "director_preset": getattr(proj, "director_preset", "corporate"),
            "production_wizard_step": getattr(proj, "production_wizard_step", 0),
            "multi_shot_mode": getattr(proj, "multi_shot_mode", True),
        }
    )


@app.post("/api/project/{project_id}/script")
async def save_script(project_id: str, data: dict):
    """Save updated script"""
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    
    script = data.get("script", "")
    proj.script_md = script
    pm._save(proj)
    try:
        pm.sync_shots(proj)
    except Exception as e:
        log.warning("[save_script] sync_shots: %s", e)
    asyncio.create_task(
        broadcast_message(
            {"type": "scenes_updated", "project_id": project_id, "clip_count": len(proj.raw_clips or [])}
        )
    )
    return JSONResponse({"message": "Script saved", "project_id": project_id})



@app.post("/api/pinky/review")
async def quick_pinky_review(request: Request):
    """Quick Pinky review endpoint - accepts script directly"""
    try:
        body = await request.json()
        script = body.get("script", "")
        tier = body.get("tier", "marketing")
        if not script:
            raise HTTPException(status_code=400, detail="No script provided")
        from factory.pinky_brain import review_script_by_tier as _pinky_review
        review = await asyncio.to_thread(_pinky_review, script, tier, log, True)
        auto_fixed = getattr(review, 'suggested_rewrite', None)
        if not review.approved and not auto_fixed:
            auto_fixed = None
        return {
            "score": review.score,
            "approved": review.approved,
            "feedback": review.feedback,
            "issues": getattr(review, 'issues', []),
            "auto_fixed_script": auto_fixed if not review.approved else None
        }
    except Exception as e:
        log.exception("Quick Pinky review failed")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/project/{project_id}/script/pinky_review")
async def review_script_with_pinky(project_id: str, data: dict = {}):
    """Pinky GATEKEEPER — Dual-tier review: Marketing vs Tutorial"""
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")

    # Accept tier override from frontend (from the War Room toggle)
    tier = data.get("tier") or proj.tier or "marketing"
    if tier and tier != proj.tier:
        proj.tier = tier
        pm._save(proj)

    log.info("[Pinky Gate] Reviewing script for %s (tier: %s)", project_id, tier)

    # Use tier-aware review
    try:
        from factory.pinky_brain import review_script_by_tier
        review = await asyncio.to_thread(review_script_by_tier, proj.script_md, tier, log, True)
    except Exception:
        from factory.pinky_brain import review_script
        review = await asyncio.to_thread(review_script, proj.script_md, log, auto_fix=True)
    
    # Store review
    proj.pinky_script_review = review.to_dict()
    
    # If rejected (<8/10) and auto-fixed, replace script
    if not review.approved and review.auto_fixed_content:
        log.warning("[Pinky Gate] REJECTED (score %d/10) — auto-fixed script", review.score)
        proj.script_md = review.auto_fixed_content
        pm.update_state(proj, ProductionState.SCRIPT_REJECTED)
    else:
        log.info("[Pinky Gate] Score: %d/10, Approved: %s", review.score, review.approved)
    
    pm._save(proj)
    
    # Broadcast to frontend
    asyncio.create_task(broadcast_message({
        "type": "pinky_script_review",
        "project_id": project_id,
        "approved": review.approved,
        "score": review.score,
        "feedback": review.feedback,
        "auto_fixed_script": review.auto_fixed_content
    }))
    
    return JSONResponse({
        "approved": review.approved,
        "score": review.score,
        "feedback": review.feedback,
        "issues": review.issues,
        "suggestions": review.suggestions,
        "auto_fixed_script": review.auto_fixed_content
    })


@app.post("/api/project/{project_id}/send_to_rocky")
async def send_to_rocky(project_id: str, data: dict):
    """Send finalized script to Rocky (Pinky GATEKEEPER enforced)"""
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    
    # GATEKEEPER: Check Pinky score
    pinky_review = proj.pinky_script_review or {}
    pinky_score = pinky_review.get("score", 0)
    
    if pinky_score < 8:
        raise HTTPException(403, f"Pinky blocked: Score {pinky_score}/10 — must be ≥8/10. Fix script first!")

    if _rocky_require_character_ref():
        cref = (proj.character_ref_rel or "").strip()
        if not cref:
            raise HTTPException(
                400,
                "ต้องอัปโหลดรูปตัวละครหลักในแท็บ Rocky ก่อน (ตั้งค่า ROCKY_REQUIRE_CHARACTER_REF=1 ใน .env)",
            )
        if not (AQOND_BRAIN / cref.replace("\\", "/")).is_file():
            raise HTTPException(400, "ไม่พบไฟล์รูปตัวละครบนดิสก์ — อัปโหลดใหม่")
    
    script = data.get("script", "")
    proj.script_md = script
    pm.update_state(proj, ProductionState.VISUAL_GEN)
    pm._save(proj)
    
    # Trigger async processing
    asyncio.create_task(process_rocky_visual(project_id))
    
    return JSONResponse({"message": "Pinky approved — sent to Rocky!", "project_id": project_id})


@app.get("/api/project/{project_id}/production")
async def get_production_manager_state(project_id: str, sync: int = Query(0)):
    """Multi-shot Production Manager: shots, wizard, director preset, credit hint."""
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    if sync == 1:
        pm.sync_shots(proj)
        proj = pm.load_project(project_id)
    from factory.script_segmentation import shots_for_generation

    n = len(shots_for_generation(proj.script_md or "", target_count=proj.target_shot_count or 0, max_shots=12))
    per = 1.0
    try:
        per = float((os.getenv("GROK_CREDIT_UNITS_PER_SHOT") or "1.0").strip())
    except ValueError:
        per = 1.0
    est = round(max(n, int(proj.target_shot_count or 0) or n) * per, 2)
    return JSONResponse(
        {
            "project_id": project_id,
            "shots": getattr(proj, "shots", []) or [],
            "target_shot_count": getattr(proj, "target_shot_count", 0),
            "director_preset": getattr(proj, "director_preset", "corporate"),
            "production_wizard_step": getattr(proj, "production_wizard_step", 0),
            "multi_shot_mode": getattr(proj, "multi_shot_mode", True),
            "credit_estimate_units": est,
            "segment_preview_count": n,
        }
    )


@app.post("/api/project/{project_id}/production/sync_shots")
async def post_sync_shots(project_id: str):
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    pm.sync_shots(proj)
    return JSONResponse({"ok": True, "shots": proj.shots})


@app.get("/api/project/{project_id}/scenes")
async def get_scenes(project_id: str):
    """Get all scenes/clips for storyboard (includes Take A/B/C metadata)."""
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")

    from factory.script_segmentation import shots_for_generation
    from factory.shot_qc import assess_shot_clip
    from factory.shot_takes import master_clip_path_for_index, migrate_shot_variants_from_raw_clips

    migrate_shot_variants_from_raw_clips(proj)
    shot_specs = shots_for_generation(
        proj.script_md or "",
        target_count=proj.target_shot_count or 0,
        max_shots=12,
    )
    raw_list = list(proj.raw_clips or [])
    n = max(len(shot_specs), len(raw_list))
    scenes = []
    min_b = _min_scene_video_bytes()

    for idx in range(n):
        spec_i = shot_specs[idx] if idx < len(shot_specs) else {}
        d = (spec_i.get("description") or "").strip() or f"Scene {idx + 1}"
        vp = (spec_i.get("visual_prompt") or "").strip()
        vo = (spec_i.get("voiceover") or "").strip()
        blk = spec_i.get("block", "value") if spec_i else "value"
        takes = _shot_takes_api(project_id, proj, idx)
        raw = (master_clip_path_for_index(proj, idx) or (raw_list[idx] if idx < len(raw_list) else "") or "").strip()

        if not raw:
            # Not a Pinky AI rejection — clip slot empty (not generated yet or batch not reached).
            scenes.append(
                {
                    "index": idx,
                    "video_path": "",
                    "video_url": None,
                    "description": d,
                    "visual_prompt": vp,
                    "voiceover": vo,
                    "status": "missing",
                    "thumb_url": None,
                    "block": blk,
                    "pinky_qc": {"badge": "pending", "detail": "no_clip"},
                    "pinky_badge": "pending",
                    "takes": takes,
                }
            )
            continue
        cp = Path(raw)
        if not cp.is_absolute():
            cp = (AQOND_BRAIN / raw.replace("\\", "/").lstrip("/")).resolve()
        else:
            cp = cp.resolve()
        if not cp.is_file():
            scenes.append(
                {
                    "index": idx,
                    "video_path": raw,
                    "video_url": None,
                    "description": d,
                    "visual_prompt": vp,
                    "voiceover": vo,
                    "status": "missing",
                    "thumb_url": None,
                    "block": blk,
                    "pinky_qc": {"badge": "fail", "detail": "missing_file"},
                    "pinky_badge": "fail",
                    "takes": takes,
                }
            )
            continue
        sz = cp.stat().st_size
        if sz < min_b:
            log.warning(
                "[scenes] %s scene %d: %s size=%d < min=%d — ไม่ใช่คลิป Grok เต็ม",
                project_id,
                idx,
                cp.name,
                sz,
                min_b,
            )
            scenes.append(
                {
                    "index": idx,
                    "video_path": raw,
                    "video_url": None,
                    "description": d,
                    "visual_prompt": vp,
                    "voiceover": vo,
                    "status": "stub",
                    "thumb_url": None,
                    "clip_bytes": sz,
                    "min_bytes": min_b,
                    "block": blk,
                    "pinky_qc": {"badge": "warn", "detail": f"small:{sz}"},
                    "pinky_badge": "warn",
                    "takes": takes,
                }
            )
            continue
        qc = assess_shot_clip(str(cp), min_bytes=min_b)
        scenes.append(
            {
                "index": idx,
                "video_path": raw,
                "video_url": f"/api/project/{project_id}/scene/{idx}/video",
                "description": d,
                "visual_prompt": vp,
                "voiceover": vo,
                "status": "done",
                "thumb_url": f"/api/project/{project_id}/scene/{idx}/thumb.jpg",
                "block": blk,
                "pinky_qc": qc,
                "pinky_badge": qc.get("badge", "warn"),
                "takes": takes,
            }
        )

    master_ready = bool(
        scenes
        and all((s.get("pinky_badge") == "pass" and s.get("status") == "done") for s in scenes)
    )

    st = getattr(proj, "state", None)
    state_val = st.value if st is not None and hasattr(st, "value") else (str(st) if st is not None else "")

    return JSONResponse(
        {
            "project_id": project_id,
            "scenes": scenes,
            "total": len(scenes),
            "target_shot_count": getattr(proj, "target_shot_count", 0),
            "director_preset": getattr(proj, "director_preset", "corporate"),
            "production_wizard_step": getattr(proj, "production_wizard_step", 0),
            "master_ready": master_ready,
            "production_state": state_val,
        }
    )


@app.get("/api/project/{project_id}/scene/{scene_idx}/thumb.jpg")
async def get_scene_thumb_jpeg(
    project_id: str,
    scene_idx: int,
    force: int = Query(0, description="1 = สร้าง thumb แม้ไฟล์เล็กกว่า SCENE_VIDEO_MIN_BYTES (debug)"),
):
    """JPEG โปสเตอร์เฟรมแรกจากคลิป Grok — ใช้ใน Storyboard Grid"""
    from factory.shot_takes import master_clip_path_for_index, migrate_shot_variants_from_raw_clips

    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    if scene_idx < 0 or scene_idx > 48:
        raise HTTPException(404, "Scene not found")
    migrate_shot_variants_from_raw_clips(proj)
    raw = (master_clip_path_for_index(proj, scene_idx) or "").strip()
    if not raw:
        raise HTTPException(404, "Scene not found")
    cp = Path(raw)
    if not cp.is_absolute():
        cp = (AQOND_BRAIN / raw.replace("\\", "/").lstrip("/")).resolve()
    else:
        cp = cp.resolve()
    if not cp.is_file():
        raise HTTPException(404, "Thumbnail not available")
    min_b = _min_scene_video_bytes()
    if force != 1 and cp.stat().st_size < min_b:
        raise HTTPException(404, "Thumbnail not available for stub clip")
    th = THUMB_DIR / f"{project_id}_sc{scene_idx}.jpg"
    if not _ensure_scene_thumb(cp, th):
        raise HTTPException(404, "Thumbnail not available")
    return FileResponse(th, media_type="image/jpeg")


@app.get("/api/project/{project_id}/scene/{scene_idx}/video")
async def get_scene_video_file(
    project_id: str,
    scene_idx: int,
    force: int = Query(0, description="1 = สตรีมไฟล์แม้เล็กกว่า SCENE_VIDEO_MIN_BYTES (debug)"),
):
    """
    สตรีมคลิปฉากจาก path จริง (เช่น Grok ใน Temp หรือ output/) — ไม่ผ่าน /previews mount
    """
    from factory.shot_takes import master_clip_path_for_index, migrate_shot_variants_from_raw_clips

    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    if scene_idx < 0 or scene_idx > 48:
        raise HTTPException(404, "Scene not found")
    migrate_shot_variants_from_raw_clips(proj)
    raw = (master_clip_path_for_index(proj, scene_idx) or "").strip()
    if not raw:
        raise HTTPException(404, "Video file missing on disk")
    cp = Path(raw)
    if not cp.is_absolute():
        cp = (AQOND_BRAIN / raw.replace("\\", "/").lstrip("/")).resolve()
    else:
        cp = cp.resolve()
    if not cp.is_file():
        raise HTTPException(404, "Video file missing on disk")
    sz = cp.stat().st_size
    min_b = _min_scene_video_bytes()
    log.info(
        "[Scene Video] %s scene %d file=%s size=%d bytes (%.2f MB) min_allowed=%d force=%s",
        project_id,
        scene_idx,
        cp.name,
        sz,
        sz / (1024 * 1024),
        min_b,
        force,
    )
    if force == 1 and sz < min_b:
        log.warning(
            "[Scene Video] force=1 — สตรีมไฟล์จิ๋ว %d B (อาจเป็น error body จาก CDN)",
            sz,
        )
    if force != 1 and sz < min_b:
        raise HTTPException(
            503,
            detail=(
                f"คลิปเล็กเกินไป ({sz} B) — ไม่ใช่วิดีโอ Grok คุณภาพเต็ม; "
                f"กด Regen (ขั้นต่ำ {min_b} B) หรือ ?force=1 เพื่อดูไฟล์บนดิสก์"
            ),
        )
    return FileResponse(
        str(cp),
        media_type="video/mp4",
        filename=cp.name,
    )


@app.get("/api/project/{project_id}/shot/{scene_idx}/take/{take_key}/thumb.jpg")
async def get_take_thumb_jpeg(
    project_id: str,
    scene_idx: int,
    take_key: str,
    force: int = Query(0),
):
    from factory.shot_takes import migrate_shot_variants_from_raw_clips

    if take_key not in ("variant_a", "variant_b", "variant_c"):
        raise HTTPException(400, "Invalid take")
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    migrate_shot_variants_from_raw_clips(proj)
    sv = (proj.shot_variants or {}).get(str(scene_idx), {})
    if not isinstance(sv, dict):
        raise HTTPException(404, "Take not found")
    raw = str(sv.get(take_key) or "").strip()
    if not raw:
        raise HTTPException(404, "Take not found")
    cp = Path(raw)
    if not cp.is_absolute():
        cp = (AQOND_BRAIN / raw.replace("\\", "/").lstrip("/")).resolve()
    else:
        cp = cp.resolve()
    if not cp.is_file():
        raise HTTPException(404, "Thumbnail not available")
    min_b = _min_scene_video_bytes()
    if force != 1 and cp.stat().st_size < min_b:
        raise HTTPException(404, "Thumbnail not available for stub clip")
    th = THUMB_DIR / f"{project_id}_sc{scene_idx}_{take_key}.jpg"
    if not _ensure_scene_thumb(cp, th):
        raise HTTPException(404, "Thumbnail not available")
    return FileResponse(th, media_type="image/jpeg")


@app.get("/api/project/{project_id}/shot/{scene_idx}/take/{take_key}/video")
async def get_take_video_file(
    project_id: str,
    scene_idx: int,
    take_key: str,
    force: int = Query(0),
):
    from factory.shot_takes import migrate_shot_variants_from_raw_clips

    if take_key not in ("variant_a", "variant_b", "variant_c"):
        raise HTTPException(400, "Invalid take")
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    migrate_shot_variants_from_raw_clips(proj)
    sv = (proj.shot_variants or {}).get(str(scene_idx), {})
    if not isinstance(sv, dict):
        raise HTTPException(404, "Take not found")
    raw = str(sv.get(take_key) or "").strip()
    if not raw:
        raise HTTPException(404, "Video not found")
    cp = Path(raw)
    if not cp.is_absolute():
        cp = (AQOND_BRAIN / raw.replace("\\", "/").lstrip("/")).resolve()
    else:
        cp = cp.resolve()
    if not cp.is_file():
        raise HTTPException(404, "Video not found")
    sz = cp.stat().st_size
    min_b = _min_scene_video_bytes()
    if force != 1 and sz < min_b:
        raise HTTPException(
            503,
            detail=f"คลิปเล็กเกินไป ({sz} B) — กด Gen Take ใหม่หรือ ?force=1",
        )
    return FileResponse(str(cp), media_type="video/mp4", filename=cp.name)


def _credit_check_payload(project_id: str) -> dict[str, Any]:
    proj = pm.load_project(project_id)
    if not proj:
        return {
            "ok": False,
            "estimate": 0.0,
            "budget": 0.0,
            "wallet_url": os.getenv("WALLET_TOPUP_URL", "#"),
            "message": "Project not found",
        }
    from factory.script_segmentation import shots_for_generation

    n = len(
        shots_for_generation(
            proj.script_md or "",
            target_count=proj.target_shot_count or 0,
            max_shots=12,
        )
    )
    per = 1.0
    try:
        per = float((os.getenv("GROK_CREDIT_UNITS_PER_SHOT") or "1.0").strip())
    except ValueError:
        per = 1.0
    est = round(max(n, int(proj.target_shot_count or 0) or n) * per, 2)
    try:
        budget = float((os.getenv("FACTORY_CREDIT_BUDGET", "999999")).strip())
    except ValueError:
        budget = 999999.0
    ok = est <= budget
    return {
        "ok": ok,
        "estimate": est,
        "budget": budget,
        "wallet_url": os.getenv("WALLET_TOPUP_URL", "#"),
        "message": None if ok else "Credit estimate exceeds FACTORY_CREDIT_BUDGET — top up or raise budget in .env",
    }


@app.get("/api/project/{project_id}/production/credit_check")
async def production_credit_check(project_id: str):
    return JSONResponse(_credit_check_payload(project_id))


@app.post("/api/project/{project_id}/shot/{scene_idx}/generate_take")
async def generate_take_endpoint(project_id: str, scene_idx: int, data: dict = Body(default_factory=dict)):
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    take_key = str(data.get("take", "variant_a")).strip()
    if take_key not in ("variant_a", "variant_b", "variant_c"):
        raise HTTPException(400, "take must be variant_a|variant_b|variant_c")
    creativity = str(data.get("creativity", "medium"))
    cr = _credit_check_payload(project_id)
    if not cr.get("ok"):
        raise HTTPException(
            status_code=402,
            detail={
                "message": cr.get("message") or "Insufficient credit budget",
                "wallet_url": cr.get("wallet_url"),
                "estimate": cr.get("estimate"),
                "budget": cr.get("budget"),
            },
        )
    asyncio.create_task(process_generate_take(project_id, scene_idx, take_key, creativity))
    return JSONResponse(
        {
            "message": f"Queued Gen {take_key} for shot {scene_idx + 1}",
            "project_id": project_id,
            "scene_index": scene_idx,
            "take": take_key,
        }
    )


@app.post("/api/project/{project_id}/shot/{scene_idx}/select_take")
async def select_take_endpoint(project_id: str, scene_idx: int, data: dict = Body(default_factory=dict)):
    from factory.shot_takes import select_shot_take

    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    take_key = str(data.get("take", "variant_a")).strip()
    if take_key not in ("variant_a", "variant_b", "variant_c"):
        raise HTTPException(400, "take must be variant_a|variant_b|variant_c")
    if not select_shot_take(proj, scene_idx, take_key):
        raise HTTPException(400, "Selected take has no file on disk")
    try:
        pm.sync_shots(proj)
    except Exception as e:
        log.warning("[select_take] sync_shots: %s", e)
    pm._save(proj)
    await broadcast_message({"type": "scene_updated", "project_id": project_id, "scene_idx": scene_idx})
    return JSONResponse({"ok": True, "selected": take_key})


@app.post("/api/project/{project_id}/production/batch_generate")
async def production_batch_generate(project_id: str, data: dict = Body(default_factory=dict)):
    creativity = str(data.get("creativity", "medium"))
    cr = _credit_check_payload(project_id)
    if not cr.get("ok"):
        raise HTTPException(
            status_code=402,
            detail={
                "message": cr.get("message") or "Insufficient credit budget",
                "wallet_url": cr.get("wallet_url"),
                "estimate": cr.get("estimate"),
                "budget": cr.get("budget"),
            },
        )
    asyncio.create_task(process_batch_queue(project_id, creativity))
    return JSONResponse({"ok": True, "message": "Batch production queue started", "credit": cr})


@app.post("/api/project/{project_id}/master_assembly")
async def master_assembly_endpoint(project_id: str, data: dict = Body(default_factory=dict)):
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    try:
        pm.sync_shots(proj)
    except Exception:
        pass
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    for s in proj.shots or []:
        if s.get("status") != "locked":
            raise HTTPException(
                400,
                detail={
                    "message": "Every shot must be Pinky PASS (locked) before Master Assembly",
                    "blocking_shot": s,
                },
            )
    proj.beat_sync = data.get("beat_sync", proj.beat_sync)
    proj.edu_overlay = data.get("edu_overlay", proj.edu_overlay)
    if data.get("tier"):
        proj.tier = data["tier"]
    if data.get("tone"):
        proj.tone = data["tone"]
    dp = data.get("director_preset")
    if dp and str(dp).strip().lower() in ("tiktok_fast", "cinematic_slow", "corporate"):
        proj.director_preset = str(dp).strip().lower()
    pm.update_state(proj, ProductionState.EDITING)
    pm._save(proj)
    rocky_render_cancel_event(project_id).clear()
    asyncio.create_task(process_rocky_editing(project_id))
    return JSONResponse({"message": "Master Assembly (variants render) started", "project_id": project_id})


@app.post("/api/generate-shot")
async def api_generate_shot_alias(data: dict = Body(default_factory=dict)):
    """Alias: POST body project_id, scene_index, take, creativity."""
    project_id = str(data.get("project_id") or data.get("projectId") or "").strip()
    if not project_id:
        raise HTTPException(400, "project_id required")
    try:
        scene_idx = int(data.get("scene_index", data.get("scene_idx", 0)))
    except (TypeError, ValueError):
        raise HTTPException(400, "scene_index required")
    return await generate_take_endpoint(project_id, scene_idx, data)


@app.get("/api/project/{project_id}/refs")
async def get_project_refs(project_id: str):
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    out: dict[str, Any] = {"character_ref_url": None, "scene_refs": []}
    if proj.character_ref_rel:
        fn = Path(proj.character_ref_rel).name
        fp = REFS_DIR / project_id / fn
        if fp.is_file():
            out["character_ref_url"] = f"/refs/{project_id}/{fn}"
    for k, rel in sorted(
        (proj.scene_ref_rel or {}).items(),
        key=lambda x: int(x[0]) if str(x[0]).isdigit() else 0,
    ):
        fn = Path(rel).name
        fp = REFS_DIR / project_id / fn
        if fp.is_file():
            idx = int(k) if str(k).isdigit() else k
            out["scene_refs"].append({"index": idx, "url": f"/refs/{project_id}/{fn}"})
    return JSONResponse(out)


@app.post("/api/project/{project_id}/refs/character")
async def upload_character_ref(project_id: str, file: UploadFile = File(...)):
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    body = await file.read()
    if len(body) > MAX_REF_BYTES:
        raise HTTPException(400, "ไฟล์ใหญ่เกิน 12MB")
    suffix = Path(file.filename or "c.jpg").suffix.lower()
    if suffix not in ALLOWED_REF_EXT:
        suffix = ".jpg"
    dest_dir = _ensure_refs_project_dir(project_id)
    dest = dest_dir / f"character{suffix}"
    dest.write_bytes(body)
    rel = f"output/refs/{project_id}/character{suffix}"
    proj.character_ref_rel = rel.replace("\\", "/")
    pm._save(proj)
    return JSONResponse(
        {
            "ok": True,
            "character_ref_rel": proj.character_ref_rel,
            "url": f"/refs/{project_id}/character{suffix}",
        }
    )


@app.post("/api/project/{project_id}/refs/scene/{scene_idx}")
async def upload_scene_ref(project_id: str, scene_idx: int, file: UploadFile = File(...)):
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    if scene_idx < 0 or scene_idx > 32:
        raise HTTPException(400, "Invalid scene index")
    body = await file.read()
    if len(body) > MAX_REF_BYTES:
        raise HTTPException(400, "ไฟล์ใหญ่เกิน 12MB")
    suffix = Path(file.filename or "s.jpg").suffix.lower()
    if suffix not in ALLOWED_REF_EXT:
        suffix = ".jpg"
    dest_dir = _ensure_refs_project_dir(project_id)
    dest = dest_dir / f"scene_{scene_idx}{suffix}"
    dest.write_bytes(body)
    rel = f"output/refs/{project_id}/scene_{scene_idx}{suffix}"
    if not proj.scene_ref_rel:
        proj.scene_ref_rel = {}
    proj.scene_ref_rel[str(scene_idx)] = rel.replace("\\", "/")
    pm._save(proj)
    return JSONResponse(
        {
            "ok": True,
            "scene_index": scene_idx,
            "scene_ref_rel": proj.scene_ref_rel[str(scene_idx)],
            "url": f"/refs/{project_id}/scene_{scene_idx}{suffix}",
        }
    )


@app.post("/api/project/{project_id}/scene/{scene_idx}/regen")
async def regenerate_scene(project_id: str, scene_idx: int, data: dict):
    """Regenerate a specific scene with creativity level"""
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    
    creativity_level = data.get("creativity_level", "medium")
    
    # Trigger scene regeneration
    asyncio.create_task(process_scene_regen(project_id, scene_idx, creativity_level))
    
    return JSONResponse({
        "message": f"Regenerating scene {scene_idx} (creativity: {creativity_level})...",
        "project_id": project_id
    })


@app.post("/api/project/{project_id}/scenes/regen_all")
async def regenerate_all_scenes(project_id: str, data: dict = Body(default_factory=dict)):
    """Regen ทุกฉากตามลำดับ (background) — ใช้เมื่อภาพรวมไม่เข้าพวก"""
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    body = data or {}
    creativity_level = body.get("creativity_level", "medium")
    note = (body.get("note") or "").strip()
    if note:
        proj.last_regen_all_note = note[:2000]
        hist = list(getattr(proj, "regen_all_history", None) or [])
        hist.append(
            {
                "at": datetime.now(timezone.utc).isoformat(),
                "note": note[:500],
            }
        )
        proj.regen_all_history = hist[-40:]
        pm._save(proj)
    asyncio.create_task(process_regen_all_scenes(project_id, creativity_level, note))
    return JSONResponse(
        {
            "message": "Queued Regen All — ดูความคืบหน้าใน Live Panel",
            "project_id": project_id,
        }
    )


@app.post("/api/project/{project_id}/rocky/render/cancel")
async def cancel_rocky_variant_render(project_id: str):
    """ขอหยุดการเรนเดอร์ variant ระหว่างรัน (ฆ่า FFmpeg รอบปัจจุบัน)"""
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    rocky_render_cancel_event(project_id).set()
    return JSONResponse({"ok": True, "project_id": project_id, "message": "ส่งสัญญาณหยุดแล้ว"})


@app.post("/api/rocky/render")
async def rocky_render_alias(request: Request, background_tasks: BackgroundTasks):
    """Alias: Rocky render - accepts project_id in body"""
    try:
        body = await request.json()
        project_id = body.get("project_id") or body.get("projectId")
        if not project_id:
            raise HTTPException(status_code=400, detail="project_id required")
        beat_sync = body.get("beat_sync", True)
        edu_overlay = body.get("edu_overlay", False)
        tier = body.get("tier", "marketing")
        tone = body.get("tone", "professional")
        project = pm.load_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        project.beat_sync = beat_sync
        project.edu_overlay = edu_overlay
        project.tier = tier
        project.tone = tone
        pm._save(project)
        rocky_render_cancel_event(project_id).clear()
        background_tasks.add_task(process_rocky_editing, project_id)
        return {"status": "rendering", "project_id": project_id, "message": "Rocky started rendering"}
    except HTTPException:
        raise
    except Exception as e:
        log.exception("Rocky render alias failed")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/project/{project_id}/final_render")
async def final_render(project_id: str, data: dict = {}):
    """Combine all scenes — render 3 variants (A=Fantasy, B=Tutorial, C=Viral)"""
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")

    # Save render settings from UI
    proj.beat_sync = data.get("beat_sync", proj.beat_sync)
    proj.edu_overlay = data.get("edu_overlay", proj.edu_overlay)
    if data.get("tier"):
        proj.tier = data["tier"]
    if data.get("tone"):
        proj.tone = data["tone"]
    dp = data.get("director_preset")
    if dp and str(dp).strip().lower() in ("tiktok_fast", "cinematic_slow", "corporate"):
        proj.director_preset = str(dp).strip().lower()

    pm.update_state(proj, ProductionState.EDITING)
    pm._save(proj)

    rocky_render_cancel_event(project_id).clear()
    asyncio.create_task(process_rocky_editing(project_id))
    return JSONResponse({"message": "Rendering 3 variants (A/B/C)...", "project_id": project_id})


@app.get("/api/videos/done")
async def get_done_videos():
    """Get all videos ready for distribution (Pinky approved or pending review)"""
    projects = pm.list_projects()
    done_videos = []
    
    for proj in projects:
        if proj.state in [ProductionState.QC, ProductionState.APPROVED, ProductionState.DONE]:
            video_path = proj.edited_video_path
            if video_path and Path(video_path).exists():
                p = Path(video_path)
                
                # Get Pinky review data
                pinky_score = proj.pinky_video_review.get("score", 0) if proj.pinky_video_review else 0
                pinky_feedback = proj.pinky_video_review.get("feedback", "") if proj.pinky_video_review else ""
                psr = proj.pinky_script_review or {}
                try:
                    pinky_script_score = int(psr.get("score") or 0)
                except (TypeError, ValueError):
                    pinky_script_score = 0
                pinky_script_approved = bool(psr.get("approved", False))
                
                # Collect variant info
                variants_info = []
                variant_labels = {
                    "variant_a": ("A", "Sci-Fi / Fantasy", "#7eb3ff"),
                    "variant_b": ("B", "Instories / Luxury", "#c9a227"),
                    "variant_c": ("C", "Viral / TikTok", "#f59e0b"),
                }
                last_keys = list(getattr(proj, "last_render_variant_keys", None) or [])
                last_keys_set = set(last_keys)
                for vk, (label, desc, color) in variant_labels.items():
                    vpath = proj.render_variants.get(vk, "")
                    if not vpath:
                        continue
                    vp = Path(vpath)
                    if not vp.is_absolute():
                        vp = (AQOND_BRAIN / str(vpath).replace("\\", "/").lstrip("/")).resolve()
                    pub = _static_url_for_output_video(vp)
                    if not pub:
                        log.warning(
                            "[videos/done] ข้าม %s: ไฟล์ไม่อยู่ใต้ variants/previews/final — %s",
                            vk,
                            vp,
                        )
                        continue
                    variants_info.append(
                        {
                            "key": vk,
                            "label": label,
                            "description": desc,
                            "color": color,
                            "filename": vp.name,
                            "public_url": pub,
                            "size_kb": round(vp.stat().st_size / 1024, 1),
                            "selected": proj.selected_variant == vk,
                            "in_last_render_session": vk in last_keys_set
                            if last_keys_set
                            else True,
                        }
                    )

                done_videos.append(
                    {
                        "project_id": proj.project_id,
                        "video_path": video_path,
                        "size_kb": round(p.stat().st_size / 1024, 1),
                        "duration_sec": 60,
                        "state": proj.state.value,
                        "pinky_score": pinky_score,
                        "pinky_approved": proj.pinky_approved,
                        "pinky_script_score": pinky_script_score,
                        "pinky_script_approved": pinky_script_approved,
                        "pinky_feedback": pinky_feedback,
                        "rework_count": proj.rework_count,
                        "tone": proj.tone,
                        "tier": proj.tier,
                        "variants": variants_info,
                        "selected_variant": proj.selected_variant,
                        "last_render_session_id": getattr(
                            proj, "last_render_session_id", ""
                        )
                        or "",
                        "last_render_at": getattr(proj, "last_render_at", "") or "",
                        "last_render_variant_keys": last_keys,
                        "last_regen_all_note": getattr(proj, "last_regen_all_note", "")
                        or "",
                    }
                )
    
    return JSONResponse({"videos": done_videos})


@app.post("/api/schedule_post")
async def schedule_post(data: dict):
    """Schedule videos for distribution (Pinky approved only)"""
    video_ids = data.get("video_ids", [])
    platforms = data.get("platforms", [])
    schedule_time = data.get("schedule_time")
    caption = data.get("caption", "")
    target_post_time = data.get("target_post_time")

    if not video_ids or not platforms:
        raise HTTPException(400, "Missing video_ids or platforms")
    
    # Verify all videos are Pinky approved
    not_approved = []
    for vid_id in video_ids:
        proj = pm.load_project(vid_id)
        if proj and not proj.pinky_approved:
            not_approved.append(vid_id)
    
    if not_approved:
        return JSONResponse({
            "error": f"{len(not_approved)} videos not Pinky approved",
            "not_approved": not_approved
        }, status_code=400)
    
    # Store schedule (รันได้จริงผ่าน POST /api/thomas/process_due_schedule เมื่อถึงเวลา)
    schedules = []
    for vid_id in video_ids:
        schedule_entry = {
            "schedule_id": str(uuid.uuid4()),
            "project_id": vid_id,
            "platforms": platforms,
            "schedule_time": schedule_time or datetime.now().isoformat(timespec="seconds"),
            "caption": caption,
            "status": "scheduled",
        }
        schedules.append(schedule_entry)
    
    schedule_file = AQOND_BRAIN / "output" / "schedule.json"
    existing = []
    if schedule_file.exists():
        existing = json.loads(schedule_file.read_text(encoding="utf-8"))
    
    existing.extend(schedules)
    schedule_file.write_text(json.dumps(existing, indent=2, ensure_ascii=False), encoding="utf-8")
    
    log.info("[Thomas] Scheduled %d videos", len(video_ids))
    
    return JSONResponse({
        "message": f"Scheduled {len(video_ids)} videos for {', '.join(platforms)}",
        "schedules": schedules
    })


@app.post("/api/thomas/approve_selected_to_queue")
async def approve_selected_to_queue(data: dict):
    """
    ติ๊กหลายโปรเจกต์ → อนุมัติ (ถ้าต้องการ) แล้วใส่คิว schedule.json ทีเดียว
    trust_user_qc: true = ติ๊กว่าผ่าน QC แล้ว (ตั้ง pinky_approved) แม้ระบบยังไม่ติ๊ก
    qc_acknowledged: true = ผู้ใช้ยืนยันใน UI หลัง Pinky QC guard (ข้ามเกณฑ์คะแนน)
    """
    ids = data.get("project_ids") or data.get("video_ids") or []
    platforms = data.get("platforms") or ["facebook", "tiktok"]
    schedule_time = data.get("schedule_time")
    caption = data.get("caption") or ""
    target_post_time = data.get("target_post_time")
    trust_user_qc = bool(data.get("trust_user_qc", False))
    qc_acknowledged = bool(data.get("qc_acknowledged", False))
    bypass_strict_qc = trust_user_qc or qc_acknowledged
    if not ids or not platforms:
        raise HTTPException(400, "project_ids และ platforms จำเป็น")

    approved: list[str] = []
    skipped: list[dict[str, str]] = []
    for pid in ids:
        proj = pm.load_project(pid)
        if not proj:
            skipped.append({"project_id": pid, "reason": "not_found"})
            continue
        if proj.state not in (
            ProductionState.QC,
            ProductionState.APPROVED,
            ProductionState.DONE,
        ):
            skipped.append({"project_id": pid, "reason": f"state_{proj.state.value}"})
            continue
        if not bypass_strict_qc:
            if not proj.pinky_approved:
                skipped.append({"project_id": pid, "reason": "not_pinky_approved"})
                continue
            vr = proj.pinky_video_review or {}
            try:
                vscore = int(vr.get("score") or 0)
            except (TypeError, ValueError):
                vscore = 0
            if vscore <= 8:
                skipped.append({"project_id": pid, "reason": "low_video_score"})
                continue
            sr = proj.pinky_script_review or {}
            try:
                sscore = int(sr.get("score") or 0)
            except (TypeError, ValueError):
                sscore = 0
            if sscore < 8:
                skipped.append({"project_id": pid, "reason": "low_script_score"})
                continue
        elif not proj.pinky_approved:
            proj.pinky_approved = True
        pm.update_state(proj, ProductionState.APPROVED)
        pm._save(proj)
        approved.append(pid)

    schedules: list[dict[str, Any]] = []
    if approved:
        schedule_file = AQOND_BRAIN / "output" / "schedule.json"
        existing: list[Any] = []
        if schedule_file.exists():
            try:
                existing = json.loads(schedule_file.read_text(encoding="utf-8"))
            except Exception:
                existing = []
        for vid_id in approved:
            entry = {
                "schedule_id": str(uuid.uuid4()),
                "project_id": vid_id,
                "platforms": platforms,
                "schedule_time": schedule_time or datetime.now().isoformat(timespec="seconds"),
                "caption": caption,
                "status": "scheduled",
                "target_post_time": target_post_time if target_post_time else None,
            }
            schedules.append(entry)
            existing.append(entry)
        schedule_file.write_text(json.dumps(existing, indent=2, ensure_ascii=False), encoding="utf-8")

    return JSONResponse(
        {
            "message": f"อนุมัติ {len(approved)} รายการ → คิว {len(schedules)}",
            "approved": approved,
            "skipped": skipped,
            "schedules": schedules,
        }
    )


@app.get("/api/project/{project_id}/thomas/suggested_caption")
async def get_thomas_suggested_caption(project_id: str):
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    meta = _social_meta_dict_from_project(proj)
    vo_snippet = ""
    try:
        from factory.script_segmentation import gather_voiceover_text_for_tts

        vo_snippet = (gather_voiceover_text_for_tts(proj.script_md or "") or "").strip()
    except Exception:
        vo_snippet = ""
    trends_raw: list[dict[str, Any]] = []
    try:
        from factory.navy_agent import scrape_rss_feeds, get_trend_heatmap

        news_items = await asyncio.to_thread(scrape_rss_feeds, log)
        trends_raw = get_trend_heatmap(news_items, log)
    except Exception:
        trends_raw = []
    hashtags: list[str] = []
    for t in trends_raw[:12]:
        topic = (t.get("topic") or "").strip()
        if not topic:
            continue
        tag = "#" + re.sub(r"\s+", "", topic)[:42]
        if tag not in hashtags:
            hashtags.append(tag)
    sb = getattr(proj, "structured_brief", None) or {}
    hook_txt = ""
    if isinstance(sb, dict):
        hook_txt = str(sb.get("hook_insight") or "").strip()
    hook = hook_txt or (
        (meta.get("description") or "").split(" · ")[0] if meta.get("description") else ""
    )
    body_lines = [x for x in [hook or meta.get("title", ""), meta.get("promo_code", ""), meta.get("product_link", "")] if x]
    ht = " ".join(hashtags[:10])
    caption = ("\n\n".join(body_lines) + ("\n\n" + ht if ht else "")).strip()
    if vo_snippet and vo_snippet not in caption:
        caption = (vo_snippet[:900] + ("\n\n---\n\n" + caption if caption else "")).strip()
    return JSONResponse(
        {
            "caption": caption,
            "hashtags": hashtags,
            "social_meta": meta,
        }
    )


@app.get("/api/project/{project_id}/thomas/navy_stats")
async def get_thomas_navy_stats(project_id: str):
    """Thomas — Navy performance snapshot (mock + report context); replace with real APIs later."""
    if not pm.load_project(project_id):
        raise HTTPException(404, "Project not found")
    try:
        from factory.navy_agent import get_post_performance_by_project

        payload = await asyncio.to_thread(get_post_performance_by_project, project_id, log)
    except Exception as e:
        log.warning("[Thomas/Navy] stats failed: %s", e)
        raise HTTPException(500, str(e)[:200]) from e
    return JSONResponse(payload)


@app.get("/api/thomas/suggested_post_times")
async def thomas_suggested_post_times():
    """ช่วงเวลาโพสต์ตาม Navy + ค่าแนะนำ datetime-local (เวลาไทย)"""
    from factory.navy_agent import get_best_post_times

    th = timezone(timedelta(hours=7))
    now = datetime.now(th)
    slot = now.replace(hour=21, minute=0, second=0, microsecond=0)
    if slot <= now:
        slot += timedelta(days=1)
    recommended = slot.strftime("%Y-%m-%dT%H:%M")
    windows = get_best_post_times("all")
    hint_th = (
        "Navy: TikTok/Reels ช่วง 19:00–23:00 เอนเกจสูง — แนะนำโพสต์หัวค่ำ ~21:00 น. (เวลาไทย); "
        "Facebook เน้น 20:00–22:00"
    )
    return JSONResponse(
        {
            "windows": windows,
            "recommended_datetime_local": recommended,
            "timezone_note": "UTC+7 (ไทย)",
            "hint_th": hint_th,
        }
    )


@app.get("/api/config/social_sync_status")
async def social_sync_status():
    u = _social_sync_webhook_url()
    return JSONResponse({"configured": bool(u), "url_preview": _mask_webhook_url(u) if u else ""})


@app.get("/api/factory/ready_video_paths")
async def ready_video_paths():
    paths: list[str] = []
    seen: set[str] = set()
    for proj in pm.list_projects():
        if proj.state not in (ProductionState.QC, ProductionState.APPROVED, ProductionState.DONE):
            continue
        row = await _thomas_posting_dict_for_project(proj)
        if not row:
            continue
        vp = row.get("video_path") or ""
        if vp and vp not in seen:
            seen.add(vp)
            paths.append(vp)
    return JSONResponse({"count": len(paths), "paths": paths})


@app.get("/api/minnie/daily_suggestions")
async def minnie_daily_suggestions():
    from factory.minnie_api import daily_extension_suggestions

    ideas, source, summary, meta = await asyncio.to_thread(
        daily_extension_suggestions, log, pm, count=5
    )
    return JSONResponse(
        {"ideas": ideas, "source": source, "summary": summary, "analytics_meta": meta}
    )


@app.get("/api/minnie/locales")
async def minnie_locales_list():
    from factory.minnie_api import LOCALIZATION_LOCALES

    locales = [
        {"code": code, "label": label.split("—")[0].strip() if "—" in label else label}
        for code, label in LOCALIZATION_LOCALES.items()
    ]
    return JSONResponse({"locales": locales})


@app.get("/api/config/turbo_hints")
async def turbo_config_hints():
    return JSONResponse(
        {
            "require_character_ref": _rocky_require_character_ref(),
            "note_th": "Turbo: ส่ง Rocky ต้องผ่าน Pinky ≥8; ถ้าเปิด ROCKY_REQUIRE_CHARACTER_REF ต้องมีรูปตัวละครก่อน",
        }
    )


@app.post("/api/thomas/push_social_webhook")
async def push_social_webhook(data: dict = Body(default_factory=dict)):
    """ส่ง JSON batch ไปยัง Auto-Post webhook (SOCIAL_SYNC_WEBHOOK_URL หรือ webhook_url)"""
    ids = data.get("project_ids") or data.get("video_ids") or []
    url = (data.get("webhook_url") or "").strip() or _social_sync_webhook_url()
    if not url:
        raise HTTPException(
            400,
            "ตั้ง SOCIAL_SYNC_WEBHOOK_URL ใน .env หรือส่ง webhook_url ใน body",
        )
    require_pinky = bool(data.get("require_pinky_approved", True))
    cap_override = (data.get("caption") or "").strip()
    items: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    for pid in ids:
        proj = pm.load_project(pid)
        if not proj:
            skipped.append({"project_id": pid, "reason": "not_found"})
            continue
        if proj.state not in (
            ProductionState.QC,
            ProductionState.APPROVED,
            ProductionState.DONE,
        ):
            skipped.append({"project_id": pid, "reason": f"state_{proj.state.value}"})
            continue
        if require_pinky and not proj.pinky_approved:
            skipped.append({"project_id": pid, "reason": "not_pinky_approved"})
            continue
        row = await _thomas_posting_dict_for_project(proj)
        if not row:
            skipped.append({"project_id": pid, "reason": "no_video_file"})
            continue
        if cap_override:
            row = {**row, "caption": cap_override}
        items.append(row)
    payload = {
        "source": "aqond-thomas",
        "batch": True,
        "items": items,
        "pushed_at": datetime.now(timezone.utc).isoformat(),
    }
    code, preview = await asyncio.to_thread(_post_json_webhook, url, payload)
    ok_http = 200 <= code < 300
    if not ok_http:
        log.warning("[Thomas Webhook] HTTP %s: %s", code, preview[:200])
    return JSONResponse(
        {
            "ok": ok_http,
            "http_status": code,
            "sent": len(items),
            "skipped": skipped,
            "response_preview": preview,
        }
    )


@app.get("/api/project/{project_id}/posting_bundle")
async def get_posting_bundle(project_id: str):
    """Caption + hashtags + path ไฟล์หลัก — สำหรับ Auto-Post / TikTok workflow"""
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    d = await _thomas_posting_dict_for_project(proj)
    if not d:
        raise HTTPException(400, "No video file on disk for this project")
    return JSONResponse(d)


@app.get("/api/project/{project_id}/metadata_audit")
async def project_metadata_audit(project_id: str):
    """ตรวจ metadata ใน MP4 (ffprobe) เทียบกับที่ระบบคาดจากโปรเจกต์"""
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    vpath = _pick_primary_video_path(proj)
    if not vpath or not vpath.is_file():
        raise HTTPException(400, "No video file on disk")
    tags = await asyncio.to_thread(_ffprobe_format_tags, vpath)
    expected = _social_meta_dict_from_project(proj)
    report = _metadata_audit_report(tags, expected)
    report["file"] = vpath.name
    return JSONResponse(report)


@app.post("/api/project/{project_id}/embed_social_metadata")
async def embed_social_metadata(project_id: str, data: dict = Body(default_factory=dict)):
    """ฝัง product_link / promo / brief ลง metadata ของไฟล์ MP4 (remux -c copy)"""
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    body = data or {}
    meta = _social_meta_dict_from_project(proj)
    if isinstance(body.get("overrides"), dict):
        for k, v in body["overrides"].items():
            if k in meta and v is not None:
                meta[k] = str(v)[:900]
    seen: set[str] = set()
    paths: list[Path] = []

    def _add_path(p: Path) -> None:
        if not p.is_file():
            return
        try:
            key = str(p.resolve())
        except OSError:
            key = str(p)
        if key in seen:
            return
        seen.add(key)
        paths.append(p)

    if proj.edited_video_path:
        _add_path(Path(proj.edited_video_path))
    for _k, vp in (proj.render_variants or {}).items():
        _add_path(Path(vp))
    ok: list[str] = []
    fail: list[dict[str, str]] = []
    for p in paths:
        good, err = _embed_social_meta_mp4(p, meta)
        if good:
            ok.append(p.name)
        else:
            fail.append({"file": p.name, "error": err[:200]})
    return JSONResponse({"ok": ok, "failed": fail, "meta": meta})


@app.post("/api/project/{project_id}/cleanup_unused_variants")
async def cleanup_unused_variants(project_id: str, data: dict = Body(default_factory=dict)):
    dry = bool(data.get("dry_run", False))
    r = _cleanup_orphan_variant_files(project_id, dry_run=dry)
    if r.get("error"):
        raise HTTPException(404, r["error"])
    return JSONResponse(r)


@app.post("/api/thomas/cleanup_unused_variants_bulk")
async def cleanup_unused_variants_bulk(data: dict = Body(default_factory=dict)):
    """ล้าน variant เก่าหลายโปรเจกต์ — ค่าเริ่มทุก prod_*"""
    ids = data.get("project_ids")
    dry = bool(data.get("dry_run", False))
    if not ids:
        ids = [p.project_id for p in pm.list_projects()]
    results: list[dict[str, Any]] = []
    for pid in ids:
        r = _cleanup_orphan_variant_files(pid, dry_run=dry)
        r["project_id"] = pid
        results.append(r)
    return JSONResponse({"results": results})


@app.post("/api/thomas/process_due_schedule")
async def process_due_schedule():
    """โพสต์รายการใน schedule.json ที่ schedule_time <= เวลาปัจจุบัน (status=scheduled)"""
    schedule_file = AQOND_BRAIN / "output" / "schedule.json"
    if not schedule_file.exists():
        return JSONResponse({"processed": 0, "results": [], "message": "ยังไม่มี schedule.json"})

    try:
        entries: list[dict[str, Any]] = json.loads(schedule_file.read_text(encoding="utf-8"))
    except Exception:
        entries = []

    now = datetime.now()
    results: list[dict[str, Any]] = []

    for e in entries:
        if e.get("status") != "scheduled":
            continue
        st = e.get("schedule_time")
        try:
            due_at = datetime.fromisoformat(st) if st else now
        except ValueError:
            due_at = now
        if due_at > now:
            continue

        pid = e.get("project_id")
        plats = e.get("platforms") or []
        cap = e.get("caption") or ""
        proj = pm.load_project(pid) if pid else None
        if not proj or not proj.edited_video_path or not Path(proj.edited_video_path).exists():
            e["status"] = "failed"
            e["error"] = "missing project or video file"
            results.append({"project_id": pid, "ok": False, "error": e["error"]})
            continue

        success, errors = await asyncio.to_thread(
            publish_video, proj.edited_video_path, cap, plats, log
        )
        if success:
            e["status"] = "posted"
            e["publish_urls"] = success
            if errors:
                e["partial_errors"] = errors
            merged = dict(proj.publish_urls or {})
            merged.update(success)
            proj.publish_urls = merged
            pm.update_state(proj, ProductionState.DONE)
            pm._save(proj)
            results.append({"project_id": pid, "ok": True, "urls": success, "partial_errors": errors or None})
        else:
            e["status"] = "failed"
            e["errors"] = errors
            results.append({"project_id": pid, "ok": False, "errors": errors})

    schedule_file.write_text(json.dumps(entries, indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("[Thomas] process_due_schedule: %d entries processed", len(results))
    return JSONResponse({"processed": len(results), "results": results})


@app.post("/api/project/{project_id}/pinky_review")
async def request_pinky_review(project_id: str):
    """Request Pinky to review video"""
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    
    if not proj.edited_video_path or not Path(proj.edited_video_path).exists():
        raise HTTPException(400, "No video to review")
    
    pm.update_state(proj, ProductionState.PINKY_REVIEW)
    pm._save(proj)
    
    # Trigger async Pinky review
    asyncio.create_task(process_pinky_review(project_id))
    
    return JSONResponse({"message": "Pinky is reviewing...", "project_id": project_id})


@app.post("/api/project/{project_id}/send_back_to_rocky")
async def send_back_to_rocky(project_id: str, data: dict):
    """SMART REJECT — Send back to origin of problem"""
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    
    feedback = data.get("feedback", "")
    reject_target = data.get("reject_target", "visual")  # "script" or "visual"
    
    proj.rework_count += 1
    proj.qc_notes = f"[Rework {proj.rework_count}] {feedback}"
    
    if reject_target == "script":
        # Script problem → back to Minnie
        log.warning("[Smart Reject] Script issue → Minnie (rework %d)", proj.rework_count)
        pm.update_state(proj, ProductionState.SCRIPT_REJECTED)
        target_name = "Minnie (Script)"
    else:
        # Visual problem → back to Rocky
        log.warning("[Smart Reject] Visual issue → Rocky (rework %d)", proj.rework_count)
        pm.update_state(proj, ProductionState.VISUAL_GEN)
        target_name = "Rocky (Visual)"
    
    pm._save(proj)
    
    return JSONResponse({
        "message": f"Sent back to {target_name} (rework #{proj.rework_count})",
        "project_id": project_id,
        "target": target_name
    })


@app.post("/api/project/{project_id}/select_variant")
async def select_variant(project_id: str, data: dict):
    """Boss selects which variant to publish"""
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    variant = data.get("variant", "")
    if variant not in proj.render_variants and variant:
        raise HTTPException(400, f"Variant '{variant}' not found")
    proj.selected_variant = variant
    if variant and variant in proj.render_variants:
        proj.edited_video_path = proj.render_variants[variant]
    pm._save(proj)
    log.info("[Thomas] %s selected variant: %s", project_id, variant)
    return JSONResponse({"success": True, "selected": variant})


@app.post("/api/project/{project_id}/quick_re_edit")
async def quick_re_edit(project_id: str, data: dict):
    """Quick Re-edit: change color/music on existing clips without re-generating from Grok"""
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    if not proj.raw_clips:
        raise HTTPException(400, "No source clips available — re-generate from Rocky first")

    # Which variant to re-edit?
    target_variant = data.get("variant", "variant_a")
    preset_override = data.get("preset")  # optional preset override
    variant_preset_map = {
        "variant_a": "vibe_fantasy",
        "variant_b": "vibe_instories",
        "variant_c": "vibe_viral",
    }
    preset = preset_override or variant_preset_map.get(target_variant, "vibe_fantasy")

    asyncio.create_task(_quick_re_edit_task(project_id, target_variant, preset))
    return JSONResponse({"message": f"Quick re-edit started for {target_variant} ({preset})...", "project_id": project_id})


async def _quick_re_edit_task(project_id: str, variant_key: str, preset: str):
    """Re-render a single variant with new preset"""
    proj = pm.load_project(project_id)
    if not proj:
        return
    clips = [c for c in (proj.raw_clips or []) if Path(c).exists()]
    audio = proj.audio_narration_path if proj.audio_narration_path and Path(proj.audio_narration_path).exists() else ""
    if not clips:
        log.warning("[Quick Re-edit] No clips for %s", project_id)
        return

    try:
        from factory.pro_auto_editor import auto_edit_video
        from factory.scene_cache import new_variant_filename_salt

        variants_dir = AQOND_BRAIN / "output" / "variants"
        variants_dir.mkdir(parents=True, exist_ok=True)
        out_path = str(
            variants_dir / f"{project_id}_{variant_key}_{new_variant_filename_salt()}.mp4"
        )

        _bgm = str(BGM_ASSET) if BGM_ASSET.is_file() else None
        success = await asyncio.to_thread(
            lambda: auto_edit_video(
                clips,
                audio or clips[0],
                proj.script_md or "",
                out_path,
                log,
                preset,
                proj.beat_sync,
                proj.edu_overlay,
                None,
                getattr(proj, "director_preset", None),
                _bgm,
            )
        )
        if success:
            proj = pm.load_project(project_id)
            if not proj:
                return
            if not proj.render_variants:
                proj.render_variants = {}
            proj.render_variants[variant_key] = out_path
            proj.last_render_session_id = str(uuid.uuid4())
            proj.last_render_at = datetime.now(timezone.utc).isoformat()
            proj.last_render_variant_keys = list(proj.render_variants.keys())
            pm._save(proj)
            log.info("[Quick Re-edit] Done: %s → %s", variant_key, Path(out_path).name)
            await broadcast_message({
                "type": "variant_updated",
                "project_id": project_id,
                "variant_key": variant_key,
                "video_path": out_path
            })
    except Exception as e:
        log.error("[Quick Re-edit] %s: %s", project_id, e)


def _resolve_project_path(p: str | None) -> Path | None:
    """Path จาก state อาจเป็น relative ใต้ aqond-brain"""
    if not p or not str(p).strip():
        return None
    raw = str(p).strip()
    try:
        q = Path(raw)
        if q.is_absolute():
            return q
        return (AQOND_BRAIN / raw.replace("\\", "/").lstrip("/")).resolve()
    except OSError:
        return None


def _safe_unlink_media(path: Path, log: logging.Logger, label: str) -> bool:
    try:
        if path.is_file():
            path.unlink()
            return True
    except OSError as e:
        log.warning("[Delete] ไม่ลบ %s (%s): %s", label, path, e)
    return False


@app.post("/api/project/{project_id}/delete")
async def delete_project(project_id: str):
    """
    ลบโปรเจกต์ — ลบ state JSON เสมอ (ให้หายจาก Thomas)
    ไฟล์วิดีโอลบแบบ best-effort (Windows อาจล็อกไฟล์ตอนเล่นในเบราว์เซอร์)
    """
    proj = pm.load_project(project_id)
    if not proj:
        raise HTTPException(404, "Project not found")

    removed: list[str] = []
    warnings: list[str] = []

    # ไฟล์หลัก + variant จาก state
    ep = _resolve_project_path(getattr(proj, "edited_video_path", None) or "")
    if ep and _safe_unlink_media(ep, log, "edited_video"):
        removed.append(ep.name)

    for vk, vp in (getattr(proj, "render_variants", None) or {}).items():
        rp = _resolve_project_path(vp)
        if rp and _safe_unlink_media(rp, log, f"render_variants[{vk}]"):
            removed.append(rp.name)

    # เกลี่ย variant ตาม pattern (ชื่อมี salt)
    try:
        for fp in VARIANTS_DIR.glob(f"{project_id}_*.mp4"):
            if _safe_unlink_media(fp, log, f"variants/{fp.name}"):
                removed.append(fp.name)
    except OSError as e:
        warnings.append(f"variants_glob: {e}")

    try:
        for th in THUMB_DIR.glob(f"{project_id}_sc*.jpg"):
            _safe_unlink_media(th, log, f"thumb/{th.name}")
    except OSError as e:
        warnings.append(f"thumbs_glob: {e}")

    # narration / audio ใต้ output (ถ้ามี path ใน state)
    ap = _resolve_project_path(getattr(proj, "audio_narration_path", None) or "")
    if ap and ap.is_file() and "output" in str(ap).replace("\\", "/"):
        if _safe_unlink_media(ap, log, "audio_narration"):
            removed.append(ap.name)

    state_file = STATE_DIR / f"{project_id}.json"
    try:
        if state_file.is_file():
            state_file.unlink()
    except OSError as e:
        log.exception("[Delete] ลบ state ไม่ได้: %s", state_file)
        return JSONResponse(
            {
                "success": False,
                "message": f"Could not remove project state: {e}",
                "project_id": project_id,
            },
            status_code=500,
        )

    log.info("[Delete] Removed project state: %s (media removed: %s)", project_id, removed)
    msg = "Project deleted"
    if warnings:
        msg += " (some paths skipped — see warnings)"
    return JSONResponse(
        {
            "success": True,
            "message": msg,
            "project_id": project_id,
            "removed_files": removed,
            "warnings": warnings,
        }
    )




@app.get("/api/dashboard/today")
async def get_today_dashboard():
    """Get today's production summary"""
    from datetime import date
    
    projects = pm.list_projects()
    today = date.today().isoformat()
    
    # Filter today's projects
    today_projects = [p for p in projects if p.created_at.split("T")[0] == today]
    
    completed = len([p for p in today_projects if p.state == ProductionState.DONE])
    in_progress = len([p for p in today_projects if p.state in [
        ProductionState.SCRIPTING,
        ProductionState.VISUAL_GEN,
        ProductionState.EDITING,
        ProductionState.QC,
        ProductionState.PINKY_REVIEW
    ]])
    scheduled = len([p for p in today_projects if p.state == ProductionState.APPROVED])
    posted = len([p for p in today_projects if p.state == ProductionState.DONE])
    
    return JSONResponse({
        "completed": completed,
        "in_progress": in_progress,
        "scheduled": scheduled,
        "posted": posted,
        "total": len(today_projects)
    })


@app.get("/api/navy/news")
async def get_navy_news():
    """Get latest news from Navy agent"""
    try:
        from factory.navy_agent import scrape_rss_feeds
        import logging
        
        logger = logging.getLogger("navy_api")
        news_items = scrape_rss_feeds(logger)
        
        # Format for frontend
        formatted = []
        for item in news_items[:20]:
            formatted.append({
                "title": item.get("title", "Untitled"),
                "source": item.get("source", "Unknown"),
                "date": item.get("date", "Today"),
                "url": item.get("url", ""),
                "importance": hash(item.get("title", "")) % 10 + 1  # Mock importance score
            })
        
        return JSONResponse(formatted)
    except Exception as e:
        log.error(f"[Navy API] News error: {e}")
        return JSONResponse([])




@app.get("/api/navy/predictions")
async def get_navy_predictions():
    """Get viral content predictions"""
    try:
        # Mock predictions (would use Grok AI in production)
        predictions = [
            {"topic": "AI Automation Tools", "score": 92, "reason": "High engagement + growing search volume"},
            {"topic": "Productivity Hacks", "score": 87, "reason": "Trending on TikTok + Product Hunt"},
            {"topic": "No-Code Platforms", "score": 81, "reason": "3 major launches this week"},
            {"topic": "Remote Work Tech", "score": 76, "reason": "Seasonal trend peak"},
            {"topic": "AI Content Creation", "score": 73, "reason": "Consistent growth pattern"}
        ]
        return JSONResponse(predictions)
    except Exception as e:
        log.error(f"[Navy API] Predictions error: {e}")
        return JSONResponse([])


@app.get("/api/pinky/calendar")
async def get_pinky_calendar():
    """Get 7-day content calendar from Pinky"""
    try:
        from datetime import datetime, timedelta
        
        # Load latest calendar
        calendar_dir = AQOND_BRAIN / "output" / "content_calendar"
        if not calendar_dir.exists():
            return JSONResponse({"days": []})
        
        calendars = sorted(calendar_dir.glob("calendar_*.json"), reverse=True)
        if not calendars:
            return JSONResponse({"days": []})
        
        latest = json.loads(calendars[0].read_text(encoding="utf-8"))
        
        # Format for frontend
        days_data = []
        for day_key, videos in latest.items():
            if day_key.startswith("day_"):
                day_date = datetime.now() + timedelta(days=int(day_key.split("_")[1]) - 1)
                days_data.append({
                    "date": day_date.strftime("%Y-%m-%d"),
                    "videos": [
                        {
                            "title": v.get("title", "Untitled"),
                            "tier": "Tier 1" if "marketing" in v.get("title", "").lower() else "Tier 2",
                            "status": "Planned"
                        }
                        for v in videos
                    ]
                })
        
        return JSONResponse({"days": days_data[:7]})
    except Exception as e:
        log.error(f"[Pinky API] Calendar error: {e}")
        return JSONResponse({"days": []})


@app.post("/api/navy/pin_to_calendar")
async def pin_trend_to_calendar(data: dict):
    """Pin a trend from Navy to Pinky's calendar"""
    try:
        from factory.pinky_planner import trigger_minnie_pipeline
        import logging
        
        topic = data.get("topic", "")
        if not topic:
            raise HTTPException(400, "No topic provided")
        
        # Create content brief
        brief = f"Create engaging video about: {topic}"
        
        # Trigger Minnie pipeline
        logger = logging.getLogger("navy_pin")
        content_idea = {
            "title": f"Aqond: {topic}",
            "hook": f"Discover how {topic} can transform your work",
            "problem": f"Many struggle with {topic}",
            "solution": "Aqond makes it easy",
            "cta": "Try Aqond free today",
            "target_audience": "Tech professionals",
            "tone": "Educational + Inspiring"
        }
        
        project = trigger_minnie_pipeline(content_idea, logger)
        
        return JSONResponse({
            "success": True,
            "project_id": project.project_id if project else None,
            "message": f"Content for '{topic}' added to pipeline"
        })
    except Exception as e:
        log.error(f"[Navy->Pinky] Pin error: {e}")
        raise HTTPException(500, str(e))


@app.get("/api/pinky/quality_checks")
async def get_pinky_quality_checks():
    """Get recent quality check results"""
    try:
        # Get recent projects with Pinky reviews
        checks = []
        for state_file in STATE_DIR.glob("prod_*.json"):
            try:
                proj = pm.load_project(state_file.stem)
                if proj and proj.pinky_script_review:
                    review = proj.pinky_script_review
                    checks.append({
                        "project_id": proj.project_id,
                        "passed": review.get("approved", False),
                        "items": [
                            {"name": "Script Quality", "status": "PASS" if review.get("approved") else "FAIL"},
                            {"name": "Emotional Trigger", "status": "PASS" if review.get("score", 0) >= 7 else "FAIL"},
                            {"name": "Thai Language", "status": "PASS"},
                            {"name": "Scene Structure", "status": "PASS" if len(proj.raw_clips or []) > 0 else "PENDING"},
                            {"name": "Technical Accuracy", "status": "PASS"}
                        ]
                    })
            except:
                continue
        
        return JSONResponse(checks[:5])
    except Exception as e:
        log.error(f"[Pinky API] Quality checks error: {e}")
        return JSONResponse([])


@app.get("/api/navy/spy")
@app.get("/api/navy/competitor_spy")
async def get_competitor_spy():
    """Navy: Analyze competitor viral videos — Hook / Value / CTA"""
    try:
        from factory.navy_agent import analyze_competitor_viral
        import logging
        logger = logging.getLogger("navy_spy_api")
        data = await asyncio.to_thread(analyze_competitor_viral, logger)
        return JSONResponse(data)
    except Exception as e:
        log.error("[Navy Spy] %s", e)
        return JSONResponse([])


@app.get("/api/navy/trends")
async def get_navy_trends_v2():
    """Trend Heatmap using Navy's real algorithm"""
    try:
        from factory.navy_agent import scrape_rss_feeds, get_trend_heatmap
        import logging
        logger = logging.getLogger("navy_trends_api")
        news_items = await asyncio.to_thread(scrape_rss_feeds, logger)
        trends = get_trend_heatmap(news_items, logger)
        # Enrich for frontend
        result = [
            {
                "topic": t["topic"],
                "heat": t["score"] * 10,
                "description": t["description"],
                "score": t["score"],
                "category": t.get("category", "general")
            }
            for t in trends
        ]
        return JSONResponse(result)
    except Exception as e:
        log.error("[Navy Trends V2] %s", e)
        return JSONResponse([])


@app.post("/api/project/{project_id}/translate_script")
async def translate_project_script(project_id: str, data: dict):
    """Translate script to multiple languages via Minnie"""
    try:
        proj = pm.load_project(project_id)
        if not proj:
            raise HTTPException(404, "Project not found")
        if not proj.script_md:
            raise HTTPException(400, "No script available to translate")

        languages = data.get("languages", ["english"])
        from factory.minnie_api import translate_script
        translations = await asyncio.to_thread(translate_script, proj.script_md, languages, log)
        return JSONResponse({"translations": translations})
    except HTTPException:
        raise
    except Exception as e:
        log.error("[Translate] %s", e)
        raise HTTPException(500, str(e))


@app.get("/api/thomas/best_post_times")
async def get_best_post_times():
    """Navy's recommended best posting windows per platform"""
    try:
        from factory.navy_agent import get_best_post_times as _get_times
        return JSONResponse(_get_times())
    except Exception as e:
        log.error("[Thomas PostTimes] %s", e)
        return JSONResponse({
            "facebook": [{"time": "20:00-22:00", "score": 10, "reason": "Prime time"}],
            "tiktok": [{"time": "19:00-23:00", "score": 10, "reason": "Entertainment zone"}],
            "youtube": [{"time": "20:00-23:00", "score": 10, "reason": "Education binge"}],
        })


@app.post("/api/thomas/export_aspect_ratios")
async def export_aspect_ratios(data: dict):
    """Export selected videos in multiple aspect ratios via FFmpeg"""
    project_ids = data.get("project_ids", [])
    ratios = data.get("ratios", ["9:16", "16:9"])

    if not project_ids:
        raise HTTPException(400, "No project IDs provided")

    exports_dir = AQOND_BRAIN / "output" / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)

    exported = 0
    for pid in project_ids:
        try:
            proj = pm.load_project(pid)
            if not proj or not proj.edited_video_path:
                continue
            src = Path(proj.edited_video_path)
            if not src.exists():
                continue

            for ratio in ratios:
                safe_ratio = ratio.replace(":", "x")
                out_path = exports_dir / f"{pid}_{safe_ratio}.mp4"

                # FFmpeg crop/pad for aspect ratio
                if ratio == "9:16":
                    vf = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2"
                elif ratio == "16:9":
                    vf = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2"
                else:  # 1:1
                    vf = "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2"

                cmd = [
                    "ffmpeg", "-y", "-i", str(src),
                    "-vf", vf,
                    "-c:v", "libx264", "-crf", "23", "-preset", "fast",
                    "-c:a", "aac", str(out_path)
                ]
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL
                )
                await asyncio.wait_for(proc.wait(), timeout=120)
                if out_path.exists():
                    exported += 1
                    log.info("[Thomas] Exported %s %s → %s", pid, ratio, out_path.name)
        except Exception as e:
            log.warning("[Thomas Export] %s: %s", pid, e)

    return JSONResponse({
        "exported": exported,
        "ratios": ratios,
        "output_dir": str(exports_dir)
    })


@app.get("/api/pinky/insights")
async def get_pinky_insights_v2():
    """Pinky's daily AI insights"""
    try:
        lessons_file = AQOND_BRAIN / "output" / "pinky_lessons.json"
        lessons = []
        if lessons_file.exists():
            lessons = json.loads(lessons_file.read_text(encoding="utf-8"))

        latest = lessons[-1] if lessons else {}
        return JSONResponse({
            "text": latest.get("lesson", "No insights yet. Start producing content to build Pinky's knowledge base."),
            "date": latest.get("timestamp", ""),
            "total_lessons": len(lessons),
            "last_score": latest.get("score", 0),
        })
    except Exception as e:
        return JSONResponse({"text": "Insights unavailable", "date": ""})


@app.post("/api/approve_and_post_all")
async def approve_and_post_all(data: dict):
    """Zero-Touch: โพสต์จริงผ่าน Thomas (Facebook multipart + แพลตฟอร์มอื่นตามที่ implement)"""
    platforms = data.get("platforms", [])
    caption = data.get("caption", "🚀 Transform your learning with Aqond!")

    if not platforms:
        raise HTTPException(400, "No platforms selected")

    projects = pm.list_projects()
    approved_projects = [
        p
        for p in projects
        if p.state in [ProductionState.APPROVED, ProductionState.QC]
        and p.pinky_approved
        and p.edited_video_path
        and Path(p.edited_video_path).exists()
    ]

    if not approved_projects:
        raise HTTPException(404, "No Pinky-approved videos found")

    posted_ids: list[str] = []
    failures: list[dict[str, Any]] = []

    for proj in approved_projects:
        prev_state = proj.state
        pm.update_state(proj, ProductionState.PUBLISHING)
        pm._save(proj)

        success, errors = await asyncio.to_thread(
            publish_video, proj.edited_video_path, caption, platforms, log
        )

        if success:
            merged = dict(proj.publish_urls or {})
            merged.update(success)
            proj.publish_urls = merged
            pm.update_state(proj, ProductionState.DONE)
            pm._save(proj)
            posted_ids.append(proj.project_id)
            log.info("[Zero-Touch] Posted %s URLs=%s errors_extra=%s", proj.project_id, success, errors)
            if errors:
                failures.append({"project_id": proj.project_id, "partial_platform_errors": errors})
        else:
            proj.error_log = list(proj.error_log or []) + list(errors)
            pm.update_state(proj, prev_state)
            pm._save(proj)
            failures.append({"project_id": proj.project_id, "errors": errors})
            log.warning("[Zero-Touch] Failed %s: %s", proj.project_id, errors)

    if not posted_ids:
        raise HTTPException(
            502,
            detail={
                "message": "โพสต์ไม่สำเร็จทุกโปรเจกต์ — ตั้ง FB_PAGE_ACCESS_TOKEN + FB_PAGE_ID สำหรับ Facebook หรือเลือกเฉพาะแพลตฟอร์มที่พร้อม",
                "failures": failures,
            },
        )

    return JSONResponse(
        {
            "posted_count": len(posted_ids),
            "project_ids": posted_ids,
            "platforms": platforms,
            "failures": failures,
            "message": f"โพสต์สำเร็จ {len(posted_ids)} โปรเจกต์"
            + (f" (มีข้อควรระวัง {len(failures)} รายการ)" if failures else ""),
        }
    )


# === Background Processing Functions ===

async def handle_minnie_chat(project_id: str, user_message: str, current_script: str) -> tuple[str, str]:
    """
    Handle chat with Minnie to edit script
    Returns: (minnie_response, updated_script)
    """
    from factory.minnie_api import chat_with_claude_for_edit
    
    # Call Claude/Grok to update script based on user feedback
    response, updated_script = await asyncio.to_thread(
        chat_with_claude_for_edit,
        user_message,
        current_script,
        log
    )
    
    # Save updated script
    proj = pm.load_project(project_id)
    if proj and updated_script:
        proj.script_md = updated_script
        pm._save(proj)
    
    return (response, updated_script or current_script)


async def process_rocky_visual(project_id: str, creativity_level: str = "medium"):
    """Background task: Generate fantasy visuals for project"""
    from factory.rocky_visual_api import generate_video_clips
    
    proj = pm.load_project(project_id)
    if not proj:
        return
    
    log.info("[Rocky Visual] Starting for %s (creativity: %s)", project_id, creativity_level)
    loop = asyncio.get_running_loop()

    def push_live(meta: dict) -> None:
        payload = {"type": "rocky_live", "project_id": project_id, **meta}
        asyncio.run_coroutine_threadsafe(broadcast_message(payload), loop)

    clips, err = await asyncio.to_thread(
        generate_video_clips,
        proj.script_md,
        log,
        creativity_level,
        proj.project_id,
        push_live,
    )

    # ใช้ `is not None` — ห้ามใช้ `if clips:` เพราะ list สล็อตว่าง [""]*n ยัง truthy
    if clips is not None:
        proj.raw_clips = clips
        pm.update_state(proj, ProductionState.VISUAL_PAUSED)  # Pause for user review
        try:
            pm.sync_shots(proj)
        except Exception as e:
            log.warning("[Rocky Visual] sync_shots: %s", e)
        pm._save(proj)
        log.info("[Rocky Visual] Complete: %d clips (paused for review)", len(clips))
        
        await broadcast_message({
            "type": "scenes_updated",
            "project_id": project_id,
            "clip_count": len(clips),
            "status": "paused_for_review"
        })
        proj = pm.load_project(project_id)
        if proj and getattr(proj, "auto_render_variants_after_visual", False):
            flags = getattr(proj, "variants_render_enabled", None) or {}
            enabled = [k for k in ("variant_a", "variant_b", "variant_c") if flags.get(k, True)]
            if enabled:
                pm.update_state(proj, ProductionState.EDITING)
                pm._save(proj)
                rocky_render_cancel_event(project_id).clear()
                asyncio.create_task(process_rocky_editing(project_id))
    else:
        log.error("[Rocky Visual] Failed: %s", err)
        await broadcast_message({
            "type": "rocky_live",
            "project_id": project_id,
            "phase": "visual_failed",
            "message": str(err or "Rocky visual failed"),
        })


async def process_generate_take(
    project_id: str,
    scene_idx: int,
    take_key: str,
    creativity_level: str = "medium",
):
    """Generate one Grok clip into variant_a|b|c slot."""
    from factory.clip_storage import remove_tiny_clip_garbage
    from factory.shot_takes import apply_clip_to_shot_take, grok_generate_scene_clip

    proj = pm.load_project(project_id)
    if not proj or not proj.script_md:
        return

    remove_tiny_clip_garbage(
        project_id,
        raw_clip_paths=list(proj.raw_clips or []),
        logger=log,
    )

    await broadcast_message(
        {
            "type": "rocky_live",
            "project_id": project_id,
            "phase": "take_gen_start",
            "scene_index": scene_idx,
            "take": take_key,
            "message": f"Gen {take_key} — shot {scene_idx + 1}",
        }
    )

    loop = asyncio.get_running_loop()

    def grok_progress(meta: dict) -> None:
        payload = {
            "type": "rocky_live",
            "project_id": project_id,
            "scene_index": scene_idx,
            **meta,
        }
        asyncio.run_coroutine_threadsafe(broadcast_message(payload), loop)

    proj = pm.load_project(project_id)
    if not proj:
        return

    new_clip = await asyncio.to_thread(
        grok_generate_scene_clip,
        proj,
        project_id,
        scene_idx,
        creativity_level,
        log,
        grok_progress,
    )

    proj = pm.load_project(project_id)
    if not proj:
        return

    if new_clip:
        apply_clip_to_shot_take(proj, scene_idx, take_key, new_clip, set_master=True)
        try:
            pm.sync_shots(proj)
        except Exception as e:
            log.warning("[Take Gen] sync_shots: %s", e)
        pm._save(proj)
        await broadcast_message(
            {
                "type": "scene_updated",
                "project_id": project_id,
                "scene_idx": scene_idx,
            }
        )
        await broadcast_message(
            {
                "type": "rocky_live",
                "project_id": project_id,
                "phase": "take_gen_done",
                "scene_index": scene_idx,
                "take": take_key,
                "message": f"{take_key} ready",
            }
        )
    else:
        await broadcast_message(
            {
                "type": "rocky_live",
                "project_id": project_id,
                "phase": "take_gen_failed",
                "scene_index": scene_idx,
                "take": take_key,
                "message": f"{take_key} failed",
            }
        )


async def process_batch_queue(project_id: str, creativity: str = "medium"):
    """Sequential Auto-Gen for shots that are not yet locked (Take A)."""
    from factory.script_segmentation import shots_for_generation
    from factory.clip_storage import remove_tiny_clip_garbage
    from factory.shot_takes import apply_clip_to_shot_take, grok_generate_scene_clip

    loop = asyncio.get_running_loop()
    proj = pm.load_project(project_id)
    if not proj or not proj.script_md:
        return

    remove_tiny_clip_garbage(
        project_id,
        raw_clip_paths=list(proj.raw_clips or []),
        logger=log,
    )

    specs = shots_for_generation(
        proj.script_md or "",
        target_count=proj.target_shot_count or 0,
        max_shots=12,
    )
    n = len(specs)

    await broadcast_message(
        {
            "type": "batch_gen_progress",
            "project_id": project_id,
            "phase": "batch_start",
            "current": 0,
            "total": n,
            "message": f"Batch queue: {n} shots",
        }
    )

    for i in range(n):
        proj = pm.load_project(project_id)
        if not proj:
            break
        pm.sync_shots(proj)
        proj = pm.load_project(project_id)
        st = proj.shots[i] if proj.shots and i < len(proj.shots) else None
        if st and st.get("status") == "locked":
            await broadcast_message(
                {
                    "type": "batch_gen_progress",
                    "project_id": project_id,
                    "phase": "batch_skip",
                    "shot_index": i,
                    "total": n,
                    "message": f"Skip shot {i + 1} (already locked)",
                }
            )
            continue

        def grok_progress(meta: dict) -> None:
            asyncio.run_coroutine_threadsafe(
                broadcast_message(
                    {
                        "type": "rocky_live",
                        "project_id": project_id,
                        "scene_index": i,
                        **meta,
                    }
                ),
                loop,
            )

        new_clip = await asyncio.to_thread(
            grok_generate_scene_clip,
            proj,
            project_id,
            i,
            creativity,
            log,
            grok_progress,
        )

        proj = pm.load_project(project_id)
        if new_clip and proj:
            apply_clip_to_shot_take(proj, i, "variant_a", new_clip, set_master=True)
            try:
                pm.sync_shots(proj)
            except Exception as e:
                log.warning("[Batch] sync_shots: %s", e)
            pm._save(proj)
        await broadcast_message(
            {
                "type": "batch_gen_progress",
                "project_id": project_id,
                "phase": "batch_shot_done",
                "shot_index": i,
                "total": n,
                "ok": bool(new_clip),
                "message": f"Shot {i + 1}/{n} — {'OK' if new_clip else 'FAILED'}",
            }
        )
        await broadcast_message(
            {
                "type": "scenes_updated",
                "project_id": project_id,
                "clip_count": len(proj.raw_clips or []) if proj else 0,
            }
        )

    await broadcast_message(
        {
            "type": "batch_gen_progress",
            "project_id": project_id,
            "phase": "batch_done",
            "total": n,
            "message": "Batch queue finished",
        }
    )


async def process_scene_regen(project_id: str, scene_idx: int, creativity_level: str = "medium"):
    """Regenerate a specific scene — writes to Take A (master) via shot_variants."""
    from factory.clip_storage import remove_tiny_clip_garbage
    from factory.shot_takes import apply_clip_to_shot_take, grok_generate_scene_clip

    proj = pm.load_project(project_id)
    if not proj or not proj.script_md:
        return

    remove_tiny_clip_garbage(
        project_id,
        raw_clip_paths=list(proj.raw_clips or []),
        logger=log,
    )

    log.info("[Scene Regen] %s, scene %d (creativity: %s)", project_id, scene_idx, creativity_level)
    await broadcast_message(
        {
            "type": "rocky_live",
            "project_id": project_id,
            "phase": "scene_regen_start",
            "scene_index": scene_idx,
            "message": f"กำลัง Gen ฉาก {scene_idx + 1} ใหม่…",
        }
    )

    loop = asyncio.get_running_loop()

    def grok_progress(meta: dict) -> None:
        payload = {
            "type": "rocky_live",
            "project_id": project_id,
            "scene_index": scene_idx,
            **meta,
        }
        asyncio.run_coroutine_threadsafe(broadcast_message(payload), loop)

    new_clip = await asyncio.to_thread(
        grok_generate_scene_clip,
        proj,
        project_id,
        scene_idx,
        creativity_level,
        log,
        grok_progress,
    )

    proj = pm.load_project(project_id)
    if not proj:
        return

    if new_clip:
        apply_clip_to_shot_take(proj, scene_idx, "variant_a", new_clip, set_master=True)
        try:
            pm.sync_shots(proj)
        except Exception as e:
            log.warning("[Scene Regen] sync_shots: %s", e)
        pm._save(proj)
        log.info("[Scene Regen] Updated scene %d (take A)", scene_idx)

        await broadcast_message(
            {
                "type": "scene_updated",
                "project_id": project_id,
                "scene_idx": scene_idx,
            }
        )
        await broadcast_message(
            {
                "type": "rocky_live",
                "project_id": project_id,
                "phase": "scene_regen_done",
                "scene_index": scene_idx,
                "message": f"ฉาก {scene_idx + 1} อัปเดตแล้ว",
            }
        )
    else:
        await broadcast_message(
            {
                "type": "rocky_live",
                "project_id": project_id,
                "phase": "scene_regen_failed",
                "scene_index": scene_idx,
                "message": f"ฉาก {scene_idx + 1} ยังไม่มีคลิปจริง (ขนาด/สื่อไม่ผ่าน)",
            }
        )


async def process_regen_all_scenes(
    project_id: str, creativity_level: str = "medium", note: str = ""
):
    """Regen ทุกฉากทีละฉาก — ลดโหลด API และคงลำดับงาน"""
    proj = pm.load_project(project_id)
    if not proj or not proj.script_md:
        return
    scenes = []
    for line in proj.script_md.split("\n"):
        m = re.search(r"\[(\d+)-(\d+)s\]\s*(.+)", line)
        if m:
            scenes.append((int(m.group(1)), int(m.group(2)), m.group(3).strip()))
    if not scenes:
        for line in proj.script_md.split("\n"):
            if re.match(r"^\d+\.\s+\*\*", line):
                scenes.append((0, 8, line.split("**")[-1].strip()))
    n = max(len(scenes), len(proj.raw_clips or []))
    if n == 0:
        return
    note_short = (note or "").strip()[:200]
    await broadcast_message(
        {
            "type": "rocky_live",
            "project_id": project_id,
            "phase": "regen_all_start",
            "total_scenes": n,
            "regen_note": note_short,
            "message": f"Regen All เริ่ม — {n} ฉาก (creativity: {creativity_level})"
            + (f" — เหตุผล: {note_short}" if note_short else ""),
        }
    )
    for idx in range(n):
        await process_scene_regen(project_id, idx, creativity_level)
    await broadcast_message(
        {
            "type": "rocky_live",
            "project_id": project_id,
            "phase": "regen_all_done",
            "message": "Regen All ครบทุกฉากแล้ว",
        }
    )
    await broadcast_message({"type": "scenes_updated", "project_id": project_id, "clip_count": len(proj.raw_clips or [])})


async def process_rocky_editing(project_id: str, effect_preset: str = ""):
    """Background task: Render variants A/B/C ตามที่เลือกในโปรเจกต์"""
    async with _rocky_editing_registry_lock:
        if project_id in _rocky_editing_projects:
            await broadcast_message(
                {
                    "type": "rocky_live",
                    "project_id": project_id,
                    "phase": "edit_skipped",
                    "message": "Rocky กำลังเรนเดอร์โปรเจกต์นี้อยู่แล้ว — รอจบก่อน",
                }
            )
            return
        _rocky_editing_projects.add(project_id)
    try:
        proj = pm.load_project(project_id)
        if not proj:
            return

        min_clip = _min_scene_video_bytes()
        clips = [
            c
            for c in (proj.raw_clips or [])
            if (c or "").strip()
            and Path(c).is_file()
            and Path(c).stat().st_size >= min_clip
        ]
        audio = (
            proj.audio_narration_path
            if proj.audio_narration_path and Path(proj.audio_narration_path).exists()
            else ""
        )
        script = proj.script_md or ""

        # ไม่มีไฟล์ narration จาก Minnie — สร้าง TTS จาก VO ในบท (ไม่ใช่ทั้ง markdown) เพื่อ Master Assembly
        if not (audio and Path(audio).is_file()) and (script or "").strip():
            try:
                from factory.script_segmentation import gather_voiceover_text_for_tts
                from factory.grok_tts_api import generate_tts

                vo_plain = gather_voiceover_text_for_tts(script)
                if vo_plain.strip():
                    narr_dir = AQOND_BRAIN / "output" / ".tmp_audio"
                    narr_dir.mkdir(parents=True, exist_ok=True)
                    narr_mp3 = narr_dir / f"narration_{project_id}.mp3"
                    if generate_tts(
                        vo_plain[:12000],
                        str(narr_mp3),
                        voice_id=(os.getenv("GROK_TTS_VOICE") or "ara").strip() or "ara",
                        language="th",
                        logger=log,
                    ):
                        if narr_mp3.is_file() and narr_mp3.stat().st_size > 2000:
                            audio = str(narr_mp3.resolve())
                            proj.audio_narration_path = audio.replace("\\", "/")
                            pm._save(proj)
                            log.info(
                                "[Rocky Variants] สร้าง narration TTS จาก VO ในบท (%d chars) → %s",
                                len(vo_plain),
                                narr_mp3.name,
                            )
            except Exception as e:
                log.warning("[Rocky Variants] สร้าง TTS สำรองไม่สำเร็จ: %s", e)

        flags = getattr(proj, "variants_render_enabled", None) or {}
        variant_keys = [k for k in ("variant_a", "variant_b", "variant_c") if flags.get(k, True)]
        if not variant_keys:
            variant_keys = ["variant_a", "variant_b", "variant_c"]

        log.info(
            "[Rocky Variants] %s — clips:%d keys:%s beat_sync:%s edu:%s",
            project_id,
            len(clips),
            variant_keys,
            proj.beat_sync,
            proj.edu_overlay,
        )

        loop = asyncio.get_running_loop()

        def push_edit(meta: dict) -> None:
            asyncio.run_coroutine_threadsafe(
                broadcast_message({"type": "rocky_live", "project_id": project_id, **meta}),
                loop,
            )

        session_id = str(uuid.uuid4())
        cancel_ev = rocky_render_cancel_event(project_id)
        cancel_ev.clear()

        audio_ok = bool(audio) and Path(audio).is_file()
        if not audio_ok:
            narr = (proj.audio_narration_path or "").strip()
            log.warning(
                "[Rocky Variants] %s — ไม่มีไฟล์ narration ที่ใช้ได้ (path=%r); ข้าม variants → edit_video_pro",
                project_id,
                narr or "(empty)",
            )

        push_edit(
            {
                "phase": "edit_start",
                "variant_keys_planned": variant_keys,
                "render_session_id": session_id,
                "message": f"Rocky เริ่มตัดต่อ ({len(clips)} คลิป) — "
                + ", ".join(variant_keys)
                + ("" if audio_ok else " — ⚠ ไม่มี narration บนดิสก์: ข้าม multi-variant ใช้ fallback"),
            }
        )
        if not audio_ok:
            push_edit(
                {
                    "phase": "edit_variants_skipped",
                    "message": "ข้าม Variant A/B/C — ไม่มีไฟล์ narration (หรือ TTS สร้างไม่ได้); ใช้โหมดตัดต่อเดี่ยว",
                }
            )

        if not clips:
            push_edit(
                {
                    "phase": "edit_error",
                    "message": "ไม่มีคลิปที่ผ่านขนาดขั้นต่ำ — ส่ง Rocky Visual หรือ Regen ให้ได้คลิปจริงก่อน",
                }
            )
            pm.update_state(proj, ProductionState.VISUAL_PAUSED)
            pm._save(proj)
            cancel_ev.clear()
            return

        if clips and audio_ok:
            try:
                from factory.pro_auto_editor import render_all_variants
                from factory.scene_cache import clear_scene_cache, new_variant_filename_salt

                variants_dir = AQOND_BRAIN / "output" / "variants"
                cleared = clear_scene_cache(
                    project_id,
                    variants_dir=variants_dir,
                    thumbs_dir=THUMB_DIR,
                    logger=log,
                )
                log.info("[Rocky Variants] clear_scene_cache: %s", cleared)
                proj = pm.load_project(project_id)
                if not proj:
                    return
                proj.render_variants = {}
                pm._save(proj)

                variant_salt = new_variant_filename_salt()
                _bgm = str(BGM_ASSET) if BGM_ASSET.is_file() else None
                result_variants, cancelled = await asyncio.to_thread(
                    render_all_variants,
                    clips,
                    audio,
                    script,
                    str(variants_dir),
                    project_id,
                    log,
                    proj.beat_sync,
                    proj.edu_overlay,
                    push_edit,
                    variant_keys,
                    cancel_ev,
                    filename_salt=variant_salt,
                    director_preset=getattr(proj, "director_preset", None),
                    bgm_path=_bgm,
                )
                proj = pm.load_project(project_id)
                if not proj:
                    return
                if result_variants:
                    merged = dict(getattr(proj, "render_variants", None) or {})
                    merged.update(result_variants)
                    proj.render_variants = merged
                    proj.last_render_session_id = session_id
                    proj.last_render_at = datetime.now(timezone.utc).isoformat()
                    proj.last_render_variant_keys = list(result_variants.keys())
                    default = (
                        result_variants.get("variant_b")
                        or result_variants.get("variant_a")
                        or next(iter(result_variants.values()))
                    )
                    proj.edited_video_path = default
                    pm.update_state(proj, ProductionState.QC)
                    pm._save(proj)
                    log.info("[Rocky Variants] Done: %d variant(s)", len(result_variants))
                    push_edit(
                        {
                            "phase": "edit_all_done",
                            "message": "ตัดต่อครบที่เลือกไว้ — ไปดู Thomas"
                            + (" (หยุดก่อนจบทุก variant)" if cancelled else ""),
                        }
                    )
                    _vu = _static_url_for_output_video(Path(default))
                    await broadcast_message(
                        {
                            "type": "render_complete",
                            "project_id": project_id,
                            "video_path": default,
                            "video_url": _vu,
                            "variants": merged,
                            "variant_count": len(result_variants),
                            "render_session_id": session_id,
                            "last_render_variant_keys": list(result_variants.keys()),
                            "cancelled": cancelled,
                        }
                    )
                    cancel_ev.clear()
                    return
                if cancelled:
                    push_edit(
                        {
                            "phase": "edit_cancelled",
                            "message": "หยุดแล้ว — ไม่มี variant ใหม่ในชุดนี้",
                        }
                    )
                    pm.update_state(proj, ProductionState.VISUAL_PAUSED)
                    pm._save(proj)
                    cancel_ev.clear()
                    return
            except Exception as e:
                log.warning(
                    "[Rocky Variants] Multi-variant failed: %s — falling back to single render",
                    e,
                )
                push_edit({"phase": "edit_error", "message": str(e)[:200]})

        try:
            from factory.rocky_editor_api import edit_video_pro

            proj = pm.load_project(project_id)
            if not proj:
                return
            preset = effect_preset or (
                "vibe_tutorial" if proj.tier == "tutorial" else "vibe_fantasy"
            )
            push_edit({"phase": "edit_fallback", "message": "ใช้โหมดตัดต่อเดี่ยว (fallback)…"})
            edited_path, err = await asyncio.to_thread(
                lambda: edit_video_pro(
                    clips or [],
                    script,
                    project_id,
                    audio if audio else None,
                    log,
                    preset,
                    cancel_event=cancel_ev,
                )
            )
            if cancel_ev.is_set() and not edited_path:
                push_edit(
                    {
                        "phase": "edit_cancelled",
                        "message": "หยุดแล้ว (fallback)",
                    }
                )
                pm.update_state(proj, ProductionState.VISUAL_PAUSED)
                pm._save(proj)
                cancel_ev.clear()
                return
            if edited_path:
                proj.edited_video_path = edited_path
                rv = dict(getattr(proj, "render_variants", None) or {})
                rv["variant_a"] = edited_path
                proj.render_variants = rv
                proj.last_render_session_id = session_id
                proj.last_render_at = datetime.now(timezone.utc).isoformat()
                proj.last_render_variant_keys = ["variant_a"]
                pm.update_state(proj, ProductionState.QC)
                pm._save(proj)
                _vu_fb = _static_url_for_output_video(Path(edited_path))
                await broadcast_message(
                    {
                        "type": "render_complete",
                        "project_id": project_id,
                        "video_path": edited_path,
                        "video_url": _vu_fb,
                        "variants": rv,
                        "variant_count": 1,
                        "render_session_id": session_id,
                        "last_render_variant_keys": ["variant_a"],
                        "cancelled": False,
                    }
                )
                cancel_ev.clear()
            else:
                if str(err or "").lower() == "cancelled":
                    push_edit(
                        {
                            "phase": "edit_cancelled",
                            "message": "หยุดแล้ว (fallback / Claude path)",
                        }
                    )
                    pm.update_state(proj, ProductionState.VISUAL_PAUSED)
                    pm._save(proj)
                    cancel_ev.clear()
                    return
                log.error("[Rocky Editor] Fallback failed: %s", err)
                push_edit(
                    {
                        "phase": "edit_error",
                        "message": (str(err) if err else "ตัดต่อเดี่ยวล้มเหลว (ไม่มีรายละเอียด)")[:500],
                    }
                )
                pm.update_state(proj, ProductionState.FAILED)
                pm._save(proj)
        except Exception as e:
            log.error("[Rocky Editor] %s", e)
            push_edit(
                {
                    "phase": "edit_error",
                    "message": str(e)[:500],
                }
            )
            proj = pm.load_project(project_id)
            if proj:
                pm.update_state(proj, ProductionState.FAILED)
                pm._save(proj)
    finally:
        async with _rocky_editing_registry_lock:
            _rocky_editing_projects.discard(project_id)


async def process_pinky_review(project_id: str):
    """Background task: Pinky reviews video (10-point scale)"""
    from factory.pinky_brain import review_video
    
    proj = pm.load_project(project_id)
    if not proj or not proj.edited_video_path:
        return
    
    log.info("[Pinky Review] Starting for %s", project_id)
    review = await asyncio.to_thread(review_video, proj.edited_video_path, proj.script_md, log)
    
    proj.pinky_video_review = review.to_dict()
    proj.pinky_approved = review.approved
    
    if review.approved:
        pm.update_state(proj, ProductionState.APPROVED)
        log.info("[Pinky] APPROVED: %s (score: %d/10)", project_id, review.score)
    else:
        pm.update_state(proj, ProductionState.EDIT_REJECTED)
        proj.rework_count += 1
        proj.qc_notes = f"[Pinky Reject #{proj.rework_count}] {review.feedback}"
        log.warning("[Pinky] REJECTED: %s (score: %d/10)", project_id, review.score)
        
        # Auto-rework up to 3 times
        if proj.rework_count < 3:
            log.info("[Pinky] Auto-rework → Rocky (high creativity)")
            pm.update_state(proj, ProductionState.VISUAL_GEN)
            asyncio.create_task(process_rocky_visual(project_id, "high"))
    
    pm._save(proj)
    await broadcast_message({
        "type": "pinky_review_complete",
        "project_id": project_id,
        "approved": review.approved,
        "score": review.score,
        "feedback": review.feedback
    })


async def broadcast_message(msg: dict):
    """Broadcast message to all WebSocket clients"""
    dead_clients = []
    for client in clients:
        try:
            await client.send_text(json.dumps(msg))
        except:
            dead_clients.append(client)
    
    for client in dead_clients:
        clients.remove(client)


def main():
    """Start dashboard server"""
    log.info("[Dashboard] Starting on http://127.0.0.1:8765")
    log.info("[Dashboard] 5-Tab Interface: Navy | Pinky | Minnie | Rocky | Thomas")
    
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8765,
        log_level="warning",
        access_log=False
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    main()
