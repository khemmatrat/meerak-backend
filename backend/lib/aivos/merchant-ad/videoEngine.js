import fs from 'fs/promises';

import path from 'path';

import { spawnSync } from 'child_process';

import { isVideoGenEnabled } from './config.js';

import { generateShotImages } from './imageEngine.js';

import { publicFilePath, saveJob, getJob } from './merchantAdStorage.js';

import {

  generateShotClipViaGrok,

  hasGrokCredentials,

  shouldUseGrokForShot,

} from './grokVideoBridge.js';



const OUT_W = 1080;

const OUT_H = 1920;



function ffmpegOk() {

  return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

}



function verticalFilter() {

  return `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease,pad=${OUT_W}:${OUT_H}:(ow-iw)/2:(oh-ih)/2`;

}



function renderKenBurnsSegment(imagePath, durSec, outPath) {

  const dur = durSec || 2.5;

  const vf = `${verticalFilter()},zoompan=z='min(zoom+0.0015,1.15)':d=${Math.ceil(dur * 25)}:s=${OUT_W}x${OUT_H}:fps=25`;

  const run = spawnSync(

    'ffmpeg',

    ['-y', '-loop', '1', '-i', imagePath, '-vf', vf, '-t', String(dur), '-pix_fmt', 'yuv420p', outPath],

    { stdio: 'ignore' },

  );

  return run.status === 0;

}



function normalizeVerticalClip(inPath, outPath, durSec) {

  const dur = durSec || 2.5;

  const vf = verticalFilter();

  const run = spawnSync(

    'ffmpeg',

    ['-y', '-i', inPath, '-vf', vf, '-t', String(dur), '-pix_fmt', 'yuv420p', '-an', outPath],

    { stdio: 'ignore' },

  );

  return run.status === 0;

}



function concatSegments(segmentPaths, outPath, listFile) {

  const concatBody = segmentPaths.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n');

  return fs.writeFile(listFile, concatBody, 'utf8').then(() => {

    const mux = spawnSync(

      'ffmpeg',

      ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outPath],

      { stdio: 'ignore' },

    );

    return mux.status === 0;

  });

}



function buildShotPrompt(shot) {

  const parts = [shot.video_prompt, shot.image_prompt].filter(Boolean);

  return parts.join('. ').slice(0, 2000);

}



async function renderOneShot({ job, shotIndex, shot, imagePath, outPath, totalShots }) {

  const dur = shot?.duration_sec || 2.5;

  const useGrok = shouldUseGrokForShot(shotIndex);

  const total = totalShots || job.brief?.shots?.length || 1;



  if (useGrok) {

    job.current_shot = shotIndex + 1;

    job.stage = `grok_wait_${shotIndex + 1}`;

    job.progress_pct = Math.min(84, 5 + Math.round((shotIndex / total) * 75));

    await saveJob(job);



    const grokRaw = path.join(path.dirname(outPath), `grok_raw_${String(shotIndex).padStart(2, '0')}.mp4`);

    let grokHeartbeat = null;

    grokHeartbeat = setInterval(() => {

      void (async () => {

        const cur = await getJob(job.id);

        if (!cur || cur.status !== 'generating') return;

        cur.progress_pct = Math.min(84, (cur.progress_pct || 5) + 1);

        cur.stage = `grok_shot_${shotIndex + 1}`;

        await saveJob(cur);

        job.progress_pct = cur.progress_pct;

      })();

    }, 20000);



    let grokPath = null;

    try {

      grokPath = await generateShotClipViaGrok({

        prompt: buildShotPrompt(shot),

        imagePath,

        durationSec: dur,

        outPath: grokRaw,

      });

    } finally {

      if (grokHeartbeat) clearInterval(grokHeartbeat);

    }



    if (grokPath && normalizeVerticalClip(grokPath, outPath, dur)) {

      return 'grok';

    }

  }



  if (!renderKenBurnsSegment(imagePath, dur, outPath)) {

    throw new Error(`shot_${shotIndex}_render_failed`);

  }

  return 'kenburns';

}



/**

 * Sprint 4 — per-shot Grok i2v (first N shots) + Ken Burns fallback, then ffmpeg concat.

 */

async function renderPerShotVideo(job, imagePaths, outPath) {

  if (!isVideoGenEnabled() || !ffmpegOk() || !imagePaths.length) {

    throw new Error('video_gen_unavailable');

  }



  const dir = path.dirname(outPath);

  const listFile = path.join(dir, 'concat.txt');

  const segmentPaths = [];

  const engines = [];



  for (let i = 0; i < imagePaths.length; i++) {

    const shot = job.brief.shots[i] || {};

    const seg = path.join(dir, `seg_${String(i).padStart(2, '0')}.mp4`);

    const engine = await renderOneShot({

      job,

      shotIndex: i,

      shot,

      imagePath: imagePaths[i],

      outPath: seg,

      totalShots: imagePaths.length,

    });

    engines.push(engine);

    segmentPaths.push(seg);

    job.shot_engines = engines;

    job.progress_pct = Math.min(97, 85 + Math.round(((i + 1) / imagePaths.length) * 12));

    await saveJob(job);

  }



  if (!segmentPaths.length) throw new Error('ffmpeg_segments_failed');



  job.progress_pct = 96;

  job.stage = 'concat';

  await saveJob(job);



  const ok = await concatSegments(segmentPaths, outPath, listFile);

  if (!ok) throw new Error('ffmpeg_concat_failed');



  const grokCount = engines.filter((e) => e === 'grok').length;

  const kbCount = engines.filter((e) => e === 'kenburns').length;

  if (grokCount > 0 && kbCount > 0) return 'grok+kenburns';

  if (grokCount > 0) return 'grok';

  return 'kenburns';

}



export async function runMerchantAdPipeline(job, outDir) {

  job.status = 'generating';

  job.progress_pct = 5;

  await saveJob(job);



  const imagePaths = await generateShotImages(job, outDir);

  await saveJob(job);



  const videoPath = path.join(outDir, 'output.mp4');

  try {

    job.video_engine = hasGrokCredentials() ? 'grok+kenburns' : 'kenburns';

    const engine = await renderPerShotVideo(job, imagePaths, videoPath);

    job.video_engine = engine;

    job.output_video_url = publicFilePath(job.id, 'output.mp4');

    job.output_poster_url = publicFilePath(job.id, 'shot_01.jpg');

    job.status = 'completed';

    job.progress_pct = 100;

    job.completed_at = new Date().toISOString();

    delete job.current_shot;

  } catch (e) {

    job.status = 'failed';

    job.error = e instanceof Error ? e.message : 'render_failed';

  }



  await saveJob(job);

  return job;

}

