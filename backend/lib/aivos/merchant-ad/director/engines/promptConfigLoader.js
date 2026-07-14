import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

/** @type {{ versions: object|null, catalogs: Map<string, object>, dimensions: Map<string, object>, libraries: Map<string, object> }} */
const cache = { versions: null, catalogs: new Map(), dimensions: new Map(), libraries: new Map() };

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function getPromptVersions() {
  if (!cache.versions) {
    cache.versions = readJson(path.join(DATA_DIR, 'prompt-versions.json'));
  }
  return cache.versions;
}

/**
 * @param {string} [versionId] — v1 | v2 | v3; defaults to active version
 */
export function resolvePromptVersion(versionId) {
  const registry = getPromptVersions();
  const id = versionId || registry.active || registry.default || 'v3';
  const meta = registry.versions[id];
  if (!meta) {
    throw new Error(`Unknown prompt version: ${id}`);
  }
  return { id, ...meta };
}

/**
 * @param {string} [versionId]
 */
export function getPromptCatalog(versionId) {
  const { id, catalog: catalogFile } = resolvePromptVersion(versionId);
  if (cache.catalogs.has(id)) {
    return cache.catalogs.get(id);
  }
  const catalog = readJson(path.join(DATA_DIR, catalogFile));
  cache.catalogs.set(id, catalog);
  return catalog;
}

/**
 * @param {string} dimensionKey — key from catalog.dimension_files
 * @param {string} [versionId]
 */
export function getDimensionConfig(dimensionKey, versionId) {
  const { id: vid } = resolvePromptVersion(versionId);
  const cacheKey = `${vid}:${dimensionKey}`;
  if (cache.dimensions.has(cacheKey)) {
    return cache.dimensions.get(cacheKey);
  }
  const catalog = getPromptCatalog(vid);
  const fileName = catalog.dimension_files[dimensionKey];
  if (!fileName) return null;
  const config = readJson(path.join(DATA_DIR, fileName));
  cache.dimensions.set(cacheKey, config);
  return config;
}

/**
 * @param {string} dimensionKey
 * @param {string} entryId
 * @param {string} [versionId]
 */
export function resolveDimensionEntry(dimensionKey, entryId, versionId) {
  const config = getDimensionConfig(dimensionKey, versionId);
  if (!config?.entries) return config?.entries?._default || {};
  return config.entries[entryId] || config.entries._default || {};
}

export function getDimensionVersion(dimensionKey, versionId) {
  const config = getDimensionConfig(dimensionKey, versionId);
  return config?.version || '0.0.0';
}

/**
 * @param {string} langId — th | en | ja | zh
 * @param {string} [versionId]
 */
export function getLanguageLibraryEntry(langId, versionId) {
  const { id: vid } = resolvePromptVersion(versionId);
  const cacheKey = `${vid}:lang:${langId}`;
  if (cache.libraries.has(cacheKey)) {
    return cache.libraries.get(cacheKey);
  }
  const catalog = getPromptCatalog(vid);
  const langDir = catalog.library?.languages;
  if (!langDir) return null;
  const filePath = path.join(DATA_DIR, langDir, `${langId}.json`);
  if (!fs.existsSync(filePath)) {
    const fallback = readJson(path.join(DATA_DIR, langDir, 'th.json'));
    cache.libraries.set(cacheKey, fallback);
    return fallback;
  }
  const entry = readJson(filePath);
  cache.libraries.set(cacheKey, entry);
  return entry;
}

/**
 * @param {string} providerId — generic | grok | veo | runway | kling
 * @param {string} [versionId]
 */
export function getProviderLibraryEntry(providerId, versionId) {
  const { id: vid } = resolvePromptVersion(versionId);
  const cacheKey = `${vid}:provider:${providerId}`;
  if (cache.libraries.has(cacheKey)) {
    return cache.libraries.get(cacheKey);
  }
  const catalog = getPromptCatalog(vid);
  const providerDir = catalog.library?.providers;
  if (!providerDir) return null;
  const filePath = path.join(DATA_DIR, providerDir, `${providerId}.json`);
  if (!fs.existsSync(filePath)) {
    const fallback = readJson(path.join(DATA_DIR, providerDir, 'generic.json'));
    cache.libraries.set(cacheKey, fallback);
    return fallback;
  }
  const entry = readJson(filePath);
  cache.libraries.set(cacheKey, entry);
  return entry;
}

/**
 * @param {string} industryId
 * @param {object} catalog
 */
export function resolveIndustryAlias(industryId, catalog) {
  const aliases = catalog.industry_aliases || {};
  return aliases[industryId] || industryId;
}

/**
 * @param {string} styleId
 * @param {object} catalog
 */
export function resolveStyleAlias(styleId, catalog) {
  const aliases = catalog.style_aliases || {};
  return aliases[styleId] || styleId;
}

export function listPromptVersions() {
  const registry = getPromptVersions();
  return Object.entries(registry.versions).map(([id, meta]) => ({
    id,
    active: id === registry.active,
    ...meta,
  }));
}

/** Clear in-memory cache (tests). */
export function resetPromptConfigCache() {
  cache.versions = null;
  cache.catalogs.clear();
  cache.dimensions.clear();
  cache.libraries.clear();
}

export function getDataDir() {
  return DATA_DIR;
}
