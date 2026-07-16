/**
 * Rider uniform / PPE check — NON-BLOCKING.
 *
 * Runs on the SAME selfie captured for the daily face-match, but is a DIFFERENT
 * model: Rekognition CompareFaces proves identity; this uses
 * DetectProtectiveEquipment (helmet = HEAD_COVER) + DetectLabels (uniform hints).
 *
 * Policy (approved): never hard-block go-online. Only raise a flag for manual
 * review when we are highly confident (> RIDER_UNIFORM_FLAG_CONFIDENCE, default
 * 0.9) that a required item is MISSING. False negatives must not stop a rider
 * from earning.
 */
import {
  RekognitionClient,
  DetectProtectiveEquipmentCommand,
  DetectLabelsCommand,
} from '@aws-sdk/client-rekognition';

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

function uniformMode() {
  const raw = String(process.env.RIDER_UNIFORM_CHECK_MODE || '').trim().toLowerCase();
  if (raw === 'rekognition' || raw === 'aws') return 'rekognition';
  if (raw === 'off' || raw === 'disabled') return 'off';
  if (raw === 'dev_stub' || raw === 'stub') return 'dev_stub';
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) return 'rekognition';
  return 'dev_stub';
}

export function riderUniformFlagConfidence() {
  const n = Number(process.env.RIDER_UNIFORM_FLAG_CONFIDENCE ?? 0.9);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.9;
}

/** Which PPE items are required (comma list). Default: helmet only. */
function requiredPpe() {
  const raw = process.env.RIDER_UNIFORM_REQUIRED_PPE || 'helmet';
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function decodeSelfieBase64(input) {
  const s = String(input || '').trim();
  const b64 = s.includes(',') ? s.split(',')[1] : s;
  if (!b64 || b64.length < 100) return null;
  return Buffer.from(b64, 'base64');
}

async function detectHelmet(bytes) {
  const cmd = new DetectProtectiveEquipmentCommand({
    Image: { Bytes: bytes },
    SummarizationAttributes: {
      MinConfidence: 50,
      RequiredEquipmentTypes: ['HEAD_COVER'],
    },
  });
  const out = await rekognitionClient.send(cmd);
  const persons = out.Persons || [];
  if (!persons.length) {
    // No person detected — inconclusive, do not flag.
    return { present: null, confidence: 0, persons: 0 };
  }
  // A person "has helmet" if any body part carries a HEAD_COVER item.
  let bestHelmetConf = 0;
  let anyHelmet = false;
  let personConf = 0;
  for (const p of persons) {
    personConf = Math.max(personConf, Number(p.Confidence || 0) / 100);
    for (const bp of p.BodyParts || []) {
      for (const eq of bp.EquipmentDetections || []) {
        if (eq.Type === 'HEAD_COVER') {
          anyHelmet = true;
          bestHelmetConf = Math.max(bestHelmetConf, Number(eq.Confidence || 0) / 100);
        }
      }
    }
  }
  if (anyHelmet) return { present: true, confidence: bestHelmetConf, persons: persons.length };
  // No head cover found: our confidence that it is MISSING is tied to how
  // confidently we detected the person.
  return { present: false, confidence: personConf, persons: persons.length };
}

async function detectUniformLabels(bytes) {
  try {
    const cmd = new DetectLabelsCommand({ Image: { Bytes: bytes }, MaxLabels: 25, MinConfidence: 60 });
    const out = await rekognitionClient.send(cmd);
    const labels = (out.Labels || []).map((l) => ({
      name: String(l.Name || '').toLowerCase(),
      confidence: Number(l.Confidence || 0) / 100,
    }));
    const uniformHints = ['uniform', 'jacket', 'vest', 'coat'];
    const hit = labels.find((l) => uniformHints.includes(l.name));
    return { present: !!hit, confidence: hit?.confidence || 0, labels: labels.slice(0, 10) };
  } catch {
    return { present: null, confidence: 0, labels: [] };
  }
}

/**
 * @returns {Promise<{
 *   checked: boolean, mode: string, flagged: boolean,
 *   flags: string[], helmet?: object, uniform?: object,
 * }>}
 */
export async function detectRiderUniform({ selfieBase64 }) {
  const mode = uniformMode();
  if (mode === 'off') return { checked: false, mode, flagged: false, flags: [] };

  const bytes = decodeSelfieBase64(selfieBase64);
  if (!bytes) return { checked: false, mode, flagged: false, flags: [] };

  if (mode === 'dev_stub') {
    // Dev never flags — avoids blocking local testing and mirrors face dev stub.
    return {
      checked: true,
      mode,
      flagged: false,
      flags: [],
      helmet: { present: true, confidence: 0.99, persons: 1 },
    };
  }

  const threshold = riderUniformFlagConfidence();
  const required = requiredPpe();
  const flags = [];
  const result = { checked: true, mode, flagged: false, flags };

  try {
    if (required.includes('helmet')) {
      const helmet = await detectHelmet(bytes);
      result.helmet = helmet;
      if (helmet.present === false && helmet.confidence >= threshold) {
        flags.push('helmet_missing');
      }
    }
    if (required.includes('uniform')) {
      const uniform = await detectUniformLabels(bytes);
      result.uniform = uniform;
      if (uniform.present === false && uniform.confidence >= threshold) {
        flags.push('uniform_missing');
      }
    }
  } catch (e) {
    // Detection failure must never block: return unchecked-ish, no flag.
    return { checked: false, mode, flagged: false, flags: [], error: e?.message || 'detect_failed' };
  }

  result.flagged = flags.length > 0;
  return result;
}
