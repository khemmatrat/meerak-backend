'use client';

import { useEffect } from 'react';
import { ThemeProvider } from '@aqond/ui';
import { AuthProvider } from '@/lib/auth';
import { I18nProvider } from '@/lib/i18n';
import { ConditionalNav } from '@/components/ConditionalNav';
import { initRUM } from '@/lib/rum';

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initRUM(window.location.pathname);
    // Do not register SW in dev — storefront shares localhost with mobile (port 3000);
    // a cached shell breaks mobile HashRouter (#/welcome, #/login).
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <ThemeProvider defaultTheme="aqond-light" storageKey="aqond-theme">
      <AuthProvider>
        <I18nProvider>
          <ConditionalNav />
          <main className="main">{children}</main>
        </I18nProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
