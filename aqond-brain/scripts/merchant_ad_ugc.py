#!/usr/bin/env python3
"""AIVOS merchant-ad Phase 4 — single UGC lip-sync clip via Grok image-to-video."""
from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from factory.grok_video_api import generate_video_clip  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Merchant ad UGC lip-sync clip (Grok i2v)")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--duration", type=float, default=10)
    parser.add_argument("--out", required=True)
    parser.add_argument("--aspect", default="9:16")
    args = parser.parse_args()

    log = logging.getLogger("merchant_ad_ugc")
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    src = Path(args.image)
    if not src.is_file():
        print(json.dumps({"ok": False, "error": "image_missing"}))
        return 1

    dur = max(1, min(10, int(round(args.duration))))
    aspect = args.aspect if args.aspect in ("9:16", "16:9", "1:1") else "9:16"

    path = generate_video_clip(
        args.prompt,
        duration=dur,
        reference_image_path=str(src),
        logger=log,
        aspect_ratio=aspect,
        resolution="720p",
    )
    if not path:
        print(json.dumps({"ok": False, "error": "grok_failed"}))
        return 1

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, out)
    print(json.dumps({"ok": True, "path": str(out), "duration_sec": dur}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
