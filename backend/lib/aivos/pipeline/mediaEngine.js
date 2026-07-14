/**
 * Media Engine (Phase 5.6)
 * Lightweight handlers for media nodes; production integrations (ffmpeg/TTS/etc.)
 * can replace these handlers without changing pipeline executor.
 */
export function createMediaEngine(deps = {}) {
  const now = () => new Date().toISOString();

  function artifact(kind, nodeId, jobId) {
    return {
      kind,
      nodeId,
      jobId,
      uri: `${kind}://${jobId || 'job'}/${nodeId}/${Date.now()}`,
      created_at: now(),
    };
  }

  async function handle(nodeId, context) {
    const jobId = context?.jobId;
    switch (nodeId) {
      case 'image':
        return { artifact: artifact('image', nodeId, jobId) };
      case 'motion':
        return { artifact: artifact('video', nodeId, jobId) };
      case 'voice':
        return { artifact: artifact('audio', nodeId, jobId) };
      case 'subtitle':
        return { artifact: artifact('subtitle', nodeId, jobId) };
      case 'music':
        return { artifact: artifact('music', nodeId, jobId) };
      default:
        return null;
    }
  }

  return { handle };
}

export default createMediaEngine;
