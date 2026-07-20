# Cross-Platform Auth QA Matrix

**Tester:** _______________  
**Date (UTC+7):** _______________  
**API base:** `https://api.aqond.com`  
**App URL tested:** _______________ (e.g. `https://app.aqond.com`)  
**Deploy commit / Render deploy ID:** _______________  
**Smoke exit code after deploy:** ☐ 0 ☐ non-zero

---

## Automated smoke (attach JSON or paste path)

- [ ] `npm run war-room:auth-smoke -- https://api.aqond.com` → evidence: `prod-smoke.json`

---

## Manual flows

Legend: **P** = PASS, **F** = FAIL, **S** = SKIP (note why)

| Platform | Browser / WebView | Register | Login | Forgot password | Session expired → re-login UI | Evidence file |
| --- | --- | --- | --- | --- | --- | --- |
| Desktop | Chrome | | | | | |
| Desktop | Safari (macOS) | | | | | |
| Mobile | Safari (iOS) | | | | | |
| Mobile | Chrome (Android) | | | | | |
| In-app | iOS WebView | | | | | |
| In-app | Android WebView | | | | | |

---

## Per-flow notes (failures only)

### Register

- Phone / OTP / Firebase step that failed:
- Network status + response snippet:

### Login

- JWT received (Y/N — do not paste token):
- Protected page loaded after login (Y/N):

### Forgot password

- OTP send / verify / reset step:
- Network status + response snippet:

---

## Sign-off

| Role | Name | P / F | Date |
| --- | --- | --- | --- |
| QA | | | |
| Eng | | | |

**Overall:** ☐ PASS (all required cells P) ☐ FAIL ☐ CONDITIONAL (list blockers)
