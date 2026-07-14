import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

const cache = { catalog: null, configs: new Map() };

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function getScriptCatalog() {
  if (!cache.catalog) {
    cache.catalog = readJson(path.join(DATA_DIR, 'script-catalog.json'));
  }
  return cache.catalog;
}

export function getScriptConfig(configKey) {
  if (cache.configs.has(configKey)) return cache.configs.get(configKey);
  const catalog = getScriptCatalog();
  const fileName = catalog.config_files[configKey];
  if (!fileName) return null;
  const config = readJson(path.join(DATA_DIR, fileName));
  cache.configs.set(configKey, config);
  return config;
}

export function getScriptConfigVersion(configKey) {
  const config = getScriptConfig(configKey);
  return config?.version || '0.0.0';
}

export function resetScriptConfigCache() {
  cache.catalog = null;
  cache.configs.clear();
}

export function getScriptDataDir() {
  return DATA_DIR;
}
