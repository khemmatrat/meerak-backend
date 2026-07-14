import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isVideoGenEnabled,
  isGrokVideoEnabled,
  isFeatureEnabled,
  merchantAdAspectRatio,
} from '../../../config.js';
import { hasGrokCredentials } from '../../../ugcVideoBridge.js';
import { AD_FORMATS } from '../../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAPABILITIES_FILE = path.join(__dirname, '..', '..', 'data', 'provider-capabilities.json');

let cache = null;

function loadCapabilities() {
  if (!cache) {
    cache = JSON.parse(fs.readFileSync(CAPABILITIES_FILE, 'utf8'));
  }
  return cache;
}

export function resetCapabilityCache() {
  cache = null;
}

export function getProviderCapability(providerId) {
  const config = loadCapabilities();
  return config.providers[providerId] || config.providers.generic;
}

export function resolveUgcBackendProvider(videoProviderId) {
  const config = loadCapabilities();
  return config.ugc_provider_map[videoProviderId] || 'grok';
}

function isProviderRuntimeReady(providerId) {
  if (providerId === 'grok') {
    if (process.env.AIVOS_MERCHANT_AD_MOCK_UGC === '1' || process.env.AIVOS_MERCHANT_AD_MOCK_GROK === '1') {
      return true;
    }
    return isGrokVideoEnabled() && hasGrokCredentials();
  }
  const caps = getProviderCapability(providerId);
  return Boolean(caps.ready);
}

/**
 * @param {string} providerId — grok | veo | runway | kling
 * @param {import('../types.js').AdFormat} format
 * @param {{ request?: object, plan?: object, aspect_ratio?: string, language?: string }} context
 */
export function checkProviderCapabilities(providerId, format, context = {}) {
  const caps = getProviderCapability(providerId);
  const checks = [];
  const aspect = context.aspect_ratio || merchantAdAspectRatio();
  const language = context.language || context.plan?.prompt?.dimensions?.language || 'th';
  const runtimeReady = isProviderRuntimeReady(providerId);

  checks.push({
    id: 'runtime_ready',
    label: 'Provider runtime available',
    passed: runtimeReady,
    message: runtimeReady ? 'ok' : `Provider ${providerId} is not configured`,
  });

  if (format === AD_FORMATS.UGC) {
    checks.push({
      id: 'lip_sync',
      label: 'Lip sync support',
      passed: Boolean(caps.lip_sync),
      message: caps.lip_sync ? 'supported' : 'not supported by provider',
    });
    checks.push({
      id: 'duration_10s',
      label: '10 second clip support',
      passed: (caps.max_duration_sec || 0) >= 10,
      message: `max ${caps.max_duration_sec}s`,
    });
  }

  checks.push({
    id: 'aspect_ratio',
    label: 'Aspect ratio support',
    passed: (caps.aspect_ratios || []).includes(aspect),
    message: aspect,
  });

  checks.push({
    id: 'language',
    label: 'Language support',
    passed: (caps.languages || []).includes(language),
    message: language,
  });

  if (caps.requires_video_gen_flag) {
    const flagOk = isVideoGenEnabled() && isFeatureEnabled(caps.requires_video_gen_flag);
    checks.push({
      id: 'feature_flag',
      label: caps.requires_video_gen_flag,
      passed: flagOk || runtimeReady,
      message: flagOk ? 'enabled' : 'disabled',
    });
  }

  const ok = checks.every((c) => c.passed);
  return {
    ok,
    provider_id: providerId,
    format,
    capabilities: caps,
    checks,
    runtime_ready: runtimeReady,
  };
}

export function listProviderCapabilities() {
  const config = loadCapabilities();
  return Object.entries(config.providers).map(([id, caps]) => ({
    id,
    ...caps,
    runtime_ready: isProviderRuntimeReady(id),
  }));
}
