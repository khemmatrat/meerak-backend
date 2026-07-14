import { seedE2eFixtures, E2E_PRODUCT_ID } from './fixtures';

/**
 * `next dev` compiles each route lazily on its first request, which can exceed the
 * per-assertion expect timeout for whichever test hits a route first (observed as
 * flaky first-run failures on S007 step 1 and S010 step 5). Warming the critical
 * routes up front makes the suite deterministic. Production (`next build`) pre-compiles
 * every route, so this cold-start cost does not exist there.
 */
async function warmRoutes(base: string) {
  const gets = [
    '/m/checkout',
    '/m/orders',
    '/m/checkout/payment',
    '/m/checkout/payment/result',
    `/api/product/${E2E_PRODUCT_ID}/detail`,
    '/api/orders?buyer_id=warmup',
    '/api/checkout/place',
  ];
  await Promise.all(
    gets.map((p) =>
      fetch(`${base}${p}`, { method: 'GET' }).catch(() => null),
    ),
  );
}

export default async function globalSetup() {
  await seedE2eFixtures();
  const port = process.env.E2E_PORT || '3003';
  const base = `http://127.0.0.1:${port}`;
  try {
    await warmRoutes(base);
    console.log('[e2e] Warmed critical routes');
  } catch {
    /* warmup is best-effort */
  }
  console.log('[e2e] Seeded PDP video fixtures');
}
