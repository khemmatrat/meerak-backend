import { join } from 'path';
import { tmpdir } from 'os';
import { writeFileSync } from 'fs';
import { randomUUID } from 'crypto';

/**
 * Caption Engine – generates SRT subtitle files from timed segments
 * and builds ffmpeg filter args to burn captions into the video.
 */
export function createCaptionEngine(deps = {}) {
  function pad(n, len = 2) {
    return String(Math.floor(n)).padStart(len, '0');
  }

  /** Convert a float seconds value to SRT timestamp (HH:MM:SS,mmm). */
  function toSrtTimestamp(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
  }

  /**
   * Format an array of segments into an SRT string.
   * Each segment: { start: number, end: number, text: string }
   */
  function formatSrt(segments) {
    if (!Array.isArray(segments) || segments.length === 0) return '';
    return segments
      .map((seg, i) => {
        const start = toSrtTimestamp(seg.start ?? i * 3);
        const end = toSrtTimestamp(seg.end ?? (i + 1) * 3);
        return `${i + 1}\n${start} --> ${end}\n${seg.text || ''}\n`;
      })
      .join('\n');
  }

  /**
   * Generate an SRT file from caption segments.
   * Returns { srtPath, srt, count }.
   */
  function generate(segments = [], options = {}) {
    const srt = formatSrt(segments);
    const srtPath = options.path || join(tmpdir(), `aivos_captions_${randomUUID()}.srt`);
    writeFileSync(srtPath, srt);
    return { srtPath, srt, count: segments.length };
  }

  /**
   * Build ffmpeg -vf subtitles filter arg for an SRT file.
   * On Windows paths must use forward slashes and colons escaped.
   */
  function ffmpegArgs(srtPath, style = {}) {
    const normalized = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const styleStr = buildStyleStr(style);
    const filter = styleStr ? `subtitles='${normalized}':force_style='${styleStr}'` : `subtitles='${normalized}'`;
    return ['-vf', filter];
  }

  function buildStyleStr(style = {}) {
    const parts = [];
    if (style.fontSize) parts.push(`Fontsize=${style.fontSize}`);
    if (style.fontName) parts.push(`Fontname=${style.fontName}`);
    if (style.primaryColor) parts.push(`PrimaryColour=${style.primaryColor}`);
    if (style.bold) parts.push('Bold=1');
    return parts.join(',');
  }

  return { generate, ffmpegArgs, formatSrt, toSrtTimestamp };
}

export default createCaptionEngine;
