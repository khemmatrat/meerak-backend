"""
grok_app_description.py — ใช้ Grok (xAI) ร่างคำบรรยายแอป Aqond สำหรับ Play Store + App Store
รัน: python scripts/grok_app_description.py
     python scripts/grok_app_description.py "เพิ่มข้อมูลแอปของคุณที่นี่..."

ผลลัพธ์บันทึกลง config/app_store_copy_grok.md (และพิมพ์ออก stdout)
ไม่ log XAI_API_KEY
"""

import argparse
import json
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
OUT_FILE = AQOND_BRAIN / "config" / "app_store_copy_grok.md"
CHAT_COMPLETIONS = "https://api.x.ai/v1/chat/completions"
MODEL = "grok-4-1-fast"


def load_env() -> dict:
    out = {}
    if not ENV_FILE.exists():
        return out
    for line in open(ENV_FILE, "r", encoding="utf-8-sig"):
        line = line.split("#")[0].strip().replace("\r", "").replace("\n", "")
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'").replace("\r", "").replace("\n", "")
        if v:
            out[k.strip()] = v
    return out


def _make_opener(env: dict):
    proxy_url = (env.get("HTTPS_PROXY") or env.get("https_proxy") or env.get("HTTP_PROXY") or env.get("http_proxy") or "").strip()
    if not proxy_url or not _HAS_PROXY:
        return None
    return build_opener(ProxyHandler({"https": proxy_url, "http": proxy_url}))


def grok_chat(api_key: str, env: dict, system: str, user: str, max_tokens: int = 4096) -> tuple[str | None, str]:
    payload = json.dumps({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": False,
        "temperature": 0.7,
        "max_tokens": max_tokens,
    }).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "aqond-brain/1.0 (grok-app-description)",
    }
    req = Request(CHAT_COMPLETIONS, data=payload, headers=headers, method="POST")
    opener = _make_opener(env)
    open_func = opener.open if opener else urlopen
    try:
        with open_func(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            choices = data.get("choices") or []
            if not choices:
                return None, "ไม่มี choices ใน response"
            content = (choices[0].get("message") or {}).get("content") or ""
            return content.strip(), ""
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        return None, f"HTTP {e.code}: {body[:500]}"
    except (URLError, json.JSONDecodeError, OSError) as e:
        return None, str(e)


def main():
    parser = argparse.ArgumentParser(description="ร่างคำบรรยายแอป Aqond ผ่าน Grok")
    parser.add_argument("extra", nargs="*", help="ข้อความเพิ่มเติมเกี่ยวกับแอป (ฟีเจอร์, กลุ่มเป้าหมาย)")
    parser.add_argument("-o", "--output", type=Path, default=OUT_FILE, help="ไฟล์บันทึกผล")
    args = parser.parse_args()
    extra = " ".join(args.extra).strip()

    env = load_env()
    api_key = (env.get("XAI_API_KEY") or "").strip()
    if not api_key:
        print("ไม่พบ XAI_API_KEY ใน .env", file=sys.stderr)
        sys.exit(1)

    system = (
        "You are an expert ASO (App Store Optimization) copywriter for Thailand and global stores. "
        "Write in Thai for user-facing text where natural; use English only for App Store subtitle if required. "
        "Be truthful, avoid false claims, no misleading guarantees about job placement or income. "
        "Optimize for search: หางาน, สมัครงาน, freelance, remote, part-time, full-time, รายได้เสริม, งานออนไลน์, "
        "Aqond, job app Thailand — weave keywords naturally, not keyword stuffing."
    )
    user = f"""แอปชื่อ **Aqond** — แอปหางาน / จับคู่งาน (ไทย)

งานของคุณ: ร่างคำบรรยายที่ทำให้คนอยากโหลดทันที + SEO/ASO ให้ติดค้นหาได้ดี

ข้อกำหนดความยาว (ต้องปฏิบัติตาม):
- **Google Play — Short description**: สูงสุด 80 ตัวอักษร (นับรวมช่องว่าง)
- **Google Play — Full description**: ยาวได้ถึง ~4000 ตัวอักษร ใช้หัวข้อ bullet ชัดเจน
- **App Store — Subtitle**: สูงสุด 30 ตัวอักษร
- **App Store — Promotional text** (optional): สั้น ๆ อัปเดตได้
- **App Store — Description**: ยาวได้ ~4000 ตัวอักษร

ให้ตอบเป็น Markdown โครงสร้างดังนี้ (ห้ามขาดส่วน):

# Play Store
## Short (≤80 chars) — ใส่บรรทัดเดียว
## Full description

# App Store
## Subtitle (≤30 chars)
## Promotional text (optional)
## Description

# Keywords / แท็กแนะนำ (รายการ comma หรือ bullet สำหรับ ASO)

# หมายเหตุสั้น ๆ (1 ย่อหน้า) ว่าควร A/B test อะไร

ข้อมูลเพิ่มจากเจ้าของแอป (ถ้ามี): {extra or "(ยังไม่มี — สมมติว่าเป็นแอปหางาน สมัครงาน ดูงานใหม่ แจ้งเตือน โปรไฟล์ งานฟรีแลนซ์/พาร์ทไทม์/ฟูลไทม์ รองรับไทย)"}
"""
    text, err = grok_chat(api_key, env, system, user)
    if not text:
        print("Grok ล้มเหลว:", err, file=sys.stderr)
        sys.exit(1)

    header = (
        "<!-- สร้างโดย grok_app_description.py — ตรวจทานก่อนโพสต์จริง -->\n\n"
    )
    out = header + text
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(out, encoding="utf-8")
    print(out)
    print(f"\n--- บันทึกแล้ว: {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
