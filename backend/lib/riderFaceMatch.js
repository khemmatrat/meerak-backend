/**
 * Rider face match — AWS Rekognition CompareFaces or dev stub.
 */
import { createHash } from 'crypto';
import { RekognitionClient, CompareFacesCommand } from '@aws-sdk/client-rekognition';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

function matchMode() {
  const raw = String(process.env.RIDER_FACE_MATCH_MODE || '').trim().toLowerCase();
  if (raw === 'rekognition' || raw === 'aws') return 'rekognition';
  if (raw === 'dev_stub' || raw === 'stub') return 'dev_stub';
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) return 'rekognition';
  return 'dev_stub';
}

export function riderFaceMatchThreshold() {
  const n = Number(process.env.RIDER_FACE_MATCH_THRESHOLD ?? 0.85);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.85;
}

function parseS3FromUrl(url) {
  const s = String(url || '').trim();
  const bucket = process.env.AWS_S3_BUCKET || 'aqond-uploads';
  const region = process.env.AWS_REGION || 'ap-southeast-1';

  const hostMatch = s.match(new RegExp(`^https://${bucket}\\.s3\\.${region}\\.amazonaws\\.com/(.+)$`, 'i'));
  if (hostMatch) return { bucket, key: decodeURIComponent(hostMatch[1]) };

  const pathStyle = s.match(new RegExp(`^https://s3\\.${region}\\.amazonaws\\.com/${bucket}/(.+)$`, 'i'));
  if (pathStyle) return { bucket, key: decodeURIComponent(pathStyle[1]) };

  const generic = s.match(/^https:\/\/([^.]+)\.s3[.-][^/]+\.amazonaws\.com\/(.+)$/i);
  if (generic) return { bucket: generic[1], key: decodeURIComponent(generic[2]) };

  return null;
}

async function imageBytesFromUrl(url) {
  const s3 = parseS3FromUrl(url);
  if (s3) {
    const out = await s3Client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: s3.key }));
    const chunks = [];
    for await (const chunk of out.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`portrait_fetch_failed:${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function decodeSelfieBase64(input) {
  const s = String(input || '').trim();
  const b64 = s.includes(',') ? s.split(',')[1] : s;
  if (!b64 || b64.length < 100) throw new Error('invalid_selfie');
  return Buffer.from(b64, 'base64');
}

async function compareWithRekognition(sourceBytes, targetBytes) {
  const cmd = new CompareFacesCommand({
    SourceImage: { Bytes: sourceBytes },
    TargetImage: { Bytes: targetBytes },
    SimilarityThreshold: Math.round(riderFaceMatchThreshold() * 100),
  });
  const result = await rekognitionClient.send(cmd);
  const best = (result.FaceMatches || [])
    .map((m) => Number(m.Similarity || 0) / 100)
    .sort((a, b) => b - a)[0];
  return {
    score: best ?? 0,
    mode: 'rekognition',
    unmatched: (result.UnmatchedFaces || []).length,
  };
}

function compareDevStub(sourceBytes, targetBytes, livenessPassed) {
  const h1 = createHash('sha256').update(sourceBytes).digest('hex').slice(0, 16);
  const h2 = createHash('sha256').update(targetBytes).digest('hex').slice(0, 16);
  const same = h1 === h2;
  const alwaysPass = String(process.env.RIDER_FACE_DEV_STUB_ALWAYS_PASS || '1') !== '0';
  let score = same ? 0.99 : 0.42;
  if (alwaysPass && livenessPassed) score = 0.96;
  return { score, mode: 'dev_stub', stub_same_hash: same };
}

/**
 * Compare live selfie against enrolled KYC portrait URL.
 */
export async function compareRiderFaces({ portraitUrl, selfieBase64, livenessPassed = false }) {
  if (!portraitUrl) {
    const err = new Error('no_enrollment_portrait');
    err.code = 'no_enrollment_portrait';
    throw err;
  }
  const sourceBytes = await imageBytesFromUrl(portraitUrl);
  const targetBytes = decodeSelfieBase64(selfieBase64);
  const threshold = riderFaceMatchThreshold();
  const mode = matchMode();
  const raw =
    mode === 'rekognition'
      ? await compareWithRekognition(sourceBytes, targetBytes)
      : compareDevStub(sourceBytes, targetBytes, livenessPassed);
  return {
    ...raw,
    threshold,
    passed: raw.score >= threshold,
  };
}
