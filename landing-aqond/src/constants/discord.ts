/** Discord server (guild) id — AQOND Community Center (ไม่ใช่ลิงก์เชิญ) */
export const AQOND_DISCORD_COMMUNITY_CENTER_GUILD_ID =
  "1492015445363003516" as const;

function resolveGuildId(): string {
  const fromEnv = import.meta.env.VITE_DISCORD_GUILD_ID;
  if (typeof fromEnv === "string" && /^\d{17,20}$/.test(fromEnv.trim())) {
    return fromEnv.trim();
  }
  return AQOND_DISCORD_COMMUNITY_CENTER_GUILD_ID;
}

/** แปลง discord.com/invite/xxx → discord.gg/xxx */
function normalizeInviteUrl(raw: string): string {
  const s = raw.trim();
  const m = s.match(/discord\.com\/invite\/([a-zA-Z0-9-]+)/i);
  if (m) return `https://discord.gg/${m[1]}`;
  return s;
}

/**
 * ลิงก์เข้า Discord Community Center
 * - ถ้ามี `VITE_DISCORD_INVITE_URL` (ลิงก์เชิญถาวรจาก Discord) ใช้ลิงก์นั้น
 * - ถ้าไม่มี ใช้หน้า widget (ต้องเปิด Server Widget ใน Discord)
 */
export function getAqondDiscordCommunityHref(): string {
  const invite = import.meta.env.VITE_DISCORD_INVITE_URL;
  if (typeof invite === "string" && invite.trim()) {
    return normalizeInviteUrl(invite);
  }
  const guildId = resolveGuildId();
  return `https://discord.com/widget?id=${guildId}&theme=dark`;
}
