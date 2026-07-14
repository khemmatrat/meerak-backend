"""
grok_connect.py — ทดสอบการเชื่อมต่อ Grok API (xAI)
ใช้ XAI_API_KEY จาก aqond-brain/.env (ไม่ log ค่า key)
ถ้าเชื่อมต่อได้ ส่งข้อความฉลองไป Discord #navy-intel
ถ้า Python ได้ 403 (Cloudflare) แต่เครื่องนี้ curl ใช้ได้ — จะลอง fallback ใช้ curl
"""

import json
import os
import subprocess
import sys
from pathlib import Path
from urllib.request import Request, urlopen, build_opener
from urllib.error import URLError, HTTPError

try:
    from urllib.request import ProxyHandler
    _HAS_PROXY = True
except ImportError:
    _HAS_PROXY = False

AQOND_BRAIN = Path(__file__).resolve().parent.parent
ENV_FILE = AQOND_BRAIN / ".env"
XAI_BASE = "https://api.x.ai/v1"
CHAT_COMPLETIONS = f"{XAI_BASE}/chat/completions"


def load_env() -> dict:
    out = {}
    if not ENV_FILE.exists():
        return out
    for line in open(ENV_FILE, "r", encoding="utf-8-sig"):  # utf-8-sig กิน BOM
        line = line.split("#")[0].strip().replace("\r", "").replace("\n", "")
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'").replace("\r", "").replace("\n", "")
        if v:
            out[k.strip()] = v
    return out


def _make_opener(env: dict):
    """ใช้ HTTPS_PROXY / HTTP_PROXY จาก env ถ้ามี (รองรับ VPN/proxy ที่ xAI อนุญาต)."""
    proxy_url = (env.get("HTTPS_PROXY") or env.get("https_proxy") or env.get("HTTP_PROXY") or env.get("http_proxy") or "").strip()
    if not proxy_url or not _HAS_PROXY:
        return None
    opener = build_opener(ProxyHandler({"https": proxy_url, "http": proxy_url}))
    return opener


def test_grok_connection(api_key: str, env: dict) -> tuple[bool, str]:
    """เรียก xAI Chat Completions (Grok) — ไม่ log api_key. คืน (สำเร็จหรือไม่, ข้อความ error ถ้ามี)."""
    payload = json.dumps({
        "model": "grok-4-1-fast",
        "messages": [
            {"role": "system", "content": "You are a test assistant."},
            {"role": "user", "content": "Testing. Just say hi and hello world and nothing else."},
        ],
        "stream": False,
        "temperature": 0,
        "max_tokens": 50,
    }).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "aqond-brain/1.0 (Grok-connect)",
    }
    req = Request(CHAT_COMPLETIONS, data=payload, headers=headers, method="POST")
    opener = _make_opener(env)
    open_func = opener.open if opener else urlopen
    try:
        with open_func(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return (bool(data.get("choices")), "")
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        try:
            err_json = json.loads(body)
            msg = err_json.get("error", {}).get("message", body) if isinstance(err_json.get("error"), dict) else body
        except Exception:
            msg = body or str(e)
        if e.code == 403:
            if "credits" in body.lower() or "licenses" in body.lower():
                msg = "ทีม xAI ยังไม่มี credits/licenses — เติมได้ที่ https://console.x.ai"
            elif "1010" in str(body):
                msg = "Cloudflare 1010: เครือข่าย/ภูมิภาคถูกบล็อก — ลอง VPN หรือ HTTPS_PROXY ใน .env"
        return (False, f"HTTP {e.code}: {msg}")
    except URLError as e:
        return (False, f"URLError: {e.reason}")
    except (json.JSONDecodeError, OSError) as e:
        return (False, str(e))


def send_celebration_to_navy_intel() -> bool:
    """ส่งข้อความฉลองไป #navy-intel (ใช้ DISCORD_WEBHOOK_NAVY จาก .env)."""
    sys.path.insert(0, str(AQOND_BRAIN / "scripts"))
    try:
        from report_to_discord import send_to_discord, NAVY_INTEL_CHANNEL_KEY
        msg = "🛰️ **Grok เชื่อมต่อแล้ว!** xAI API ติดเรียบร้อย — พร้อมส่ง Prompt ให้ Rocky/เจนภาพได้เลยครับ!"
        return send_to_discord(msg, NAVY_INTEL_CHANNEL_KEY)
    except Exception:
        return False


def test_grok_via_curl(api_key: str) -> tuple[bool, str]:
    """Fallback: เรียก xAI ผ่าน curl (ถ้า Python ถูก 403 แต่ curl ใช้ได้)."""
    payload = json.dumps({
        "model": "grok-4-1-fast",
        "messages": [
            {"role": "system", "content": "You are a test assistant."},
            {"role": "user", "content": "Testing. Just say hi and hello world and nothing else."},
        ],
        "stream": False,
        "temperature": 0,
        "max_tokens": 50,
    })
    try:
        r = subprocess.run(
            ["curl", "-sS", "-X", "POST", CHAT_COMPLETIONS,
             "-H", "Content-Type: application/json",
             "-H", f"Authorization: Bearer {api_key}",
             "-d", payload],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=str(AQOND_BRAIN),
        )
        if r.returncode != 0:
            return (False, f"curl exit {r.returncode}: {r.stderr or r.stdout}")
        data = json.loads(r.stdout)
        return (bool(data.get("choices")), "")
    except FileNotFoundError:
        return (False, "ไม่พบคำสั่ง curl")
    except subprocess.TimeoutExpired:
        return (False, "curl timeout")
    except (json.JSONDecodeError, OSError) as e:
        return (False, str(e))


def main():
    env = load_env()
    api_key = (env.get("XAI_API_KEY") or "").strip()
    if not api_key:
        print("ไม่พบ XAI_API_KEY ใน .env", file=sys.stderr)
        sys.exit(1)
    ok, err_msg = test_grok_connection(api_key, env)
    if not ok and "403" in (err_msg or "") and "1010" in (err_msg or ""):
        print("ลอง fallback ผ่าน curl ...", file=sys.stderr)
        ok, err_msg = test_grok_via_curl(api_key)
    if ok:
        print("Grok API เชื่อมต่อสำเร็จ")
        if send_celebration_to_navy_intel():
            print("ส่งข้อความฉลองไป #navy-intel แล้ว")
        else:
            print("ส่ง Discord ไม่ได้ — ตรวจสอบ DISCORD_WEBHOOK_NAVY ใน .env", file=sys.stderr)
    else:
        print("เชื่อมต่อ Grok API ไม่สำเร็จ:", err_msg or "ไม่ทราบสาเหตุ", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
