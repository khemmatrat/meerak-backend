#!/usr/bin/env python3
"""Insert phase20_v12_addendum.md into PHASE20_GROWTH_ARCHITECTURE_SPEC.md (v1.2)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / "PHASE20_GROWTH_ARCHITECTURE_SPEC.md"
ADDENDUM_PATH = Path(__file__).resolve().parent / "phase20_v12_addendum.md"

MARKER = "# APPROVAL"
FOOTER_V11 = (
    "**Phase 20 SPEC COMPLETE -- DESIGN ONLY "
    "(v1.1 -- SDK, Event, UI, Recommendation, Loop contracts added)**"
)
FOOTER_V12 = (
    "**Phase 20 SPEC COMPLETE -- DESIGN ONLY "
    "(v1.2 -- Domain Model, UX Blueprint, KPI Spec, Sprint Plan added)**"
)


def main() -> None:
    if not ADDENDUM_PATH.is_file():
        raise SystemExit(f"Addendum not found: {ADDENDUM_PATH} — run gen_phase20_v12_addendum.py first")

    text = SPEC.read_text(encoding="utf-8")
    addendum = ADDENDUM_PATH.read_text(encoding="utf-8")

    if "# 37. GROWTH DOMAIN MODEL" in text:
        raise SystemExit("v1.2 addendum already present (§37 found) — aborting duplicate insert")

    if MARKER not in text:
        raise SystemExit(f"marker not found: {MARKER}")

    text = text.replace(MARKER, addendum.rstrip() + "\n\n" + MARKER)
    text = text.replace(FOOTER_V11, FOOTER_V12)
    text = text.replace(
        "**Phase 20 SPEC v1.1 — SDK, Event, UI, Recommendation, and Loop contracts complete.**",
        "**Phase 20 SPEC v1.2 — Domain Model, UX Blueprint, KPI Specification, and Sprint Plan complete.**",
    )

    SPEC.write_text(text, encoding="utf-8")
    print(f"Updated {SPEC} ({len(text)} bytes)")


if __name__ == "__main__":
    main()
