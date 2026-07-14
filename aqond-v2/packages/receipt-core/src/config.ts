import defaultConfigJson from '../config/receipt-config.default.json';
import type { LoadedReceiptConfig, ReceiptConfig, ReceiptConfigSource } from './types';
import { validateReceiptConfig } from './validate';

export type ReceiptConfigLoadOptions = {
  envJson?: string;
  envPath?: string;
  localDevPath?: string;
  localDev?: boolean;
  readFile?: (path: string) => string;
  exists?: (path: string) => boolean;
};

export function loadReceiptConfigFromObject(
  raw: unknown,
  source: ReceiptConfigSource = 'default_json',
): LoadedReceiptConfig {
  return { config: validateReceiptConfig(raw), source };
}

export function loadReceiptConfig(options: ReceiptConfigLoadOptions = {}): LoadedReceiptConfig {
  const { readFile, exists } = options;

  if (options.envJson) {
    return loadReceiptConfigFromObject(JSON.parse(options.envJson), 'env_json');
  }

  if (options.envPath && readFile && exists?.(options.envPath)) {
    return {
      config: validateReceiptConfig(JSON.parse(readFile(options.envPath))),
      source: 'env_path',
      path: options.envPath,
    };
  }

  if (options.localDev && options.localDevPath && readFile && exists?.(options.localDevPath)) {
    return {
      config: validateReceiptConfig(JSON.parse(readFile(options.localDevPath))),
      source: 'local_dev_file',
      path: options.localDevPath,
    };
  }

  return loadReceiptConfigFromObject(defaultConfigJson, 'default_json');
}

export function listTemplates(config: ReceiptConfig) {
  return Object.entries(config.templates).map(([id, tpl]) => ({
    template_id: id,
    enabled: tpl.enabled,
    template_version: tpl.template_version,
    receipt_type: tpl.receipt_type,
    blocks: tpl.blocks,
  }));
}
