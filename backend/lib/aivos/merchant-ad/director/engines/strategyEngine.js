import { getScriptConfig } from './scriptConfigLoader.js';
import fs from 'fs';
import path from 'path';
import { getScriptDataDir } from './scriptConfigLoader.js';

function getMarketingStrategiesManifest() {
  const filePath = path.join(getScriptDataDir(), 'marketing-strategies.manifest.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Strategy Engine — selects marketing strategies from business type / industry.
 * @param {ReturnType<import('./businessContext.js').resolveBusinessContext>} businessContext
 */
export function resolveMarketingStrategy(businessContext) {
  const map = getScriptConfig('business_strategy_map');
  const strategies = getScriptConfig('marketing_strategies');

  const byIndustry = map.by_industry[businessContext.industry_id];
  const byBusiness = map.by_business_type[businessContext.business_type];
  const picked = byIndustry || byBusiness || map.by_business_type._default || { primary: 'sell_value', secondary: 'sell_hope' };

  const primary = strategies.strategies[picked.primary] || strategies.strategies.sell_value;
  const secondary = strategies.strategies[picked.secondary] || strategies.strategies.sell_hope;

  return {
    primary_id: picked.primary,
    secondary_id: picked.secondary,
    primary: { id: picked.primary, ...primary },
    secondary: { id: picked.secondary, ...secondary },
    source: 'strategy_engine_v3',
  };
}

export function listMarketingStrategies() {
  const strategies = getScriptConfig('marketing_strategies');
  const manifest = getMarketingStrategiesManifest();
  return {
    canonical_doc: manifest.canonical_doc,
    data_file: manifest.data_file,
    strategies: Object.entries(strategies.strategies).map(([id, meta]) => ({ id, ...meta })),
  };
}
