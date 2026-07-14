"""
Rocky (Visual Generation) — เรียก Video Generation API
xAI ยังไม่มี Video API (มีแค่ Chat + Image) — ใช้ alternative: Runway / Stable Video / Synthesia / local TTS+Image
สำหรับ MVP: ใช้ Grok-2 vision + image gen แล้วเปลี่ยนเป็น slideshow ผ่าน FFmpeg
"""

from __future__ import annotations

import json
import logging
import subprocess
import tempfile
from collections.abc import Callable
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

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


def generate_video_clips(
    script_md: str,
    logger: logging.Logger | None = None,
    creativity_level: str = "medium",
    project_id: str | None = None,
    progress_callback: Callable[[dict], None] | None = None,
) -> tuple[list[str] | None, str | None]:
    """
    Rocky Visual — สร้างวิดีโอ clips (Fantasy + Cinematic)
    Priority: Grok Video API > Stock Images + Ken Burns (fallback)
    
    Args:
        script_md: Script from Minnie
        logger: Logger
        creativity_level: "low" | "medium" | "high" | "extreme" (Fantasy intensity)
    
    Returns:
        (list_of_clip_paths, error_message)
    """
    log = logger or logging.getLogger("rocky_visual")

    from factory.mock_mode import is_mock_mode_enabled, mock_rocky_visual

    if is_mock_mode_enabled():
        log.warning(
            "[Rocky Visual] FACTORY_MOCK_MODE=1 — ไม่เรียก Grok Video ใช้คลิปสังเคราะห์; "
            "ปิด mock ใน .env ถ้าต้องการวิดีโอจาก Grok จริง"
        )
        return mock_rocky_visual(script_md, log)

    env = _load_env()

    xai_key = env.get("XAI_API_KEY", "").strip()
    use_grok_video = env.get("ROCKY_USE_GROK_VIDEO", "").strip() == "1"

    if xai_key and use_grok_video:
        log.info("[Rocky Visual] Grok Video API (Fantasy mode, creativity: %s)", creativity_level)
        result = _generate_with_grok_video(
            script_md,
            log,
            creativity_level,
            project_id=project_id,
            progress_callback=progress_callback,
        )
        if result[0]:
            return result
        log.warning("[Rocky Visual] Grok Video failed — fallback to Stock Images")
    elif xai_key:
        log.info("[Rocky Visual] Grok Video disabled — using Stock Images")
    else:
        log.info("[Rocky Visual] No XAI_API_KEY — using Stock Images")

    log.info("[Rocky Visual] Stock Images + Ken Burns (fallback)")
    return _generate_synthetic_clips(script_md, log, project_id=project_id)


def _scene_clip_min_bytes() -> int:
    """สอดคล้องกับ SCENE_VIDEO_MIN_BYTES ใน dashboard — ไม่ยอมรับคลิปหลัก KB เป็นของจริง"""
    env = _load_env()
    try:
        v = int((env.get("SCENE_VIDEO_MIN_BYTES") or "100000").strip())
    except ValueError:
        v = 100_000
    return max(50_000, min(v, 500_000_000))


def _resolve_ref_path(rel: str) -> Path | None:
    if not (rel or "").strip():
        return None
    p = AQOND_BRAIN / rel.replace("\\", "/").strip().lstrip("/")
    return p if p.is_file() else None


def _generate_with_grok_video(
    script_md: str,
    logger: logging.Logger,
    creativity_level: str = "medium",
    project_id: str | None = None,
    progress_callback: Callable[[dict], None] | None = None,
) -> tuple[list[str] | None, str | None]:
    """
    Grok Video API — Fantasy Expansion + Cinematic
    
    Args:
        script_md: Script from Minnie
        logger: Logger
        creativity_level: "low" | "medium" | "high" | "extreme"
    """
    from factory.grok_video_api import generate_video_clip
    from factory.prompt_expander import expand_prompt_with_ai
    from factory.pinky_brain import PinkyReview, review_expanded_prompt
    import re

    proj = None
    if project_id:
        from factory.production_manager import ProductionManager

        proj = ProductionManager(logger).load_project(project_id)

    character_abs: str | None = None
    brief = ""
    scene_ref_map: dict[str, str] = {}
    if proj:
        brief = (proj.brief or "").strip()
        cr = _resolve_ref_path(getattr(proj, "character_ref_rel", "") or "")
        if cr:
            character_abs = str(cr)
        scene_ref_map = dict(getattr(proj, "scene_ref_rel", None) or {})

    from factory.script_segmentation import shots_for_generation

    try:
        max_grok = int((_load_env().get("MAX_GROK_SCENES") or "10").strip())
    except ValueError:
        max_grok = 10
    max_grok = max(1, min(max_grok, 12))

    tgt = 0
    if proj:
        tgt = int(getattr(proj, "target_shot_count", 0) or 0)

    shot_specs = shots_for_generation(
        script_md,
        target_count=tgt,
        max_shots=max_grok,
    )
    logger.info(
        "[Rocky Visual Grok] Segmented script → %d shot(s) (target_shot_count=%s, max_grok=%s)",
        len(shot_specs),
        tgt if proj else "n/a",
        max_grok,
    )
    scenes: list[tuple[int, int, str]] = []
    for s in shot_specs:
        scenes.append(
            (
                int(s.get("start_sec", 0)),
                int(s.get("end_sec", 10)),
                (s.get("visual_prompt") or s.get("description") or "Scene").strip(),
            )
        )

    if not scenes:
        logger.warning("[Rocky Visual Grok] No scenes — creating default")
        scenes = [(0, 10, "Advertisement for Aqond app, modern Thai startup")]

    clip_slots: list[str] = [""] * len(scenes)
    n_scenes = len(clip_slots)
    if progress_callback:
        try:
            progress_callback(
                {
                    "phase": "visual_start",
                    "total_scenes": n_scenes,
                    "message": f"Rocky + Grok: เริ่มสร้าง {n_scenes} ฉาก"
                    + (" (ล็อกตัวละครจากรูป)" if character_abs else " (สร้างสรรค์อิสระ — ไม่มีรูป ref)"),
                }
            )
        except Exception:
            pass

    from factory.rocky_editor_api import resolve_continuity_reference

    for idx, (start, end, desc) in enumerate(scenes):
        dur = min(15, max(3, end - start))

        if progress_callback:
            try:
                progress_callback(
                    {
                        "phase": "scene_work",
                        "scene_index": idx,
                        "total_scenes": n_scenes,
                        "message": f"ฉาก {idx + 1}/{n_scenes} — ขยาย prompt & ส่ง Grok Video",
                    }
                )
            except Exception:
                pass
        
        # FANTASY EXPANSION (Dynamic — AI-powered); lock identity when brand ref exists
        logger.info("[Rocky Visual] Expanding scene %d (creativity: %s)...", idx, creativity_level)
        expanded_prompt = expand_prompt_with_ai(
            desc,
            creativity_level,
            logger,
            campaign_brief=brief,
            scene_index=idx,
            total_scenes=n_scenes,
            identity_locked=bool(character_abs),
        )

        scene_supp = _resolve_ref_path(scene_ref_map.get(str(idx), "") or "")
        if scene_supp:
            expanded_prompt += (
                " Include supporting UI/product/layout from this campaign beat as described in the script; "
                "keep the main person unchanged."
            )
        
        # PINKY GATEKEEPER — skip fantasy-rewrite when image-to-video locks the face
        if character_abs:
            prompt_review = PinkyReview(
                True,
                9,
                "Brand character reference — identity locked",
                [],
                [],
                fixed_prompt="",
            )
        else:
            prompt_review = review_expanded_prompt(desc, expanded_prompt, logger)
        
        if not prompt_review.approved and prompt_review.fixed_prompt:
            logger.warning("[Pinky Gate] Prompt score %d/10 — using Pinky's fixed version", prompt_review.score)
            expanded_prompt = prompt_review.fixed_prompt
        else:
            logger.info("[Pinky Gate] Prompt approved (%d/10)", prompt_review.score)
        
        logger.info("[Rocky Visual Grok] Clip %d: generating fantasy scene (wait ~60-120s)...", idx)
        logger.info("[Rocky Visual Grok] Prompt preview: %s...", expanded_prompt[:100])

        ref_for_grok = character_abs
        if not ref_for_grok and project_id and idx > 0:
            prev_slot = (clip_slots[idx - 1] or "").strip()
            if prev_slot:
                anchor = resolve_continuity_reference(
                    character_ref_abs=None,
                    previous_clip_path=prev_slot,
                    project_id=project_id,
                    shot_index=idx,
                    logger=logger,
                )
                if anchor:
                    ref_for_grok = anchor
                    logger.info("[Rocky Visual Grok] Continuity anchor from shot %d", idx - 1)

        def _clip_progress(meta: dict) -> None:
            if not progress_callback:
                return
            try:
                progress_callback({**meta, "scene_index": idx, "total_scenes": n_scenes})
            except Exception:
                pass
        
        clip_path = generate_video_clip(
            expanded_prompt,
            duration=dur,
            creativity_level=creativity_level,
            logger=logger,
            reference_image_path=ref_for_grok,
            progress_callback=_clip_progress if progress_callback else None,
            project_id=project_id,
            scene_index=idx,
        )

        min_b = _scene_clip_min_bytes()

        def _assign_if_valid(path: str | None, source: str) -> None:
            if not path or not Path(path).exists():
                return
            sz = Path(path).stat().st_size
            if sz < min_b:
                logger.error(
                    "[Rocky Visual Grok] ฉาก %d: %s ขนาด %d bytes ต่ำกว่าขั้นต่ำ %d — ไม่บันทึกสล็อต",
                    idx + 1,
                    source,
                    sz,
                    min_b,
                )
                return
            from factory.rocky_editor_api import _validate_media_file

            if not _validate_media_file(path, logger):
                logger.error(
                    "[Rocky Visual Grok] ฉาก %d: %s ไม่ผ่านการตรวจสื่อ — ดู log [Grok Video]",
                    idx + 1,
                    source,
                )
                return
            clip_slots[idx] = str(Path(path).resolve())
            logger.info(
                "[Rocky Visual Grok] Clip %d: OK %s (%.1f KB)",
                idx,
                source,
                sz / 1024,
            )

        if clip_path and Path(clip_path).exists():
            _assign_if_valid(clip_path, "Grok")
            if not clip_slots[idx].strip():
                logger.error(
                    "[Rocky Visual Grok] ฉาก %d: Grok ไม่ได้คลิปที่ใช้ได้ — ลอง Ken Burns",
                    idx + 1,
                )
                fallback_clip = _create_fallback_clip(
                    desc, dur, logger, project_id=project_id, scene_index=idx
                )
                _assign_if_valid(fallback_clip, "fallback")
        else:
            logger.error(
                "[Rocky Visual Grok] ฉาก %d: Grok Video ไม่คืนไฟล์ — "
                "สาเหตุมักอยู่ที่ API/โควตา/timeout; ดู log [Grok Video]",
                idx + 1,
            )
            fallback_clip = _create_fallback_clip(
                desc, dur, logger, project_id=project_id, scene_index=idx
            )
            _assign_if_valid(fallback_clip, "fallback")

        if progress_callback:
            try:
                if clip_slots[idx].strip():
                    progress_callback(
                        {
                            "phase": "scene_saved",
                            "scene_index": idx,
                            "total_scenes": n_scenes,
                            "message": f"ฉาก {idx + 1} บันทึกคลิปแล้ว",
                        }
                    )
                else:
                    progress_callback(
                        {
                            "phase": "scene_clip_missing",
                            "scene_index": idx,
                            "total_scenes": n_scenes,
                            "message": f"ฉาก {idx + 1} ยังไม่มีคลิปที่ผ่านขนาดขั้นต่ำ — รอ Grok/ลองใหม่",
                        }
                    )
            except Exception:
                pass
    
    if not any(s.strip() for s in clip_slots):
        return (None, "Grok Video generation failed — ไม่มีคลิปที่ผ่านขนาดขั้นต่ำ")

    n_ok = sum(1 for s in clip_slots if s.strip())
    logger.info("[Rocky Visual Grok] สล็อต %d ฉาก — มีคลิปจริง %d ไฟล์", len(clip_slots), n_ok)
    if progress_callback:
        try:
            progress_callback(
                {
                    "phase": "visual_done",
                    "total_scenes": n_scenes,
                    "clip_count": n_ok,
                    "message": f"ครบ {n_ok}/{len(clip_slots)} คลิปที่ใช้ได้ — รอรีวิว storyboard",
                }
            )
        except Exception:
            pass
    return (clip_slots, None)


def _create_fallback_clip(
    scene_desc: str,
    duration: float,
    logger: logging.Logger,
    *,
    project_id: str | None = None,
    scene_index: int | None = None,
) -> str | None:
    """
    FALLBACK: Create Stock Image clip (NO BLACK SCREENS!)
    Priority: Grok-generated image > Ken Burns effect > Gradient
    """
    from factory.visual_upgrade import generate_image_with_grok, create_ken_burns_clip
    import tempfile
    
    logger.info("[Rocky Fallback] Creating stock clip for: %s", scene_desc[:50])
    
    # Try Grok image first
    image_path = generate_image_with_grok(scene_desc, logger)
    
    if image_path and Path(image_path).exists():
        logger.info("[Rocky Fallback] Grok image OK — applying Ken Burns")
        temp_clip = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False).name
        success = create_ken_burns_clip(image_path, duration, temp_clip, logger)
        if success:
            if project_id is not None and scene_index is not None:
                from factory.clip_storage import persist_scene_clip

                return persist_scene_clip(temp_clip, project_id, scene_index, logger)
            return temp_clip
        else:
            logger.warning("[Rocky Fallback] Ken Burns failed — ไม่สร้างวิดีโอพื้นสี/สตับ")
    else:
        logger.warning("[Rocky Fallback] Grok image ไม่สำเร็จ — ไม่สร้าง placeholder ปลอม")

    return None


def _generate_synthetic_clips(
    script_md: str,
    logger: logging.Logger,
    *,
    project_id: str | None = None,
) -> tuple[list[str], None]:
    """
    Fallback: Stock images + Ken Burns (NO text-only backgrounds)
    Priority: Real photos of people working > Gradient
    """
    import re
    from factory.visual_upgrade import generate_image_with_grok, create_ken_burns_clip

    scenes = []
    for line in script_md.split("\n"):
        m = re.search(r"\[(\d+)-(\d+)s\]\s*(.+)", line)
        if m:
            start, end, desc = int(m.group(1)), int(m.group(2)), m.group(3).strip()
            scenes.append((start, end, desc))

    if not scenes:
        logger.info("[Rocky Visual] ไม่พบ scene markers — แยกตาม ## SCENES")
        for line in script_md.split("\n"):
            if re.match(r"^\d+\.\s+\*\*\[", line):
                m = re.search(r"\[(\d+)-(\d+)s\]\*\*\s*(.+)", line)
                if m:
                    start, end, desc = int(m.group(1)), int(m.group(2)), m.group(3).strip()
                    scenes.append((start, end, desc))

    if not scenes:
        logger.warning("[Rocky Visual] ไม่พบ scenes — สร้าง 6 คลิปจาก script")
        chunks = [script_md[i:i+150] for i in range(0, min(900, len(script_md)), 150)]
        scenes = [(i*7, (i+1)*7, chunks[i] if i < len(chunks) else "Scene") for i in range(6)]

    clips = []
    tmp_dir = Path(tempfile.mkdtemp(prefix="rocky_visual_"))
    env = _load_env()
    use_grok_images = env.get("ROCKY_USE_GROK_IMAGES", "").strip() == "1"

    for idx, (start, end, desc) in enumerate(scenes[:12]):
        dur = max(3.0, end - start)
        if project_id:
            from factory.clip_storage import scene_clip_file

            out = scene_clip_file(project_id, idx)
        else:
            out = tmp_dir / f"clip_{idx:02d}.mp4"
        
        # Priority 1: Grok image generation (professional photos)
        image_path = None
        if use_grok_images:
            img_prompt = (
                f"Professional advertisement photo: {desc[:150]}. "
                f"Realistic human in modern office, high-quality photography, "
                f"cinematic lighting, 4K, vibrant colors."
            )
            image_path = generate_image_with_grok(img_prompt, logger)
        
        if image_path and Path(image_path).exists():
            # Ken Burns effect (zoom + pan ภาพคนจริง)
            ok = create_ken_burns_clip(image_path, dur, str(out), logger)
            if ok and out.exists() and out.stat().st_size > 5000:
                clips.append(str(out))
                logger.info("[Rocky Visual] Clip %d: Ken Burns (%.1f KB)", idx, out.stat().st_size / 1024)
                continue
        
        # Priority 2: Stock image (professional photos of people working)
        from factory.stock_images import get_stock_image_url, download_stock_image
        
        stock_url = get_stock_image_url(idx)
        stock_img = tmp_dir / f"stock_{idx}.jpg"
        
        if download_stock_image(stock_url, str(stock_img), timeout=15):
            # Ken Burns effect on real photo
            ok = create_ken_burns_clip(str(stock_img), dur, str(out), logger)
            if ok and out.exists() and out.stat().st_size > 5000:
                clips.append(str(out))
                logger.info("[Rocky Visual] Clip %d: Stock photo + Ken Burns (%.1f KB)", idx, out.stat().st_size / 1024)
                continue
        
        # Priority 3: Gradient (last resort — NO TEXT)
        colors = ["0x1e3a8a", "0x7c2d12", "0x065f46", "0x6b21a8", "0x831843", "0x1e40af"]
        color = colors[idx % len(colors)]
        
        vf = f"color=c={color}:s=1920x1080:r=30:d={dur:.2f},format=yuv420p"
        
        args = [
            "ffmpeg", "-y", "-f", "lavfi", "-i", vf,
            "-c:v", "libx264", "-preset", "fast", "-crf", "22",
            "-pix_fmt", "yuv420p", str(out)
        ]
        
        try:
            r = subprocess.run(args, capture_output=True, text=True, timeout=45)
            if r.returncode == 0 and out.exists() and out.stat().st_size > 1000:
                clips.append(str(out))
                logger.info("[Rocky Visual] Clip %d: gradient (%.1f KB)", idx, out.stat().st_size / 1024)
        except Exception as e:
            logger.warning("[Rocky Visual] Clip %d: %s", idx, e)

    if not clips:
        logger.error("[Rocky Visual] ไม่มีคลิปใดสำเร็จ")
        return (None, "Clip generation ล้มเหลวทั้งหมด")

    logger.info("[Rocky Visual] สร้าง %d clips", len(clips))
    return (clips, None)


def _generate_via_runway(script: str, api_key: str, logger: logging.Logger) -> tuple[list[str] | None, str | None]:
    """Runway Gen-3 API (ถ้ามี key) — ต้องมี credits"""
    logger.info("[Rocky Visual] Runway API — ยังไม่ implement เต็ม (ต้องจ่ายเงิน)")
    return (None, "Runway API ต้อง implement + credits")


def _generate_via_synthesia(script: str, api_key: str, logger: logging.Logger) -> tuple[list[str] | None, str | None]:
    """Synthesia API (AI Avatar video) — ต้องมี subscription"""
    logger.info("[Rocky Visual] Synthesia API — ยังไม่ implement เต็ม (ต้อง subscription)")
    return (None, "Synthesia API ต้อง implement + subscription")
