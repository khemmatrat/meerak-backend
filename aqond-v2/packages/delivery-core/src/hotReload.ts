import type { DeliveryConfigLoadOptions, LoadedDeliveryConfig } from './types';
import { loadDeliveryConfig, loadDeliveryConfigFromString } from './load';

export type HotReloadFs = {
  readFile: (path: string) => string;
  exists: (path: string) => boolean;
  statMtimeMs: (path: string) => number;
};

type CacheEntry = {
  cacheKey: string;
  mtimeMs: number;
  loaded: LoadedDeliveryConfig;
};

function resolveFilePath(options: DeliveryConfigLoadOptions, fs: HotReloadFs): string | undefined {
  if (options.envPath && fs.exists(options.envPath)) return options.envPath;
  if (options.localDev && options.localDevPath && fs.exists(options.localDevPath)) {
    return options.localDevPath;
  }
  return undefined;
}

/** Hot-reload safe loader — re-reads file when mtime changes; env JSON when content changes. */
export function createHotReloadDeliveryConfig(
  getOptions: () => DeliveryConfigLoadOptions,
  fs: HotReloadFs,
) {
  let fileCache: CacheEntry | null = null;
  let envJsonCache: { raw: string; loaded: LoadedDeliveryConfig } | null = null;

  function invalidate() {
    fileCache = null;
    envJsonCache = null;
  }

  function get(): LoadedDeliveryConfig {
    const options = getOptions();

    if (options.envJson) {
      if (envJsonCache && envJsonCache.raw === options.envJson) {
        return envJsonCache.loaded;
      }
      const loaded = loadDeliveryConfigFromString(options.envJson, 'env_json');
      envJsonCache = { raw: options.envJson, loaded };
      fileCache = null;
      return loaded;
    }

    envJsonCache = null;

    const filePath = resolveFilePath(options, fs);
    if (filePath) {
      const mtimeMs = fs.statMtimeMs(filePath);
      if (fileCache && fileCache.cacheKey === filePath && fileCache.mtimeMs === mtimeMs) {
        return fileCache.loaded;
      }
      const loaded = loadDeliveryConfig({
        ...options,
        envPath: filePath,
        readFile: fs.readFile,
        exists: fs.exists,
      });
      fileCache = { cacheKey: filePath, mtimeMs, loaded };
      return loaded;
    }

    fileCache = null;
    return loadDeliveryConfig(options);
  }

  function meta() {
    const options = getOptions();
    const loaded = get();
    const filePath = resolveFilePath(options, fs);
    return {
      hot_reload_supported: true,
      source: loaded.source,
      path: loaded.path ?? filePath,
      config_mtime_ms: filePath ? fs.statMtimeMs(filePath) : null,
      updated_at: loaded.config.updated_at,
    };
  }

  return { get, meta, invalidate };
}
