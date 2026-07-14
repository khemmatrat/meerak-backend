"""
discord_commander.py — ดักคำสั่งใน Discord ห้อง #commander (ต้องใช้ Bot + Message Content Intent)

คำสั่ง:
  !navy [หัวข้อ]     -> รัน Navy สืบข่าวทันที (หัวข้อ = keyword RSS เพิ่ม)
  !minnie [หัวข้อ]   -> สร้าง**ใบสั่งงาน**เท่านั้น (ไม่ใช่บทโพสต์จริง)
  !draft บทเต็ม...   -> บันทึกบทแล้วรอ !pinky เอง
  !flow บทเต็ม...    -> **ครั้งเดียวไหลทั้งสาย:** บันทึก → Pinky → ready_to_post → Rocky brief → เจน .mp4 (Rocky Studio)
  !go บทเต็ม...      -> เหมือน !flow
  !rocky [ชื่อไฟล์]   -> ส่งต่อบทจากมินนี่ → video_brief ใน pipeline/rocky + แจ้ง Rocky (ชื่อไฟล์ว่าง = ใช้ draft ล่าสุด)
  !pinky [รีวิว]     -> รัน Pinky ตรวจงาน + สรุปสั้นใน #commander
  !all start         -> เริ่ม loop อัตโนมัติ (systemd ตาม AQOND_SYSTEMD_UNITS หรือ spawn orchestrator + pinky_watch)

.env (aqond-brain):
  DISCORD_BOT_TOKEN=...                    (Bot token จาก Discord Developer Portal)
  DISCORD_COMMANDER_CHANNEL_ID=...  (optional — ถ้าว่างจะฟังตามชื่อห้องด้านล่าง)
  DISCORD_COMMANDER_CHANNEL_SUBSTR — ใส่ได้ทั้งชื่อย่อย (navy-intel) หรือ Channel ID (ตัวเลขยาว)
  DISCORD_COMMANDER_CHANNEL_ID=id1,id2  (ทางเลือก)
  DISCORD_COMMANDER_GUILD_ID=...         (optional)

  ใน Bot: เปิด Privileged Gateway Intents -> MESSAGE CONTENT INTENT
  เชิญบอทเข้าเซิร์ฟ มีสิทธิ์อ่าน/ส่งข้อความในห้อง commander

ไม่ log token
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

AQOND_BRAIN = Path(__file__).resolve().parent.parent
SCRIPTS = AQOND_BRAIN / "scripts"
PIPELINE = AQOND_BRAIN / "pipeline"
MINNIE_DRAFTS = PIPELINE / "minnie_drafts"
READY_TO_POST = PIPELINE / "ready_to_post"
ROCKY_DIR = PIPELINE / "rocky"
MINNIE_PIPELINE = PIPELINE / "minnie"
LOOP_STATE = PIPELINE / ".discord_loop_state.json"

_TASK_PREFIXES = ("competitive_response_", "discord_order_", "revision_request_", "quality_feedback_")

try:
    import discord
except ImportError:
    print("ติดตั้ง: pip install -r requirements-discord-bot.txt", file=sys.stderr)
    sys.exit(1)


def load_dotenv_simple() -> dict:
    env = {}
    p = AQOND_BRAIN / ".env"
    if not p.exists():
        return env
    for line in p.read_text(encoding="utf-8-sig").splitlines():
        line = line.split("#")[0].strip()
        if "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def _webhook_post(url: str, content: str) -> bool:
    if not url:
        return False
    import urllib.request
    url = url.replace("https://discordapp.com/", "https://discord.com/", 1)
    data = json.dumps({"content": content[:1900]}).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json", "User-Agent": "DiscordBot (aqond-brain/1.0)"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return 200 <= r.getcode() < 300
    except Exception:
        return False


def _count_ready_to_post() -> int:
    d = PIPELINE / "ready_to_post"
    if not d.is_dir():
        return 0
    return sum(1 for f in d.iterdir() if f.is_file() and not f.name.startswith("."))


def pipeline_summary() -> str:
    lines = []
    ready_n = 0
    for name, sub in [
        ("minnie_drafts", MINNIE_DRAFTS),
        ("ready_to_post", PIPELINE / "ready_to_post"),
        ("thomas/reports", PIPELINE / "thomas" / "reports"),
        ("pinky/strategy", PIPELINE / "pinky" / "strategy"),
    ]:
        n = 0
        if sub.is_dir():
            n = sum(1 for f in sub.iterdir() if f.is_file() and not f.name.startswith("."))
        if name == "ready_to_post":
            ready_n = n
        lines.append(f"- {name}: {n} ไฟล์")
    spy = PIPELINE / "spy_report.json"
    lines.append(f"- spy_report: {'มี' if spy.is_file() else 'ไม่มี'}")
    if MINNIE_DRAFTS.is_dir():
        task_n = sum(
            1
            for f in MINNIE_DRAFTS.iterdir()
            if f.is_file()
            and (
                f.name.startswith("competitive_response_")
                or f.name.startswith("discord_order_")
            )
        )
        other = sum(
            1
            for f in MINNIE_DRAFTS.iterdir()
            if f.is_file()
            and not f.name.startswith(".")
            and not f.name.startswith(("revision_request_", "quality_feedback_"))
            and not f.name.startswith(("competitive_response_", "discord_order_"))
        )
        lines.append(f"- **แยกใน minnie_drafts:** ใบสั่งงาน **{task_n}** | ไฟล์ draft อื่น **{other}**")
    if ready_n > 0:
        lines.append(
            f"\n✅ **ready_to_post มี {ready_n} ไฟล์ — พร้อมโพสต์แล้ว** "
            f"→ ฝั่ง Thomas/Backend เอาไปโพสต์ หรือสั่ง **`!rocky`** / **`!flow`** เพื่อทำวิดีโอต่อ"
        )
    else:
        lines.append(
            "\n⏳ **ready_to_post ว่าง** — ต้องมีบทจริงใน minnie_drafts แล้วให้ Pinky ผ่านเกณฑ์ "
            "(หรือใช้ **`!flow`** บทเดียวจบ)"
        )
    return "\n".join(lines)


def run_script(name: str, args=None) -> tuple[int, str]:
    args = args or []
    script = SCRIPTS / name
    proc = subprocess.run(
        [sys.executable, str(script)] + args,
        cwd=str(AQOND_BRAIN),
        capture_output=True,
        text=True,
        timeout=600,
        errors="replace",
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    return proc.returncode, out[-1500:] if len(out) > 1500 else out


def cmd_navy(topic: str) -> str:
    args = topic.split() if topic else []
    code, tail = run_script("navy_spy.py", args if args else None)
    if code != 0:
        return f"⚠️ Navy จบด้วย code {code}\n```{tail[-800:]}```"
    return f"✅ Navy รันรอบสืบข่าวแล้ว (หัวข้อเพิ่ม: `{topic or '—'}`) — ดูสรุปที่ #navy-intel และ spy_report.json"


def cmd_minnie(text: str) -> str:
    if not text.strip():
        return "❌ ใส่หัวข้อหรือดราฟต์หลัง !minnie"
    MINNIE_DRAFTS.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    task = {
        "trigger": "discord_commander",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "action": "draft_content",
        "topic_or_brief": text.strip(),
        "message": "เจ้านายสั่งจาก #commander — โปรดเขียนบทความ/แคปชั่นตามหัวข้อนี้",
    }
    path = MINNIE_DRAFTS / f"discord_order_{ts}.json"
    path.write_text(json.dumps(task, ensure_ascii=False, indent=2), encoding="utf-8")
    env = load_dotenv_simple()
    wh = env.get("DISCORD_WEBHOOK_MINNIE", "")
    if wh:
        _webhook_post(
            wh,
            f"🔔 **[Commander] งานใหม่ถึงมินนี่**\nหัวข้อ: {text.strip()[:500]}\nไฟล์: `pipeline/minnie_drafts/{path.name}`",
        )
    return (
        f"✅ สร้าง**ใบสั่งงาน**: `{path.name}`\n"
        f"_(นี่คือคำสั่งให้มินนี่ไปเขียน — **ยังไม่ใช่บทโพสต์**)_\n"
        f"ถ้ามีบทพร้อมแล้ว พิมพ์ **`!draft `** ตามด้วยข้อความโพสต์เต็ม หรือวางไฟล์ `.md` ในโฟลเดอร์ แล้ว **`!pinky`**"
    )


def _post_grok_prompt_from_brief(brief_path: Path) -> bool:
    """ส่งเนื้อ video_brief ไป Discord (pinky_hq) แบบ orchestrator — ไม่ต้องรอ orchestrator"""
    try:
        raw = brief_path.read_text(encoding="utf-8", errors="replace").strip()
        if not raw:
            return False
        if len(raw) > 1800:
            raw = raw[:1800] + "\n… (ตัด)"
        msg = (
            "**🎬 [FLOW] Prompt Grok — ก๊อปไปวางใน Grok ได้เลย**\n"
            "โยนวิดีโอลง `pipeline/rocky/raw_assets` หลังได้ไฟล์\n\n"
            "```\n" + raw + "\n```"
        )
        env = load_dotenv_simple()
        url = (env.get("DISCORD_WEBHOOK_PINKY") or env.get("DISCORD_WEBHOOK_URL") or "").strip()
        return _webhook_post(url, msg)
    except Exception:
        return False


def cmd_flow(body: str) -> str:
    """
    พิมพ์ครั้งเดียว: บท → Pinky → ready_to_post → Rocky → Grok prompt
    (Thomas โพสต์จริงยังเป็นขั้นตอน Backend แยก)
    """
    body = (body or "").strip()
    if len(body) < 20:
        return (
            "❌ พิมพ์ **`!flow `** (หรือ **`!go `**) ตามด้วย**บทโพสต์เต็ม**\n"
            "ระบบจะทำให้เอง: บันทึก → ตรวจ Pinky → ส่ง Rocky → ยิง Prompt Grok\n"
            "_(จำกัดความยาวต่อข้อความ Discord ~2000 ตัวอักษร — บทยาวให้ใส่ไฟล์ .md แล้วใช้ workflow เดิม)_"
        )
    MINNIE_DRAFTS.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    fn = f"user_draft_{ts}.md"
    path = MINNIE_DRAFTS / fn
    path.write_text(body, encoding="utf-8")

    code, tail = run_script("pinky_manager.py")
    if not (READY_TO_POST / fn).is_file():
        return (
            f"❌ **หยุดที่ Pinky** — ไม่เข้า ready_to_post\n"
            f"แก้บทหรือลดคำหยาบ/คำกล่าวอ้างเท็จในเนื้อ แล้วลอง `!flow` ใหม่\n"
            f"`{fn}` ยังอยู่ minnie_drafts\n```{tail[-350:]}```"
        )

    rocky_msg = cmd_rocky(fn)
    briefs = sorted(
        ROCKY_DIR.glob("video_brief_commander_*.md"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    grok_ok = False
    if briefs:
        grok_ok = _post_grok_prompt_from_brief(briefs[0])

    lines = [
        "✅ **`!flow` — ไหลครบในคำสั่งเดียว**",
        f"1. บันทึก → `{fn}`",
        f"2. Pinky → `ready_to_post/{fn}`",
        f"3. Rocky → `{briefs[0].name if briefs else '—'}`",
        f"4. Prompt Grok → {'ส่งแล้ว (#pinky-hq)' if grok_ok else 'ส่งไม่ได้ (เช็ก DISCORD_WEBHOOK_PINKY)'}",
        "",
        "_Thomas โพสต์จริง = รับจาก ready_to_post ฝั่งแอป/Backend_",
        "",
        rocky_msg[:1200] if len(rocky_msg) > 1200 else rocky_msg,
    ]
    return "\n".join(lines)


def cmd_draft(body: str) -> str:
    """บันทึกบทโพสต์จริงจาก Discord (สูงสุด ~1900 ตัวอักษรต่อข้อความ)"""
    body = (body or "").strip()
    if len(body) < 20:
        return (
            "❌ ใส่**บทโพสต์จริง**หลัง `!draft` (อย่างน้อย ~20 ตัวอักษร)\n"
            "ตัวอย่าง: `!draft หางานฟรีแลนซ์วันนี้! ฮุก: ...`"
        )
    if len(body) > 12000:
        body = body[:12000] + "\n…(ตัดให้พอดี)"
    MINNIE_DRAFTS.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = MINNIE_DRAFTS / f"user_draft_{ts}.md"
    path.write_text(body, encoding="utf-8")
    env = load_dotenv_simple()
    wh = env.get("DISCORD_WEBHOOK_MINNIE", "")
    if wh:
        _webhook_post(
            wh,
            f"✍️ **[Commander] มีบทโพสต์จริงแล้ว**\nไฟล์: `pipeline/minnie_drafts/{path.name}` ({len(body)} ตัวอักษร)\nรัน **!pinky** เพื่อส่งตรวจ",
        )
    return (
        f"✅ บันทึก**บทโพสต์จริง**: `{path.name}` ({len(body)} ตัวอักษร)\n"
        f"รัน **`!pinky`** — ถ้าผ่านเกณฑ์จะเข้า `ready_to_post`"
    )


def _read_draft_body(path: Path) -> str:
    if path.suffix == ".json":
        try:
            d = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(d, dict):
                for k in ("content", "body", "caption", "script", "brief"):
                    v = d.get(k)
                    if v and str(v).strip():
                        return str(v).strip()
                return json.dumps(d, ensure_ascii=False, indent=2)
        except (json.JSONDecodeError, OSError):
            pass
    return path.read_text(encoding="utf-8", errors="replace").strip()


def _pick_source_for_rocky(filename_arg: str) -> Path | None:
    """เลือกไฟล์บทจาก minnie_drafts หรือ ready_to_post"""
    if filename_arg:
        for base in (MINNIE_DRAFTS, READY_TO_POST):
            p = base / filename_arg
            if p.is_file():
                return p
        return None

    candidates: list[tuple[float, Path]] = []
    for folder in (READY_TO_POST, MINNIE_DRAFTS):
        if not folder.is_dir():
            continue
        for f in folder.iterdir():
            if not f.is_file() or f.suffix not in (".md", ".txt", ".json"):
                continue
            if any(f.name.startswith(p) for p in _TASK_PREFIXES):
                continue
            try:
                candidates.append((f.stat().st_mtime, f))
            except OSError:
                pass
    if not candidates:
        return None
    return max(candidates, key=lambda x: x[0])[1]


def cmd_rocky(filename_arg: str) -> str:
    """
    ส่งต่อจากมินนี่ → สร้าง video_brief ใน pipeline/rocky + handoff ใน pipeline/minnie
    """
    src = _pick_source_for_rocky(filename_arg.strip())
    if not src:
        if filename_arg.strip():
            return f"❌ ไม่พบไฟล์ `{filename_arg}` ใน minnie_drafts หรือ ready_to_post"
        return (
            "❌ ไม่มี draft ให้ส่งต่อ — ให้มินนี่สร้างไฟล์ .md / .txt / .json (มี content) ใน minnie_drafts "
            "หรือให้ Pinky ผ่านเกณฑ์แล้วมีไฟล์ใน ready_to_post ก่อน แล้วค่อย `!rocky`"
        )
    body = _read_draft_body(src)
    if len(body) < 15:
        return f"❌ เนื้อใน `{src.name}` สั้นเกินไป — ใส่บทเต็มสำหรับวิดีโอ/โปรดักชันก่อน"

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    ROCKY_DIR.mkdir(parents=True, exist_ok=True)
    MINNIE_PIPELINE.mkdir(parents=True, exist_ok=True)

    brief = (
        f"# Video Brief (ส่งต่อจากมินนี่ → Rocky)\n\n"
        f"**แหล่งบท:** `{src.relative_to(PIPELINE).as_posix()}`\n\n"
        f"## บท / แนวสำหรับ Grok & ตัดต่อ\n\n{body}\n\n"
        f"---\n"
        f"- Rocky: ใช้บทนี้สร้างวิดีโอ (Grok) แล้วโยนไฟล์ใน `pipeline/rocky/raw_assets/`\n"
        f"- รัน `rocky_edit.py` เมื่อมี raw video\n"
    )
    out_brief = ROCKY_DIR / f"video_brief_commander_{ts}.md"
    out_brief.write_text(brief, encoding="utf-8")

    handoff = MINNIE_PIPELINE / f"handoff_to_rocky_{ts}.json"
    handoff.write_text(
        json.dumps(
            {
                "created_at": datetime.now(timezone.utc).isoformat(),
                "source_file": src.name,
                "video_brief": out_brief.name,
                "action": "rocky_produce_video",
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    env = load_dotenv_simple()
    wh = env.get("DISCORD_WEBHOOK_ROCKY", "")
    if wh:
        _webhook_post(
            wh,
            f"🎬 **[Commander] มินนี่ → Rocky**\nบทจาก: `{src.name}`\nBrief: `pipeline/rocky/{out_brief.name}`\n"
            f"Handoff: `pipeline/minnie/{handoff.name}`\nถ้ารัน **orchestrator** อยู่ จะ **เจน .mp4** ลง `output/final_videos/` อัตโนมัติ (ดู dashboard)",
        )

    return (
        f"✅ **ส่งต่อ Rocky แล้ว**\n"
        f"- บทจาก: `{src.name}`\n"
        f"- `pipeline/rocky/{out_brief.name}`\n"
        f"- `pipeline/minnie/{handoff.name}` (ให้ orchestrator สะกิด workflow)\n"
        f"_ถ้า orchestrator รันอยู่ → ได้ไฟล์วิดีโอ + เปิด `python scripts/serve_video_dashboard.py`_"
    )


def cmd_pinky() -> str:
    code, tail = run_script("pinky_manager.py")
    summ = pipeline_summary()
    n_ready = _count_ready_to_post()
    if code != 0:
        return f"⚠️ Pinky code {code}\n**สรุป pipeline:**\n{summ}\n```{tail[-600:]}```"
    if n_ready > 0:
        footer = (
            f"**ต่อจากนี้:** โพสต์จาก `ready_to_post` ผ่าน Thomas — หรือ **`!rocky`** → video_brief → เจน .mp4 (ต้องมี FFmpeg)"
        )
    else:
        footer = "**ต่อจากนี้:** ใส่บทด้วย `!flow บท...` หรือ `!draft` แล้ว `!pinky` อีกครั้ง"
    return f"✅ Pinky รันรอบตรวจแล้ว\n**สรุป:**\n{summ}\n\n{footer}"


def cmd_all_start() -> str:
    units = os.environ.get("AQOND_SYSTEMD_UNITS", "").strip()
    if units:
        errs = []
        for u in units.split():
            u = u.strip()
            if not u:
                continue
            try:
                r = subprocess.run(
                    ["systemctl", "start", u],
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                if r.returncode != 0:
                    errs.append(f"{u}: {r.stderr or r.stdout}")
            except FileNotFoundError:
                return "❌ ไม่พบคำสั่ง systemctl — ใช้บน Debian/Linux หรือตั้งค่า spawn แทน"
            except Exception as e:
                errs.append(f"{u}: {e}")
        if errs:
            return "⚠️ บางยูนิตสตาร์ทไม่สำเร็จ:\n" + "\n".join(errs[:5])
        return f"✅ systemctl start แล้ว: `{units}`"

    # fallback: spawn orchestrator + pinky_watch (กันซ้ำด้วย pid ง่ายๆ)
    state = {}
    if LOOP_STATE.exists():
        try:
            state = json.loads(LOOP_STATE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass

    started = []
    for key, script in [("orchestrator", "orchestrator.py"), ("pinky_watch", "pinky_watch.py")]:
        pid = state.get(key)
        if pid:
            try:
                os.kill(int(pid), 0)
                started.append(f"{key}: รันอยู่แล้ว (pid {pid})")
                continue
            except (OSError, ValueError):
                pass
        proc = subprocess.Popen(
            [sys.executable, str(SCRIPTS / script)],
            cwd=str(AQOND_BRAIN),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        state[key] = proc.pid
        started.append(f"{key}: pid {proc.pid}")
    LOOP_STATE.parent.mkdir(parents=True, exist_ok=True)
    LOOP_STATE.write_text(json.dumps(state, indent=2), encoding="utf-8")
    return (
        "✅ เริ่ม loop (โหมด spawn):\n"
        + "\n".join(started)
        + "\n_(production: ใช้ systemd + `AQOND_SYSTEMD_UNITS` แทนการ spawn)_"
    )


_DEFAULT_NAME_SUBSTR = (
    "navy-intel,pinky-hq,general,commander,minnie-content,rocky-studio,bill-system,thomas-page"
)


def _listen_config(env: dict) -> tuple[set[str], set[str], list[str]]:
    """
    คืน (channel_ids, exact_names, name_substrings)
    ตัวเลขยาว (snowflake) ใน SUBSTR หรือ CHANNEL_ID = จับตาม Channel ID จริง — ไม่ใช่ substring ในชื่อห้อง
    """
    ids: set[str] = set()
    for x in (env.get("DISCORD_COMMANDER_CHANNEL_ID") or "").split(","):
        x = x.strip()
        if x:
            ids.add(x)
    raw_sub = (env.get("DISCORD_COMMANDER_CHANNEL_SUBSTR") or "").strip()
    substrs: list[str] = []
    if raw_sub:
        for x in raw_sub.split(","):
            x = x.strip()
            if not x:
                continue
            if x.isdigit() and len(x) >= 15:
                ids.add(x)
            else:
                substrs.append(x.lower())
    else:
        substrs = [s.strip().lower() for s in _DEFAULT_NAME_SUBSTR.split(",") if s.strip()]
    names = {
        x.strip().lower()
        for x in (env.get("DISCORD_COMMANDER_CHANNEL_NAMES") or "commander,general").split(",")
        if x.strip()
    }
    return ids, names, substrs


def _should_handle_message(message: discord.Message, env: dict) -> bool:
    ids, names, substrs = _listen_config(env)
    guild_id_str = (env.get("DISCORD_COMMANDER_GUILD_ID") or "").strip()
    if guild_id_str and message.guild and str(message.guild.id) != guild_id_str:
        return False
    cid = str(message.channel.id)
    if cid in ids:
        return True
    ch_name = (getattr(message.channel, "name", "") or "").lower()
    if ch_name in names:
        return True
    return any(s in ch_name for s in substrs)


async def main_async():
    env = {**os.environ, **load_dotenv_simple()}
    token = (env.get("DISCORD_BOT_TOKEN") or "").strip()

    if not token:
        print("ต้องมี DISCORD_BOT_TOKEN ใน .env", file=sys.stderr)
        sys.exit(1)

    intents = discord.Intents.default()
    intents.guilds = True
    intents.messages = True
    intents.message_content = True

    client = discord.Client(intents=intents)

    @client.event
    async def on_ready():
        print(f"Commander online: {client.user}", flush=True)
        ids, names, substrs = _listen_config(env)
        if ids:
            print(f"  By channel ID: {len(ids)} room(s)", flush=True)
        if names:
            print(f"  Exact name: {', '.join(sorted(names))}", flush=True)
        if substrs:
            print(f"  Name contains: {', '.join(substrs[:10])}{'...' if len(substrs) > 10 else ''}", flush=True)

    @client.event
    async def on_message(message: discord.Message):
        if message.author.bot:
            return
        if not _should_handle_message(message, env):
            return

        content = (message.content or "").strip()
        if not content.startswith("!"):
            return

        parts = content.split(None, 1)
        cmd = parts[0].lower()
        arg = parts[1].strip() if len(parts) > 1 else ""

        try:
            if cmd == "!navy":
                reply = await asyncio.to_thread(cmd_navy, arg)
            elif cmd == "!minnie":
                reply = await asyncio.to_thread(cmd_minnie, arg)
            elif cmd == "!draft":
                reply = await asyncio.to_thread(cmd_draft, arg)
            elif cmd in ("!flow", "!go"):
                reply = await asyncio.to_thread(cmd_flow, arg)
            elif cmd == "!rocky":
                reply = await asyncio.to_thread(cmd_rocky, arg)
            elif cmd in ("!pinky", "!pinky-hq"):
                reply = await asyncio.to_thread(cmd_pinky)
            elif cmd == "!all":
                if arg.lower().startswith("start"):
                    reply = await asyncio.to_thread(cmd_all_start)
                else:
                    reply = "ใช้: `!all start`"
            else:
                return
            await message.channel.send(reply[:2000])
        except Exception as e:
            await message.channel.send(f"❌ Error: {e}"[:2000])

    await client.start(token)


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
