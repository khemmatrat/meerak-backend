/** Strip embedded upload metadata from video description (mobile PostCreate format). */
const VIDEO_META_BLOCK_RE = /\s*\[meta\][\s\S]*?(?:\[\/meta\]|$)/gi;

export function displayVideoDescription(description?: string | null): string {
  if (!description) return '';
  return description.replace(VIDEO_META_BLOCK_RE, '').replace(/\r\n/g, '\n').trim();
}
