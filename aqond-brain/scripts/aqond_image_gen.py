#!/usr/bin/env python3
"""
Generate scene images via OpenAI Images API (DALL-E 3).

Dependencies:
    pip install openai python-dotenv

Environment (.env next to this file or cwd):
    OPENAI_API_KEY=sk-...

Usage:
    python aqond_image_gen.py
    python aqond_image_gen.py --json path/to/scenes.json
    python aqond_image_gen.py --json grokVideo/gemini-code-1777437544466.json --scenes 1 --workers 1 --force
    python aqond_image_gen.py --character-dna "A confident Thai male..."  # optional prefix on every prompt
    python aqond_image_gen.py --skip-existing
    python aqond_image_gen.py --force
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from openai import OpenAI

# Embedded default: 13 scenes (Post Script Flow Full style prompts)
DEFAULT_SCENES_JSON: list[dict[str, Any]] = [
    {
        "scene_number": 1,
        "image_prompt": "Cinematic 9:16, Portrait of a visionary leader in a high-tech studio, soft neon lighting, Post Tiktok Flow Full style, hyper-realistic, 8k resolution.",
    },
    {
        "scene_number": 2,
        "image_prompt": "Cinematic 9:16, Close up shot of professional barber tools moving with magical sparks, floating in mid-air, Post Script Flow Full style, high contrast.",
    },
    {
        "scene_number": 3,
        "image_prompt": "Cinematic 9:16, A futuristic digital marketplace interface glowing in a dark room, AQOND logo subtly in background, sharp focus.",
    },
    {
        "scene_number": 4,
        "image_prompt": "Cinematic 9:16, Action shot of a professional hand-shaking with a digital holographic client, gold and blue accents.",
    },
    {
        "scene_number": 5,
        "image_prompt": "Cinematic 9:16, Wide shot of a luxury modern office with a view of Bangkok skyline at night, 9 Eras Feng Shui lighting style.",
    },
    {
        "scene_number": 6,
        "image_prompt": "Cinematic 9:16, Emotional shot of a person feeling freedom, standing on a skyscraper balcony, wind blowing, Post Remember Clip Flow Full style.",
    },
    {
        "scene_number": 7,
        "image_prompt": "Cinematic 9:16, Macro shot of a smartphone screen showing the AQOND app interface, premium design, blurred background.",
    },
    {
        "scene_number": 8,
        "image_prompt": "Cinematic 9:16, A group of diverse professionals working together in a sleek, minimalist co-working space, warm cinematic lighting.",
    },
    {
        "scene_number": 9,
        "image_prompt": "Cinematic 9:16, Abstract representation of 'Shadow Power', numbers 1 to 19 glowing in a dark mystical void, purple and gold light.",
    },
    {
        "scene_number": 10,
        "image_prompt": "Cinematic 9:16, A busy CEO looking at a watch, time freezing around them, representing 'Selling Time' concept, sharp detail.",
    },
    {
        "scene_number": 11,
        "image_prompt": "Cinematic 9:16, Happy couple walking through a memory lane made of glowing photos, Post Remember Clip style, soft bokeh.",
    },
    {
        "scene_number": 12,
        "image_prompt": "Cinematic 9:16, The transformation of a regular workspace into a premium high-end service studio, cinematic transition look.",
    },
    {
        "scene_number": 13,
        "image_prompt": "Cinematic 9:16, Finale Scene: The AQOND icon rising like a sun over a digital city, hopeful atmosphere, epic scale, hyper-detailed.",
    },
]

DEFAULT_IMAGE_MODEL = "dall-e-3"
IMAGE_SIZE = "1024x1792"
IMAGE_QUALITY = "hd"
MAX_WORKERS = 13


def default_output_dir() -> Path:
    # aqond-brain/assets/scenes
    return Path(__file__).resolve().parent.parent / "assets" / "scenes"


def scene_filename(scene_number: int) -> str:
    return f"scene_{int(scene_number):02d}.png"


def load_dotenv_files() -> None:
    here = Path(__file__).resolve().parent
    root = here.parent
    load_dotenv(here / ".env")
    load_dotenv(root / ".env")
    load_dotenv()


def parse_scenes(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in raw:
        if "scene_number" not in row or "image_prompt" not in row:
            raise ValueError("Each scene must have 'scene_number' and 'image_prompt'")
        out.append(
            {
                "scene_number": int(row["scene_number"]),
                "image_prompt": str(row["image_prompt"]).strip(),
            }
        )
    out.sort(key=lambda x: x["scene_number"])
    return out


def load_scenes_from_args(ns: argparse.Namespace) -> list[dict[str, Any]]:
    if ns.json_file:
        text = Path(ns.json_file).expanduser().read_text(encoding="utf-8")
        return parse_scenes(json.loads(text))
    if ns.json_string:
        return parse_scenes(json.loads(ns.json_string))
    return parse_scenes(list(DEFAULT_SCENES_JSON))


def parse_scenes_filter(spec: str | None) -> set[int] | None:
    if spec is None or not str(spec).strip():
        return None
    out: set[int] = set()
    for part in str(spec).replace(" ", "").split(","):
        if not part:
            continue
        out.add(int(part))
    return out


def filter_scenes(
    scenes: list[dict[str, Any]],
    wanted: set[int] | None,
) -> list[dict[str, Any]]:
    if wanted is None:
        return scenes
    return [s for s in scenes if s["scene_number"] in wanted]


def apply_character_dna(scenes: list[dict[str, Any]], dna: str | None) -> None:
    if not dna or not str(dna).strip():
        return
    prefix = str(dna).strip()
    for s in scenes:
        s["image_prompt"] = f"{prefix}\n\n{s['image_prompt']}"


def download_url_to_file(url: str, dest: Path, timeout: int = 120) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = Request(url, headers={"User-Agent": "aqond_image_gen/1.0"})
    with urlopen(req, timeout=timeout) as resp:
        data = resp.read()
    if len(data) < 1000:
        raise RuntimeError(f"Download too small ({len(data)} bytes); check URL / API response")
    dest.write_bytes(data)


def resolve_conflict_policy(
    existing: list[Path],
    skip_existing: bool,
    force: bool,
) -> Literal["skip", "overwrite"] | None:
    if not existing:
        return "overwrite"
    if skip_existing:
        return "skip"
    if force:
        return "overwrite"
    print("\nพบไฟล์ที่มีอยู่แล้ว:")
    for p in existing:
        print(f"  - {p}")
    print(
        "\nเลือก: [s] ข้ามไฟล์ที่มีอยู่ (ไม่เขียนทับ)  |  "
        "[o] เขียนทับทั้งหมด  |  [q] ยกเลิก"
    )
    while True:
        choice = input("กด s / o / q: ").strip().lower()
        if choice in ("s", "skip"):
            return "skip"
        if choice in ("o", "overwrite", "y", "yes"):
            return "overwrite"
        if choice in ("q", "quit", "n", "no"):
            return None
        print("ไม่เข้าใจค่าที่เลือก — พิมพ์ s, o หรือ q")


def generate_one(
    api_key: str,
    scene: dict[str, Any],
    out_dir: Path,
    policy: Literal["skip", "overwrite"],
    image_model: str,
) -> tuple[str, str]:
    """Returns (status, detail) where status is ok|skipped|error."""
    num = scene["scene_number"]
    prompt = scene["image_prompt"]
    dest = out_dir / scene_filename(num)
    if dest.exists() and policy == "skip":
        return ("skipped", str(dest))

    client = OpenAI(api_key=api_key)
    try:
        kwargs: dict[str, Any] = {
            "model": image_model,
            "prompt": prompt,
            "n": 1,
        }
        if image_model == "dall-e-3":
            kwargs["size"] = IMAGE_SIZE
            kwargs["quality"] = IMAGE_QUALITY
        elif image_model == "dall-e-2":
            kwargs["size"] = "1024x1024"
        result = client.images.generate(**kwargs)
    except Exception as e:
        return ("error", f"scene {num}: API error — {e}")

    item = result.data[0]
    url = getattr(item, "url", None)
    b64 = getattr(item, "b64_json", None)
    try:
        if url:
            download_url_to_file(url, dest)
        elif b64:
            dest.write_bytes(base64.b64decode(b64))
        else:
            return ("error", f"scene {num}: no url or b64_json in response")
    except (HTTPError, URLError, OSError, RuntimeError) as e:
        return ("error", f"scene {num}: save failed — {e}")

    return ("ok", str(dest))


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate AQOND scene images (DALL-E 3).")
    parser.add_argument(
        "--out",
        type=Path,
        default=default_output_dir(),
        help="Output directory (default: aqond-brain/assets/scenes)",
    )
    parser.add_argument("--json", dest="json_file", type=Path, help="Path to JSON array of scenes")
    parser.add_argument("--json-string", dest="json_string", help="JSON array string (CLI)")
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="If output PNG exists, skip without asking",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing files without prompting",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=MAX_WORKERS,
        help=f"Parallel API calls (default {MAX_WORKERS}). ใช้ 1 เมื่อโดน rate limit",
    )
    parser.add_argument(
        "--scenes",
        help="เฉพาะหมายเลขฉาก คั่นด้วย comma เช่น 1 หรือ 1,5,13",
    )
    parser.add_argument(
        "--character-dna",
        dest="character_dna",
        metavar="TEXT",
        help="ข้อความนำหน้าทุก prompt (ถ้า JSON มีคำอธิบายตัวละครครบแล้ว ไม่ต้องใส่)",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_IMAGE_MODEL,
        help=(
            "OpenAI image model เช่น dall-e-3 (ค่าเริ่มต้น). "
            "โมเดล Nano Banana / Gemini ไม่ได้อยู่ที่ OpenAI — ต้องใช้ Gemini API แยก"
        ),
    )
    ns = parser.parse_args()
    if ns.skip_existing and ns.force:
        print("ใช้ได้ทีละอย่าง: --skip-existing หรือ --force", file=sys.stderr)
        return 2

    load_dotenv_files()
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        print("ตั้งค่า OPENAI_API_KEY ใน .env หรือ environment ก่อนรัน", file=sys.stderr)
        return 1

    try:
        scenes = load_scenes_from_args(ns)
    except (json.JSONDecodeError, OSError, ValueError) as e:
        print(f"โหลด JSON ไม่สำเร็จ: {e}", file=sys.stderr)
        return 1

    try:
        wanted = parse_scenes_filter(ns.scenes)
        scenes = filter_scenes(scenes, wanted)
        if wanted is not None and not scenes:
            print(
                f"ไม่พบ scene ใดที่ตรงกับ --scenes {ns.scenes!r}",
                file=sys.stderr,
            )
            return 1
    except ValueError as e:
        print(f"--scenes ไม่ถูกต้อง: {e}", file=sys.stderr)
        return 2

    apply_character_dna(scenes, ns.character_dna)

    out_dir = ns.out.expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    existing = [out_dir / scene_filename(s["scene_number"]) for s in scenes]
    existing = [p for p in existing if p.exists()]
    policy = resolve_conflict_policy(existing, ns.skip_existing, ns.force)
    if policy is None:
        print("ยกเลิกตามคำสั่งผู้ใช้")
        return 0

    sz_q = (
        f"size={IMAGE_SIZE} quality={IMAGE_QUALITY}"
        if ns.model == "dall-e-3"
        else f"model={ns.model}"
    )
    print(
        f"{ns.model} | {sz_q} | "
        f"{len(scenes)} scene(s) | out={out_dir} | workers={ns.workers}"
    )

    results_ok = results_skip = results_err = 0
    errors: list[str] = []

    workers = max(1, min(ns.workers, len(scenes)))
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {
            ex.submit(
                generate_one, api_key, scene, out_dir, policy, ns.model
            ): scene
            for scene in scenes
        }
        for fut in as_completed(futs):
            scene = futs[fut]
            try:
                status, detail = fut.result()
            except Exception as e:
                status, detail = "error", f"scene {scene['scene_number']}: {e}"
            if status == "ok":
                results_ok += 1
                print(f"OK   {detail}")
            elif status == "skipped":
                results_skip += 1
                print(f"SKIP {detail}")
            else:
                results_err += 1
                errors.append(detail)
                print(f"ERR  {detail}", file=sys.stderr)

    print(f"สรุป: ok={results_ok} skipped={results_skip} errors={results_err}")
    return 1 if results_err else 0


if __name__ == "__main__":
    raise SystemExit(main())
