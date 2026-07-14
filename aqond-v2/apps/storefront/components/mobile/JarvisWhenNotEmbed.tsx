'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { JarvisFab } from '@/components/jarvis/JarvisFab';

export function JarvisWhenNotEmbed() {
  const params = useSearchParams();
  const [inIframe, setInIframe] = useState(false);

  useEffect(() => {
    setInIframe(typeof window !== 'undefined' && window.self !== window.top);
  }, []);

  if (params.get('embed') === '1' || inIframe) return null;
  return <JarvisFab />;
}
