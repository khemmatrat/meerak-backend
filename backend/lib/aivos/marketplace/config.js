export function isMarketplaceEnabled() {
  return (
    process.env.AIVOS_MARKETPLACE_ENABLED === '1' ||
    process.env.AIVOS_MARKETPLACE_ENABLED === 'true'
  );
}
