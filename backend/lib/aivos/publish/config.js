export function isPublishEnabled() {
  return process.env.AIVOS_PUBLISH_ENABLED === '1' || process.env.AIVOS_PUBLISH_ENABLED === 'true';
}

export function assertPublishEnabled() {
  if (!isPublishEnabled()) {
    const err = new Error('aivos_publish_disabled');
    err.code = 'AIVOS_PUBLISH_DISABLED';
    throw err;
  }
}
