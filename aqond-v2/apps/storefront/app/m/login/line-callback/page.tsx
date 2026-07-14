import { Suspense } from 'react';
import LineLoginCallbackClient from './LineLoginCallbackClient';

export default function LineLoginCallbackPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 24, textAlign: 'center' }}>
          <p className="tt-hint">กำลังเข้าสู่ระบบด้วย LINE…</p>
        </div>
      }
    >
      <LineLoginCallbackClient />
    </Suspense>
  );
}
