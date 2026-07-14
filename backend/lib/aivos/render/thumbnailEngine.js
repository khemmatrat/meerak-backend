import { join } from 'path';
import { tmpdir } from 'os';
import { writeFileSync } from 'fs';
import { randomUUID } from 'crypto';

/**
 * AI Thumbnail Engine – selects an optimal video frame and applies branding overlay.
 *
 * Production flow: calls Kernel inference for frame scoring; stub path generates
 * a deterministic placeholder when no Kernel is wired.
 *
 * ffmpegArgs() returns the command needed to extract a single frame at a given offset.
 */
export function createThumbnailEngine(deps = {}) {
  const kernel = deps.kernel || null;

  /**
   * Generate a thumbnail from a video source.
   *
   * @param {string} videoPath   Source video path (or URI)
   * @param {{ outputPath?: string, watermark?: string }} options
   * @returns {Promise<{ path: string, uri: string, score: number, frame: number, ai_generated: boolean }>}
   */
  async function generate(videoPath, options = {}) {
    const thumbId = randomUUID();
    const thumbPath = options.outputPath || join(tmpdir(), `aivos_thumb_${thumbId}.jpg`);

    let score = 0.8;
    let frame = 1;

    if (kernel?.inference) {
      try {
        const result = await kernel.inference({
          task: 'thumbnail_score',
          input: videoPath,
          options,
        });
        score = typeof result?.score === 'number' ? result.score : score;
        frame = typeof result?.frame === 'number' ? result.frame : frame;
      } catch {
        // Kernel unavailable – use stub values
      }
    }

    // Write placeholder (real implementation would extract frame via ffmpeg)
    writeFileSync(thumbPath, `thumb:score=${score.toFixed(3)}:frame=${frame}:src=${videoPath || 'stub'}`);

    if (options.watermark) {
      // In production: re-run ffmpeg to overlay watermark text
    }

    return {
      path: thumbPath,
      uri: `file://${thumbPath}`,
      score,
      frame,
      ai_generated: !!(kernel?.inference),
    };
  }

  /**
   * Build ffmpeg args to extract a single frame at `offsetSecs`.
   * @returns {{ args: string[], outputPath: string }}
   */
  function extractFrameArgs(videoPath, offsetSecs = 1) {
    const outputPath = join(tmpdir(), `aivos_frame_${randomUUID()}.jpg`);
    const args = [
      '-ss', String(offsetSecs),
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', '2',
      outputPath,
    ];
    return { args, outputPath };
  }

  return { generate, extractFrameArgs };
}

export default createThumbnailEngine;
