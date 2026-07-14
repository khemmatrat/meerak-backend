'use client';

import { useEffect, useState } from 'react';
import { bffGet, bffPost } from '@/lib/bff';
import { useAuth } from '@/lib/auth';
import { Button, Card } from '@aqond/ui';
import Link from 'next/link';

export default function SettingsPage() {
  const { auth } = useAuth();
  const [settings, setSettings] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);

  useEffect(() => {
    if (!auth) return;
    bffGet<any>('/v1/settings', auth).then((d) => setSettings(d.settings || d));
    bffGet<any>('/v1/activity', auth).then((d) => setActivity(d.events || []));
  }, [auth]);

  const togglePersonalization = async () => {
    if (!auth || !settings) return;
    await bffPost('/v1/settings', {
      user_id: auth.userId,
      personalization: !settings.personalization,
    }, auth);
    setSettings({ ...settings, personalization: !settings.personalization });
  };

  if (!auth) return <p className="empty"><Link href="/login">Login</Link></p>;

  return (
    <div>
      <h1 className="page-title">Settings & Privacy</h1>
      <Card>
        <h2>Privacy</h2>
        <p>Personalization: {settings?.personalization ? 'On' : 'Off'}</p>
        <Button variant="ghost" onClick={togglePersonalization}>Toggle personalization</Button>
        <p style={{ marginTop: '1rem' }}>Biometric lock: {settings?.biometric_lock ? 'Enabled' : 'Disabled'} (P166 client-side)</p>
      </Card>
      <Card style={{ marginTop: '1rem' }}>
        <h2>Activity center</h2>
        {activity.length === 0 ? <p className="empty">No activity yet</p> : (
          <ul>{activity.map((e: any) => <li key={e.id}>{e.kind}: {e.summary}</li>)}</ul>
        )}
      </Card>
    </div>
  );
}
