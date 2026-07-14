'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { bffGet } from '@/lib/bff';
import { Card } from '@aqond/ui';

export default function SharePage() {
  return (
    <Suspense fallback={<p className="empty">Loading share...</p>}>
      <ShareContent />
    </Suspense>
  );
}

function ShareContent() {
  const sp = useSearchParams();
  const kind = sp.get('kind') || 'product';
  const ref = sp.get('ref') || '';
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (ref) bffGet(`/v1/share/qr?kind=${kind}&ref=${ref}`).then(setData);
  }, [kind, ref]);

  const copy = () => {
    if (data?.copy_link) navigator.clipboard.writeText(data.copy_link);
  };

  return (
    <div>
      <h1 className="page-title">Share (P167)</h1>
      <Card>
        {data ? (
          <>
            <p>Deep link: {data.deep_link}</p>
            <p>QR payload: {data.qr_payload}</p>
            <button type="button" className="aq-btn aq-btn-primary" onClick={copy}>Copy link</button>
          </>
        ) : <p className="empty">Provide ?kind=profile&ref=user-id</p>}
      </Card>
    </div>
  );
}
