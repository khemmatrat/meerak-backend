import { getScriptConfig } from './scriptConfigLoader.js';

/**
 * Psychology / Emotional Strategy Engine — derives emotions from marketing strategies.
 * @param {ReturnType<import('./strategyEngine.js').resolveMarketingStrategy>} marketingStrategy
 */
export function resolveEmotionalStrategy(marketingStrategy) {
  const emotions = getScriptConfig('emotional_strategies');

  function pick(emotionId) {
    return emotions.emotions[emotionId] || emotions.emotions._default;
  }

  const primary = pick(marketingStrategy.primary.emotion_id);
  const secondary = pick(marketingStrategy.secondary.emotion_id);

  return {
    primary_id: marketingStrategy.primary.emotion_id,
    secondary_id: marketingStrategy.secondary.emotion_id,
    primary: { id: marketingStrategy.primary.emotion_id, ...primary },
    secondary: { id: marketingStrategy.secondary.emotion_id, ...secondary },
    source: 'psychology_engine_v3',
  };
}
