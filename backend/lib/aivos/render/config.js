export function isRenderEnabled() {
  return process.env.AIVOS_RENDER_ENABLED === '1' || process.env.AIVOS_RENDER_ENABLED === 'true';
}

export function assertRenderEnabled() {
  if (!isRenderEnabled()) {
    const err = new Error('aivos_render_disabled');
    err.code = 'AIVOS_RENDER_DISABLED';
    throw err;
  }
}
