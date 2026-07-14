export function createCreativeRuntime() {
  return {
    buildStyleManifest(intent) {
      return {
        version: '1.0.0',
        tone: intent?.tone || 'professional',
        palette: intent?.palette || {},
        generatedAt: new Date().toISOString(),
      };
    },
  };
}
