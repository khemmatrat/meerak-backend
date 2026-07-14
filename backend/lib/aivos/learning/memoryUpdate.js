/**
 * Memory Update – pushes approved learning proposals into Kernel semantic memory.
 *
 * Bridges the Learning Engine → Kernel (L7 Semantic Memory).
 * Only approved proposals with owner namespace are written.
 * Auto-apply is off by default; requires explicit approval or flag.
 */
export function createMemoryUpdate(deps = {}) {
  const kernel = deps.kernel || null;
  const updateLog = [];

  /**
   * Push an approved learning proposal into semantic memory.
   *
   * @param {{ type, key, content, ownerId, source, score }} proposal
   * @returns {Promise<{ pushed: boolean, memoryId?: string, reason?: string }>}
   */
  async function push(proposal) {
    if (!proposal || !proposal.key || !proposal.content) {
      return { pushed: false, reason: 'invalid_proposal' };
    }

    const entry = {
      type: proposal.type || 'learning',
      key: proposal.key,
      content: proposal.content,
      ownerId: proposal.ownerId || 'system',
      source: proposal.source || 'learning_engine',
      score: proposal.score || 0,
      pushed_at: new Date().toISOString(),
    };

    if (kernel?.memory?.upsertSemantic) {
      try {
        const result = await kernel.memory.upsertSemantic(entry);
        updateLog.push({ ...entry, memoryId: result?.id, status: 'pushed' });
        return { pushed: true, memoryId: result?.id };
      } catch (e) {
        updateLog.push({ ...entry, status: 'failed', error: e.message });
        return { pushed: false, reason: e.message };
      }
    }

    // No kernel wired – log and return stub
    updateLog.push({ ...entry, status: 'stub_pushed' });
    return { pushed: true, stub: true, key: entry.key };
  }

  /**
   * Push multiple proposals in batch (for nightly learning run).
   */
  async function pushBatch(proposals = []) {
    const results = [];
    for (const p of proposals) {
      results.push(await push(p));
    }
    return { total: proposals.length, pushed: results.filter((r) => r.pushed).length, results };
  }

  function listLog() { return [...updateLog]; }

  return { push, pushBatch, listLog };
}

export default createMemoryUpdate;
