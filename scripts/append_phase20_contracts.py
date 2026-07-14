from pathlib import Path

path = Path(r"g:/meerak/PHASE20_GROWTH_ARCHITECTURE_SPEC.md")
text = path.read_text(encoding="utf-8")

ADDENDUM = Path(r"g:/meerak/scripts/phase20_addendum.md").read_text(encoding="utf-8")

marker = "# APPROVAL"
if marker not in text:
    raise SystemExit("marker not found")
text = text.replace(marker, ADDENDUM + "\n" + marker)
text = text.replace(
    "**Phase 20 SPEC COMPLETE -- DESIGN ONLY**",
    "**Phase 20 SPEC COMPLETE -- DESIGN ONLY (v1.1 -- SDK, Event, UI, Recommendation, Loop contracts added)**",
)
path.write_text(text, encoding="utf-8")
print(f"Updated {path} ({len(text)} bytes)")
