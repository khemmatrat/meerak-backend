"""
Factory Discord Dashboard — แสดงวิดีโอที่เจนแล้วใน #factory-preview พร้อม Approve/Reject buttons
ต้องติดตั้ง: pip install discord.py
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from pathlib import Path

import discord
from discord import Intents, ButtonStyle
from discord.ui import Button, View

AQOND_BRAIN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AQOND_BRAIN / "scripts"))

from factory.production_manager import ProductionManager, ProductionState

ENV_FILE = AQOND_BRAIN / ".env"
LOGS_DIR = AQOND_BRAIN / "logs"
FINAL_DIR = AQOND_BRAIN / "output" / "final"


def _load_env() -> dict[str, str]:
    out = {}
    if not ENV_FILE.exists():
        return out
    for line in open(ENV_FILE, "r", encoding="utf-8"):
        line = line.split("#")[0].strip()
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        if v:
            out[k.strip()] = v
    return out


def setup_logging() -> logging.Logger:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_file = LOGS_DIR / "factory_discord_dashboard.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )
    return logging.getLogger("factory_dashboard")


class ApprovalView(View):
    """Approve/Reject buttons สำหรับวิดีโอแต่ละคลิป"""
    
    def __init__(self, project_id: str, pm: ProductionManager, logger: logging.Logger):
        super().__init__(timeout=None)
        self.project_id = project_id
        self.pm = pm
        self.logger = logger

    @discord.ui.button(label="✅ Approve", style=ButtonStyle.success, custom_id="approve")
    async def approve_button(self, interaction: discord.Interaction, button: Button):
        proj = self.pm.load_project(self.project_id)
        if not proj:
            await interaction.response.send_message("ไม่พบ project", ephemeral=True)
            return
        
        if proj.state != ProductionState.APPROVED:
            await interaction.response.send_message(f"State ไม่ตรง: {proj.state}", ephemeral=True)
            return

        # ย้ายวิดีโอไป output/final/ และเตรียม publish
        from shutil import copy2
        final_name = Path(proj.edited_video_path).name
        final_path = FINAL_DIR / final_name
        FINAL_DIR.mkdir(parents=True, exist_ok=True)
        copy2(proj.edited_video_path, final_path)
        
        proj.edited_video_path = str(final_path)
        self.pm.update_state(proj, ProductionState.PUBLISHING)
        
        await interaction.response.send_message(
            f"✅ **Approved!** วิดีโอย้ายไป `output/final/` แล้ว — Thomas กำลังอัปโหลด...",
            ephemeral=False
        )
        self.logger.info("[Dashboard] %s approved by %s", self.project_id, interaction.user)
        
        # Trigger Thomas publish (in background)
        asyncio.create_task(self._publish_approved(proj))

    @discord.ui.button(label="❌ Reject", style=ButtonStyle.danger, custom_id="reject")
    async def reject_button(self, interaction: discord.Interaction, button: Button):
        proj = self.pm.load_project(self.project_id)
        if not proj:
            await interaction.response.send_message("ไม่พบ project", ephemeral=True)
            return

        self.pm.update_state(proj, ProductionState.REJECTED)
        await interaction.response.send_message(
            f"❌ **Rejected** — project {self.project_id} ถูกปฏิเสธ",
            ephemeral=False
        )
        self.logger.info("[Dashboard] %s rejected by %s", self.project_id, interaction.user)

    async def _publish_approved(self, proj: ProductionProject):
        """Thomas: อัปโหลดไปหลาย platforms"""
        platforms = ["facebook", "tiktok", "instagram"]  # ปรับตาม config
        caption = proj.script_md.split("\n")[0][:200] if proj.script_md else "Aqond"
        
        success, errors = await asyncio.to_thread(
            publish_video, proj.edited_video_path, caption, platforms, self.logger
        )
        
        proj.publish_urls = success
        if errors:
            proj.error_log.extend(errors)
        
        if success:
            self.pm.update_state(proj, ProductionState.DONE)
            self.logger.info("[Dashboard] %s published: %s", proj.project_id, success)
        else:
            self.pm.update_state(proj, ProductionState.FAILED)
            self.logger.error("[Dashboard] %s publish failed: %s", proj.project_id, errors)


class FactoryDashboardBot(discord.Client):
    def __init__(self, pm: ProductionManager, logger: logging.Logger, channel_id: int):
        intents = Intents.default()
        intents.message_content = True
        super().__init__(intents=intents)
        self.pm = pm
        self.logger = logger
        self.channel_id = channel_id
        self.posted_projects = set()

    async def on_ready(self):
        self.logger.info("[Dashboard Bot] เชื่อมต่อแล้ว: %s", self.user)
        self.bg_task = self.loop.create_task(self.monitor_approved_projects())

    async def monitor_approved_projects(self):
        """เช็ก projects ที่ APPROVED และยังไม่ post ไป Discord"""
        await self.wait_until_ready()
        channel = self.get_channel(self.channel_id)
        if not channel:
            self.logger.error("[Dashboard Bot] ไม่พบ channel ID: %d", self.channel_id)
            return

        while not self.is_closed():
            try:
                projects = self.pm.list_projects(ProductionState.APPROVED)
                for proj in projects:
                    if proj.project_id in self.posted_projects:
                        continue
                    
                    video_path = Path(proj.edited_video_path)
                    if not video_path.exists():
                        self.logger.warning("[Dashboard] ไม่พบไฟล์: %s", proj.edited_video_path)
                        continue

                    # อัปโหลดวิดีโอพร้อม Approve/Reject buttons
                    view = ApprovalView(proj.project_id, self.pm, self.logger)
                    
                    embed = discord.Embed(
                        title=f"🎬 Video Preview — {proj.project_id}",
                        description=(
                            f"**Brief:** {proj.brief[:200]}\n"
                            f"**QC:** {proj.qc_notes[:150]}\n"
                            f"**Created:** {proj.created_at}"
                        ),
                        color=0x7eb3ff,
                    )
                    
                    # Discord มี file size limit 25MB (หรือ 10MB สำหรับ free bot)
                    size_mb = video_path.stat().st_size / 1024 / 1024
                    if size_mb > 24:
                        await channel.send(
                            f"⚠️ วิดีโอ **{proj.project_id}** ใหญ่เกิน (>{size_mb:.1f}MB) — ดูที่ `{video_path}`",
                            embed=embed,
                            view=view,
                        )
                    else:
                        await channel.send(
                            embed=embed,
                            file=discord.File(str(video_path)),
                            view=view,
                        )
                    
                    self.posted_projects.add(proj.project_id)
                    self.logger.info("[Dashboard] โพสต์ %s ไป #factory-preview", proj.project_id)

            except Exception as e:
                self.logger.exception("[Dashboard] monitor error: %s", e)
            
            await asyncio.sleep(8)


def main():
    logger = setup_logging()
    env = _load_env()
    
    token = env.get("DISCORD_BOT_TOKEN", "").strip()
    if not token:
        logger.error("ไม่มี DISCORD_BOT_TOKEN ใน .env")
        sys.exit(1)

    channel_str = env.get("FACTORY_PREVIEW_CHANNEL_ID", "").strip()
    if not channel_str or not channel_str.isdigit():
        logger.error("ไม่มี FACTORY_PREVIEW_CHANNEL_ID ใน .env (ต้องเป็นตัวเลข channel ID)")
        sys.exit(1)

    channel_id = int(channel_str)
    pm = ProductionManager(logger)
    bot = FactoryDashboardBot(pm, logger, channel_id)
    
    logger.info("[Dashboard] เริ่มต้น Discord bot — channel ID: %d", channel_id)
    bot.run(token)


if __name__ == "__main__":
    main()
