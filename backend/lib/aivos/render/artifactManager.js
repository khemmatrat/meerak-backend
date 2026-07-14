import { createHash } from 'crypto';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

/**
 * Artifact Manager – content-addressed storage with SHA-256 hash, version tracking,
 * and optional S3-compatible upload.
 *
 * S3 upload activates only when AWS_S3_BUCKET + deps.s3Client are provided.
 * Otherwise artifacts are stored locally under tmpdir for test/dev environments.
 */
export function createArtifactManager(deps = {}) {
  const s3Client = deps.s3Client || null;
  const bucket = deps.bucket || process.env.AWS_S3_BUCKET || null;

  function sha256(data) {
    const buf = typeof data === 'string' ? data : Buffer.isBuffer(data) ? data : JSON.stringify(data);
    return createHash('sha256').update(buf).digest('hex');
  }

  function localPath(key, ext = 'bin') {
    const safe = key.replace(/[^a-z0-9_-]/gi, '_').slice(0, 80);
    return join(tmpdir(), `aivos_art_${safe}_${randomUUID().slice(0, 8)}.${ext}`);
  }

  /**
   * Store an artifact and return its metadata.
   * @param {string} key   Logical artifact key (e.g. "render/job-abc/video")
   * @param {string|Buffer|object} data
   * @param {{ version?: string, contentType?: string, ext?: string }} options
   */
  async function store(key, data, options = {}) {
    const version = options.version || '1.0.0';
    const rawData = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data);
    const hash = sha256(rawData);
    const ext = options.ext || (options.contentType?.includes('json') ? 'json' : 'bin');
    const filePath = options.path || localPath(key, ext);

    writeFileSync(filePath, rawData);

    let uri = `file://${filePath}`;
    let uploaded = false;

    if (s3Client && bucket) {
      const s3Key = `artifacts/${key}/${version}/${hash.slice(0, 12)}`;
      try {
        await s3Client.putObject({
          Bucket: bucket,
          Key: s3Key,
          Body: Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData),
          ContentType: options.contentType || 'application/octet-stream',
        });
        uri = `s3://${bucket}/${s3Key}`;
        uploaded = true;
      } catch {
        // fallback to local uri already set
      }
    }

    return { key, uri, hash, version, path: filePath, uploaded, size: rawData.length, created_at: new Date().toISOString() };
  }

  /**
   * Retrieve artifact metadata by key.
   * Does not download from S3; returns local path if present.
   */
  async function retrieve(key, options = {}) {
    const filePath = options.path || localPath(key, options.ext || 'bin');
    const found = existsSync(filePath);
    return { key, path: filePath, found };
  }

  return { store, retrieve, sha256 };
}

export default createArtifactManager;
