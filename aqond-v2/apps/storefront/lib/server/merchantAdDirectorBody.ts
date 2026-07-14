export function absolutizeDirectorImageUrls(body: Record<string, unknown>) {
  const storefrontBase = (process.env.STOREFRONT_INTERNAL_URL || 'http://127.0.0.1:3003').replace(/\/$/, '');
  const out = { ...body };
  for (const key of ['product_image_url', 'portrait_image_url'] as const) {
    const v = out[key];
    if (typeof v === 'string' && v.startsWith('/')) {
      out[key] = `${storefrontBase}${v}`;
    }
  }
  return out;
}

export function absolutizeDirectorJobUrls(job: Record<string, unknown>) {
  const base = (process.env.MEERAK_BACKEND_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
  const j = { ...job };
  if (typeof j.output_video_url === 'string' && j.output_video_url.startsWith('/api/aivos/')) {
    j.output_video_url = `${base}${j.output_video_url}`;
  }
  if (typeof j.output_poster_url === 'string' && j.output_poster_url.startsWith('/api/aivos/')) {
    j.output_poster_url = `${base}${j.output_poster_url}`;
  }
  return j;
}
