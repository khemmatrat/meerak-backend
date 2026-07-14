"""
Scene / variant cache busting — ล้างไฟล์เก่าใต้ variants/ และ thumbs ก่อนเรนเดอร์ใหม่
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any


def clear_scene_cache(
    project_id: str,
    *,
    variants_dir: Path,
    thumbs_dir: Path | None = None,
    logger: logging.Logger | None = None,
) -> dict[str, Any]:
    """
    ลบ variant .mp4 ทั้งหมดของโปรเจกต์ใน variants_dir และ thumb ฉาก (ถ้ามี)
    เรียกก่อน render_all_variants ทุกครั้งเพื่อบังคับโฟลเดอร์ว่างจากคลิปรอบก่อน
    """
    log = logger or logging.getLogger("scene_cache")
    deleted_variants: list[str] = []
    deleted_thumbs: list[str] = []
    pid = (project_id or "").strip()
    if not pid:
        return {"deleted_variants": [], "deleted_thumbs": [], "error": "empty project_id"}

    if variants_dir.is_dir():
        for fp in variants_dir.glob(f"{pid}_*.mp4"):
            try:
                if fp.is_file():
                    fp.unlink(missing_ok=True)
                    deleted_variants.append(fp.name)
            except OSError as e:
                log.warning("[SceneCache] unlink variant failed %s: %s", fp, e)

    if thumbs_dir and thumbs_dir.is_dir():
        for th in thumbs_dir.glob(f"{pid}_sc*.jpg"):
            try:
                if th.is_file():
                    th.unlink(missing_ok=True)
                    deleted_thumbs.append(th.name)
            except OSError:
                pass

    if deleted_variants or deleted_thumbs:
        log.info(
            "[SceneCache] cleared project=%s mp4=%d thumbs=%d",
            pid,
            len(deleted_variants),
            len(deleted_thumbs),
        )
    return {"deleted_variants": deleted_variants, "deleted_thumbs": deleted_thumbs}


def verify_output_wall_fresh(
    path: str | Path,
    not_before_wall: float,
    *,
    slack_sec: float = 15.0,
) -> bool:
    """
    ตรวจว่าไฟล์มี mtime ไม่เก่ากว่าจุดเริ่มงาน (wall clock) — กันค้างไฟล์เก่าแล้วขึ้น DONE
    """
    p = Path(path)
    if not p.is_file():
        return False
    try:
        mtime = p.stat().st_mtime
    except OSError:
        return False
    return mtime >= not_before_wall - slack_sec


def new_variant_filename_salt() -> str:
    """Salt สำหรับชื่อไฟล์ variant รอบเดียวกัน (วินาที + suffix ลดชน)"""
    return f"{int(time.time())}_{time.time_ns() % 10000:04d}"
