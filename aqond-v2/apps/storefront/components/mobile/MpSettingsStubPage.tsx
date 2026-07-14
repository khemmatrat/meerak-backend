'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

type Props = {
  title: string;
  body: string;
};

export function MpSettingsStubPage({ title, body }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const embed = params.get('embed') === '1';
  const backHref = embed ? '/m/account/settings?embed=1' : '/m/account/settings';

  return (
    <div className="tt-mp-settings">
      <header className="tt-mp-settings-header">
        <Link href={backHref} className="tt-mp-settings-back" aria-label="กลับ">
          ‹
        </Link>
        <h1>{title}</h1>
        <span className="tt-mp-settings-chat-spacer" />
      </header>
      <div className="tt-mp-settings-stub">
        <p>{body}</p>
        <button type="button" className="tt-btn-ghost" onClick={() => router.back()}>
          กลับ
        </button>
      </div>
    </div>
  );
}
