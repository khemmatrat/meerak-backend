'use client';

import dynamic from 'next/dynamic';

export const ProviderRiderMap = dynamic(
  () =>
    import('./ProviderRiderMap').then((mod) => mod.ProviderRiderMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="tt-provider-rider-map flex items-center justify-center rounded-2xl border border-emerald-100 bg-slate-50 text-sm text-slate-500"
        style={{ height: 'min(58vh, 400px)' }}
      >
        กำลังโหลดแผนที่…
      </div>
    ),
  },
);
