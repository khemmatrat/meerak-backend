import defaultConfigJson from '../config/delivery-config.default.json';
import type { DeliveryConfigSource, LoadedDeliveryConfig } from './types';
import { validateDeliveryConfig } from './validate';

export type DeliveryConfigLoadOptions = {
  /** Inline JSON string — highest priority (tests / ops overrides). */
  envJson?: string;
  /** Absolute or relative path to JSON file. */
  envPath?: string;
  /** Local dev override path (e.g. storefront .data/dev/delivery-config.json). */
  localDevPath?: string;
  /** When true, attempt localDevPath before bundled default. */
  localDev?: boolean;
  /** Node fs.readFileSync — injected by server adapter. */
  readFile?: (path: string) => string;
  /** Node fs.existsSync — injected by server adapter. */
  exists?: (path: string) => boolean;
};

function parseConfig(raw: string, source: DeliveryConfigSource, path?: string): LoadedDeliveryConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`delivery config JSON parse failed (${source})`);
  }
  return {
    config: validateDeliveryConfig(parsed),
    source,
    path,
  };
}

export function loadDeliveryConfigFromString(
  raw: string,
  source: DeliveryConfigSource = 'default_json',
  path?: string,
): LoadedDeliveryConfig {
  return parseConfig(raw, source, path);
}

export function loadDeliveryConfigFromObject(
  raw: unknown,
  source: DeliveryConfigSource = 'default_json',
): LoadedDeliveryConfig {
  return {
    config: validateDeliveryConfig(raw),
    source,
  };
}

/** Resolve delivery configuration without hardcoded business rules in callers. */
export function loadDeliveryConfig(options: DeliveryConfigLoadOptions = {}): LoadedDeliveryConfig {
  const readFile = options.readFile;
  const exists = options.exists;

  if (options.envJson) {
    return parseConfig(options.envJson, 'env_json');
  }

  if (options.envPath && readFile && exists?.(options.envPath)) {
    return parseConfig(readFile(options.envPath), 'env_path', options.envPath);
  }

  if (options.localDev && options.localDevPath && readFile && exists?.(options.localDevPath)) {
    return parseConfig(readFile(options.localDevPath), 'local_dev_file', options.localDevPath);
  }

  return loadDeliveryConfigFromObject(defaultConfigJson, 'default_json');
}
