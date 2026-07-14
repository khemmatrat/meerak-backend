'use client';

import { useEffect } from 'react';
import { TtFeedViewer } from '@/components/mobile/TtFeedViewer';

export default function MobileFeedPage() {
  useEffect(() => {
    document.body.classList.add('tt-feed-page');
    return () => document.body.classList.remove('tt-feed-page');
  }, []);

  return <TtFeedViewer />;
}
