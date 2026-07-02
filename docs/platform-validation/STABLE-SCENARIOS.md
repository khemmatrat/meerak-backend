# Platform Validation — Stable Scenarios

Official seal record: when a scenario is marked **Stable**, it is governed by [GOVERNANCE.md](GOVERNANCE.md) rule **PV-001**.

---

## Stable registry

| Scenario | Title | Stable Since | Commit | Baseline / Mission |
| -------- | ----- | ------------ | ------ | ------------------ |
| S004 | Add to cart | 2026-07-02 | `29ac144d` | Baseline 001 — Marketplace Browse |
| S007 | Place order | 2026-07-02 | `9db705ef` | Consumer Checkout (Baseline 002 in progress) |
| S008 | Payment flow | 2026-07-02 | `104fd386` | Consumer Checkout (Baseline 002 in progress) |

---

## Sealed scenarios (do not touch)

**S008** — sealed after governance commit `docs(pv): seal S008 and update regression governance`.  
Next work: **S009 Payment verify** only.

**S007** — sealed after `docs(pv): record FLAKE-001 and regression accounting`.

**S004** — sealed at Baseline 001 (`baseline-wave1-2026-07-02`).

**S001–S006** — frozen per PV-001 (Browse + checkout complete; no feature work).

---

## How to use this file

In 2–3 years you can answer:

- When did S004 become stable?
- When did checkout (S007) first seal?
- When did payment UI (S008) seal?
- Which commit introduced a regression?
- Which scenarios must not be refactored without PV-001 approval?

---

*Append a row when a scenario is formally marked Stable. Never remove rows.*
