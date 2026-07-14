'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { AuthState } from '@/lib/bff';
import { AUTH_LOGIN } from '@/lib/authMessaging';
import type { MeerakUser } from '@/lib/meerakAuth';
import { IconLuxAqondStore, IconLuxCart, IconLuxChat, IconLuxGear } from '@/components/mobile/TtLuxuryIcons';

type Props = {
  auth: AuthState | null;
  user: MeerakUser | null;
  shopHref?: string;
  cartCount?: number;
  chatCount?: number;
};

function ToolBadge({ count }: { count?: number }) {
  if (!count || count <= 0) return null;
  return <em className="tt-mp-tool-badge">{count > 99 ? '99+' : count}</em>;
}

export function MpAccountHeader({ auth, user, shopHref = '/m/sell', cartCount, chatCount }: Props) {
  const params = useSearchParams();
  const embed = params.get('embed') === '1';
  const chatHref = embed ? '/m/chats?embed=1' : '/m/chats';
  const settingsHref = embed ? '/m/account/settings?embed=1' : '/m/account/settings';

  return (
    <header className="tt-mp-account-header">
      <div className="tt-mp-account-top">
        {auth ? (
          <Link href={shopHref} className="tt-mp-account-shop">
            <IconLuxAqondStore size={16} /> ร้านของฉัน ›
          </Link>
        ) : (
          <span className="tt-mp-account-shop">
            <IconLuxAqondStore size={16} /> ร้านของฉัน ›
          </span>
        )}
        <div className="tt-mp-account-tools">
          <Link href={settingsHref} className="tt-mp-account-tool-btn" aria-label="ตั้งค่า">
            <IconLuxGear size={22} />
          </Link>
          <Link href="/m/cart" className="tt-mp-tool-wrap" aria-label="รถเข็น">
            <IconLuxCart size={22} />
            <ToolBadge count={cartCount} />
          </Link>
          <Link href={chatHref} className="tt-mp-tool-wrap" aria-label="แชท">
            <IconLuxChat size={22} />
            <ToolBadge count={chatCount} />
          </Link>
        </div>
      </div>
      <div className="tt-mp-account-profile">
        <div className="tt-avatar">
          {user?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar_url} alt="" className="tt-mp-avatar-img" />
          ) : (
            '👤'
          )}
        </div>
        <div>
          {auth ? (
            <>
              <p className="tt-account-name">{user?.name || user?.phone || auth.userId}</p>
              <p className="tt-mp-account-stats">
                <span>0 ผู้ติดตาม</span>
                <span className="tt-mp-stat-sep">·</span>
                <span>0 กำลังติดตาม</span>
              </p>
            </>
          ) : (
            <>
              <p className="tt-account-name">ยังไม่ได้เข้าสู่ระบบ</p>
              <p className="tt-hub-identity">{AUTH_LOGIN.hintMobileApp}</p>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
