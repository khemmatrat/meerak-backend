import { Suspense } from 'react';
import LineCallbackClient from './LineCallbackClient';

export default function LineOAuthCallbackPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: 'center' }}><p className="tt-hint">กำลังเชื่อม LINE…</p></div>}>
      <LineCallbackClient />
    </Suspense>
  );
}
