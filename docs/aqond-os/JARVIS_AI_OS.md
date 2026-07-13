# Jarvis as AI OS (not floating chat)

Jarvis must **speak first** with proactive briefs:

- วันนี้ยังไม่ได้ตอบลูกค้า
- ร้านยังไม่เปิด
- ยอดขายลด / อาหารขายดี
- Wallet เข้ามา / Rider ขาด
- คอร์สขายได้

API: `GET /api/experience/jarvis-brief` (stub 30a).  
Reuse: `/api/ai/jarvis`, `JarvisFab`, ai-core prompt — extend, do not recreate.

Flag: `AIVOS_JARVIS_PROACTIVE=1`
