import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync } from 'fs';
import { randomUUID } from 'crypto';

function ffmpegAvailable() {
  const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  return probe.status === 0;
}

export function createFfmpegAdapter() {
  const hasFfmpeg = ffmpegAvailable();

  return {
    hasFfmpeg,
    render({ input, template, captions, motion, intro, outro, thumbnail }) {
      const jobId = randomUUID();
      const outputPath = join(tmpdir(), `aivos_render_${jobId}.mp4`);
      if (hasFfmpeg && input) {
        // Minimal transcode to prove ffmpeg path; ignore template/captions for now
        const args = ['-y', '-i', input, '-t', '1', '-vf', 'scale=640:360', outputPath];
        const run = spawnSync('ffmpeg', args, { stdio: 'ignore' });
        if (run.status !== 0) {
          const err = new Error('ffmpeg_render_failed');
          err.code = 'FFMPEG_RENDER_FAILED';
          throw err;
        }
      } else {
        // stub: write tiny file placeholder
        writeFileSync(outputPath, 'stub video');
      }
      const thumbPath = thumbnail?.path || join(tmpdir(), `aivos_thumb_${jobId}.jpg`);
      writeFileSync(thumbPath, 'stub thumbnail');
      return {
        uri: outputPath,
        thumbnail: thumbPath,
        template: template || null,
        captions: !!captions,
        motion: !!motion,
        intro: !!intro,
        outro: !!outro,
      };
    },
  };
}

export default createFfmpegAdapter;
