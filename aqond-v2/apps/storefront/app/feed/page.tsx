'use client';

import { useEffect, useState } from 'react';
import { bffGet } from '@/lib/bff';
import { useAuth } from '@/lib/auth';
import { Card } from '@aqond/ui';

export default function FeedPage() {
  const { auth } = useAuth();
  const [tab, setTab] = useState('for-you');
  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    bffGet<any>(`/v1/feed?kind=${tab}`, auth || undefined).then((d) => setPosts(d.posts || []));
  }, [tab, auth]);

  return (
    <div>
      <h1 className="page-title">Video Feed</h1>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button type="button" className={tab === 'for-you' ? 'aq-btn aq-btn-primary' : 'aq-btn aq-btn-ghost'} onClick={() => setTab('for-you')}>For You</button>
        <button type="button" className={tab === 'following' ? 'aq-btn aq-btn-primary' : 'aq-btn aq-btn-ghost'} onClick={() => setTab('following')}>Following</button>
      </div>
      {posts.length === 0 ? (
        <Card><p className="empty">No posts — publish via Creator Studio</p></Card>
      ) : (
        posts.map((p: any) => (
          <Card key={p.id} style={{ marginBottom: '0.5rem' }}>
            <p>{p.caption || p.id}</p>
          </Card>
        ))
      )}
      <p style={{ marginTop: '1rem' }}><a href="/live">Watch LIVE →</a></p>
    </div>
  );
}
