'use client';

import { useEffect } from 'react';

/** Applies TikTok Shop light theme on /m/* routes. */
export function MobileBodyClass() {
  useEffect(() => {
    document.body.classList.add('tt-body');
    return () => document.body.classList.remove('tt-body');
  }, []);
  return null;
}
