#!/usr/bin/env node
/** PV-2 Wave 1 — S001 automated check (API + SSR) */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';

async function timedFetch(url) {
  const t0 = performance.now();
  const res = await fetch(url, { redirect: 'follow' });
  const body = await res.text();
  const ms = Math.round(performance.now() - t0);
  return { res, body, ms };
}

async function main() {
  const results = { scenario: 'S001', scenario_grade: '🟡 Functional Pass', steps: [] };

  const home = await timedFetch(`${BASE}/m/home`);
  results.steps.push({
    step: 1,
    name: 'Page loads < 3s',
    http: home.res.status,
    ms: home.ms,
    pass: home.res.ok && home.ms < 3000,
  });

  const bff = await timedFetch(`${BASE}/api/bff/v1/home`);
  let productCount = 0;
  try {
    const data = JSON.parse(bff.body);
    productCount = (data.products?.products || []).length;
  } catch {
    /* ignore */
  }
  const productLinks = (home.body.match(/href="\/m\/product\/[^"]+"/g) || []).length;
  results.steps.push({
    step: 2,
    name: 'Products visible',
    bff_products: productCount,
    html_product_links: productLinks,
    pass: productCount > 0 && productLinks > 0,
  });

  const hasErrorPage = /Application error|Internal Server Error|statusCode.:500/.test(home.body);
  results.steps.push({
    step: 3,
    name: 'No fatal render errors',
    has_error_page: hasErrorPage,
    pass: !hasErrorPage && home.res.ok,
  });

  const hasSkeletonMarkup =
    home.body.includes('home-skeleton') || home.body.includes('axs-marketplace-loading');
  results.steps.push({
    step: 4,
    name: 'Skeleton markup present',
    note: 'timing <200ms requires Playwright e2e',
    pass: hasSkeletonMarkup || home.body.includes('Skeleton'),
  });

  const empty = await timedFetch(`${BASE}/m/home?pv_test=empty`);
  const emptyOk =
    empty.res.ok &&
    empty.body.includes('กำลังเชื่อมต่อข้อมูล') &&
    empty.body.includes('ลองใหม่') &&
    !/Application error|Internal Server Error/.test(empty.body);
  results.steps.push({
    step: 5,
    name: 'Empty state (API down)',
    pass: emptyOk,
  });

  results.steps.push({
    step: 6,
    name: 'Offline cache / page',
    note: 'requires Playwright e2e (sessionStorage + SW)',
    pass: null,
  });

  results.steps.push({
    step: 7,
    name: 'Recover on online',
    note: 'requires Playwright e2e (router.refresh)',
    pass: null,
  });

  const automated = results.steps.filter((s) => s.pass !== null);
  const allAutomatedPass = automated.every((s) => s.pass);
  results.status = allAutomatedPass ? 'PASS' : 'FAIL';

  console.log(JSON.stringify(results, null, 2));
  process.exit(allAutomatedPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
