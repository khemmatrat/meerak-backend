import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildYouTubeEmbedUrl,
  createLessonPlaybackGrant,
  extractYouTubeVideoId,
  redactLessonForViewer,
  signPlaybackPayload,
  verifyPlaybackSignature,
} from '../lib/courseLessonPlayback.js';

test('extractYouTubeVideoId parses common URLs', () => {
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('buildYouTubeEmbedUrl enables js API', () => {
  const url = buildYouTubeEmbedUrl('abc123', { enableApi: true, origin: 'http://localhost:3000' });
  assert.match(url, /enablejsapi=1/);
  assert.match(url, /abc123/);
});

test('redactLessonForViewer strips videoUrl for marketplace clients', () => {
  const out = redactLessonForViewer(
    { id: '1', title: 'L', video_url: 'https://youtu.be/x', step_type: 'video', is_preview: false },
    { allowVideoUrl: false },
  );
  assert.equal(out.videoUrl, undefined);
  assert.equal(out.hasVideo, true);
});

test('playback token round-trip', () => {
  const secret = 'test-secret';
  const token = signPlaybackPayload({ lessonId: 'a', exp: '2099-01-01' }, secret);
  const parsed = verifyPlaybackSignature(token, secret);
  assert.equal(parsed.lessonId, 'a');
});

test('createLessonPlaybackGrant returns youtube provider', () => {
  const grant = createLessonPlaybackGrant(
    { id: 'l1', course_id: 'c1', video_url: 'https://www.youtube.com/watch?v=abc123XYZ01' },
    { secret: 's' },
  );
  assert.equal(grant.provider, 'youtube');
  assert.ok(grant.embedUrl);
  assert.ok(grant.playbackToken);
});
