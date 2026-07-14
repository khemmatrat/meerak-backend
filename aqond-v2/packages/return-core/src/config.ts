import defaultConfig from '../config/return-config.default.json';
import type { ReturnConfig, ResolutionCapabilityId } from './types';

export type ReturnConfigSource = 'default_json' | 'env_json' | 'env_path' | 'local_dev_file';

export type LoadedReturnConfig = {
  config: ReturnConfig;
  source: ReturnConfigSource;
  path?: string;
};

export type ReturnConfigLoadOptions = {
  envJson?: string;
  envPath?: string;
  localDevPath?: string;
  localDev?: boolean;
  readFile?: (path: string) => string;
  exists?: (path: string) => boolean;
};

export class ReturnConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReturnConfigError';
  }
}

export function validateReturnConfig(raw: unknown): ReturnConfig {
  if (!raw || typeof raw !== 'object') {
    throw new ReturnConfigError('config must be an object');
  }
  const cfg = raw as Record<string, unknown>;
  if (cfg.schema_version !== 1) {
    throw new ReturnConfigError('schema_version must be 1');
  }
  if (cfg.mission_id !== 'RETURN-REFUND-CORE') {
    throw new ReturnConfigError('mission_id must be RETURN-REFUND-CORE');
  }
  const policy = cfg.auto_refund_policy as { enabled?: boolean; rules?: unknown[] } | undefined;
  if (!policy || typeof policy.enabled !== 'boolean' || !Array.isArray(policy.rules)) {
    throw new ReturnConfigError('auto_refund_policy invalid');
  }
  if (!cfg.capabilities || typeof cfg.capabilities !== 'object') {
    throw new ReturnConfigError('capabilities required');
  }
  if (!Array.isArray(cfg.order_tabs) || cfg.order_tabs.length === 0) {
    throw new ReturnConfigError('order_tabs required');
  }
  if ((cfg.escrow as { rewrite_allowed?: boolean })?.rewrite_allowed === true) {
    throw new ReturnConfigError('escrow rewrite not allowed in Phase 0');
  }
  return cfg as unknown as ReturnConfig;
}

export function loadReturnConfig(raw?: unknown): ReturnConfig {
  return validateReturnConfig(raw ?? defaultConfig);
}

export function loadReturnConfigFromObject(
  raw: unknown,
  source: ReturnConfigSource = 'default_json',
): LoadedReturnConfig {
  return { config: validateReturnConfig(raw), source };
}

export function loadReturnConfigWithOptions(options: ReturnConfigLoadOptions = {}): LoadedReturnConfig {
  const { readFile, exists } = options;

  if (options.envJson) {
    return loadReturnConfigFromObject(JSON.parse(options.envJson), 'env_json');
  }

  if (options.envPath && readFile && exists?.(options.envPath)) {
    return {
      config: validateReturnConfig(JSON.parse(readFile(options.envPath))),
      source: 'env_path',
      path: options.envPath,
    };
  }

  if (options.localDev && options.localDevPath && readFile && exists?.(options.localDevPath)) {
    return {
      config: validateReturnConfig(JSON.parse(readFile(options.localDevPath))),
      source: 'local_dev_file',
      path: options.localDevPath,
    };
  }

  return loadReturnConfigFromObject(defaultConfig, 'default_json');
}

export function listEnabledCapabilities(config: ReturnConfig) {
  return (Object.entries(config.capabilities) as [ResolutionCapabilityId, { enabled: boolean; phase: number }][])
    .filter(([, row]) => row.enabled)
    .map(([id, row]) => ({ id, enabled: row.enabled, phase: row.phase }));
}
