import { createHash } from 'crypto';
import { AIVOS_COMPILER_VERSION } from '../config.js';
import { RAW_PROMPT_KEYS } from './types.js';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export function detectRawPrompt(intent) {
  if (!intent || typeof intent !== 'object') return null;
  for (const key of RAW_PROMPT_KEYS) {
    if (typeof intent[key] === 'string' && intent[key].trim()) {
      return key;
    }
  }
  if (intent.prompts && typeof intent.prompts === 'object') {
    for (const val of Object.values(intent.prompts)) {
      if (typeof val === 'string' && val.trim()) return 'prompts';
    }
  }
  return null;
}

function renderTemplate(templateObj, slots) {
  const render = (text) =>
    String(text || '').replace(/\{\{(\w+)\}\}/g, (_, key) => (slots[key] != null ? String(slots[key]) : ''));
  return {
    system: render(templateObj.system),
    user: render(templateObj.user),
  };
}

export function computeCompilationHash(inputs, output) {
  return createHash('sha256')
    .update(`${AIVOS_COMPILER_VERSION}::${stableStringify(inputs)}::${stableStringify(output)}`)
    .digest('hex');
}

export function createPromptCompiler({ store, events }) {
  return {
    detectRawPrompt,
    async compile({
      jobId,
      intent,
      skillId,
      promptId,
      promptVersion = 1,
      brandKey = 'aqond-default',
      brandVersion = 1,
      contextSnapshotId,
      traceId,
    }) {
      const rawKey = detectRawPrompt(intent);
      if (rawKey) {
        const err = new Error('raw_prompt_rejected');
        err.code = 'RAW_PROMPT_REJECTED';
        err.field = rawKey;
        throw err;
      }

      const templateRow = await store.getPromptRegistry(promptId, promptVersion);
      if (!templateRow) {
        const err = new Error('prompt_not_found');
        err.code = 'PROMPT_NOT_FOUND';
        throw err;
      }

      for (const slot of templateRow.required_slots || []) {
        if (intent[slot] == null) {
          const err = new Error(`missing_intent_slot:${slot}`);
          err.code = 'INTENT_SLOT_MISSING';
          throw err;
        }
      }

      const brand = await store.getBrandDna(brandKey, brandVersion);
      const messages = renderTemplate(templateRow.template || {}, intent);
      if (brand?.tone) {
        messages.system = `${messages.system}\nTone: ${brand.tone}`.trim();
      }
      if (brand?.forbidden_phrases?.length) {
        const combined = `${messages.system}\n${messages.user}`.toLowerCase();
        for (const phrase of brand.forbidden_phrases) {
          if (combined.includes(String(phrase).toLowerCase())) {
            const err = new Error('brand_forbidden_phrase');
            err.code = 'BRAND_VIOLATION';
            throw err;
          }
        }
      }

      const output = {
        messages: [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user },
        ],
        metadata: {
          prompt_id: promptId,
          prompt_version: promptVersion,
          skill_id: skillId,
          brand_dna_version: brand?.version || brandVersion,
        },
      };

      const inputs = {
        intent,
        skillId,
        promptId,
        promptVersion,
        contextSnapshotId,
      };
      const contentHash = computeCompilationHash(inputs, output);

      const row = await store.insertPromptCompilation({
        job_id: jobId,
        prompt_id: promptId,
        prompt_version: promptVersion,
        brand_dna_version: brand?.version || brandVersion,
        context_snapshot_id: contextSnapshotId,
        compiler_version: AIVOS_COMPILER_VERSION,
        content_hash: contentHash,
        inputs,
        output,
      });

      if (events) {
        await events.emit({
          name: 'aivos.prompt.compiled',
          correlationId: jobId,
          traceId,
          contextId: contextSnapshotId,
          source: { agentId: 'prompt-compiler', skillId, runtimeJobId: jobId },
          payload: { compilationId: row.id, contentHash },
        });
      }

      return { compilation: row, contentHash, output };
    },
  };
}
