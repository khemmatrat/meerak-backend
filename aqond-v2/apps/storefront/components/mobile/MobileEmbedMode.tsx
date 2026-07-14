'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/** When ?embed=1 or inside mobile iframe, hide tab bar / jarvis / duplicate back buttons. */
export function MobileEmbedMode() {
  const params = useSearchParams();
  const [inIframe, setInIframe] = useState(false);

  useEffect(() => {
    setInIframe(typeof window !== 'undefined' && window.self !== window.top);
  }, []);

  const embed = params.get('embed') === '1' || inIframe;

  useEffect(() => {
    if (embed) document.body.classList.add('tt-embed');
    else document.body.classList.remove('tt-embed');
    return () => document.body.classList.remove('tt-embed');
  }, [embed]);

  return null;
}
