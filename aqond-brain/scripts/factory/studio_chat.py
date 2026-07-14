"""AI chat replies for Media Studio — Gemini / Grok / fallback."""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from factory.hook_factory import load_env
from factory import studio_context

log = logging.getLogger("studio_chat")

SYSTEM = """คุณคือผู้ช่วย AQOND Media Studio (app.aqond.com)
ตอบภาษาไทย กระชับ เป็นกันเอง
ช่วยผู้ใช้วางแผนโพสต์ (Flow 1), Reel 20s (Flow 2), Cinema (Flow 3)
ถามให้ชัดถ้าข้อมูลไม่พอ แนะนำให้กดปุ่มสร้างในแท็บ Flow ที่เหมาะสม"""


def reply(user_message: str, flow_type: str | None = None) -> str:
    env = load_env()
    ctx = studio_context.get_chat_context(flow_type=flow_type, limit=15)
    prompt = f"{SYSTEM}\n\n{ctx}\n\nผู้ใช้: {user_message}\n\nตอบสั้นๆ 2-4 ประโยว:"

    gemini_key = env.get("GEMINI_API_KEY", "").strip()
    if gemini_key:
        try:
            import google.generativeai as genai

            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel(env.get("GEMINI_MODEL", "gemini-1.5-flash"))
            resp = model.generate_content(prompt)
            text = (resp.text or "").strip()
            if text:
                return _clean(text)
        except Exception as e:
            log.warning("Gemini chat failed: %s", e)

    xai_key = env.get("XAI_API_KEY", "").strip()
    if xai_key:
        try:
            payload = json.dumps(
                {
                    "model": env.get("GROK_MODEL", "grok-3"),
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.7,
                }
            ).encode("utf-8")
            req = Request(
                "https://api.x.ai/v1/chat/completions",
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {xai_key}",
                },
                method="POST",
            )
            with urlopen(req, timeout=45) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            text = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
                .strip()
            )
            if text:
                return _clean(text)
        except (HTTPError, URLError, Exception) as e:
            log.warning("Grok chat failed: %s", e)

    flow_hint = {
        "flow1": "Flow 1 (โพสต์ 1:1)",
        "flow2": "Flow 2 (Reel 20s)",
        "flow3": "Flow 3 (Cinema)",
    }.get(flow_type or "", "Flow ที่เลือก")

    return (
        f"รับทราบครับ — \"{user_message[:80]}\"\n"
        f"ผมบันทึก brief แล้ว เลือกแท็บ {flow_hint} แล้วกดปุ่มสร้างได้เลย "
        f"หรือพิมพ์รายละเอียดเพิ่ม (ธีม, โทน, กลุ่มเป้าหมาย)"
    )


def _clean(text: str) -> str:
    s = text.strip()
    s = re.sub(r"^#+\s*", "", s)
    return s
