'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { bffGet } from './bff';

type I18nCtx = { locale: string; currency: string; rtl: boolean; t: (key: string) => string };

const Ctx = createContext<I18nCtx>({ locale: 'th-TH', currency: 'THB', rtl: false, t: (k) => k });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState('th-TH');
  const [currency, setCurrency] = useState('THB');
  const [rtl, setRtl] = useState(false);
  const [messages, setMessages] = useState<Record<string, string>>({});

  useEffect(() => {
    bffGet<{ locale: { locale?: string; currency?: string; rtl?: boolean } }>(
      `/v1/context?locale=${locale}`,
    ).then((ctx) => {
      if (ctx.locale?.locale) setLocale(ctx.locale.locale);
      if (ctx.locale?.currency) setCurrency(ctx.locale.currency);
      if (ctx.locale?.rtl) setRtl(ctx.locale.rtl);
    }).catch(() => {});
  }, [locale]);

  const t = (key: string) => messages[key] || key;

  return (
    <Ctx.Provider value={{ locale, currency, rtl, t }}>
      <div dir={rtl ? 'rtl' : 'ltr'}>{children}</div>
    </Ctx.Provider>
  );
}

export function useI18n() {
  return useContext(Ctx);
}
