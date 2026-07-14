import { NextRequest, NextResponse } from 'next/server';
import {
  getUserAccountData,
  maskEmail,
  maskPhone,
  patchUserAccountData,
} from '@/lib/server/userAccountStore';

function publicProfile(data: Awaited<ReturnType<typeof getUserAccountData>>) {
  const p = data.profile;
  return {
    ...p,
    phone_masked: p.phone ? maskPhone(p.phone) : '',
    email_masked: p.email ? maskEmail(p.email) : '',
    username_can_change: !p.username_changed_at,
  };
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id') || '';
  if (!userId || userId === 'guest') {
    return NextResponse.json({ error: 'login_required' }, { status: 401 });
  }
  const phone = req.nextUrl.searchParams.get('phone') || undefined;
  const email = req.nextUrl.searchParams.get('email') || undefined;
  const name = req.nextUrl.searchParams.get('name') || undefined;
  try {
    const data = await getUserAccountData(userId, {
      phone,
      email,
      display_name: name,
    });
    return NextResponse.json({
      profile: publicProfile(data),
      bank_accounts: data.bank_accounts,
      cards: data.cards,
      point_cards: data.point_cards,
      auto_pay_enabled: data.auto_pay_enabled,
      device_alert: data.device_alert,
    });
  } catch (e) {
    console.error('[account settings GET]', e);
    return NextResponse.json({ error: 'settings_load_failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = String(body.user_id || '');
    if (!userId || userId === 'guest') {
      return NextResponse.json({ error: 'login_required' }, { status: 401 });
    }
    const data = await patchUserAccountData(userId, {
      profile: body.profile,
      bank_accounts: body.bank_accounts,
      cards: body.cards,
      point_cards: body.point_cards,
      auto_pay_enabled: body.auto_pay_enabled,
      device_alert: body.device_alert,
      add_bank: body.add_bank,
      add_card: body.add_card,
    });
    return NextResponse.json({
      profile: publicProfile(data),
      bank_accounts: data.bank_accounts,
      cards: data.cards,
      point_cards: data.point_cards,
      auto_pay_enabled: data.auto_pay_enabled,
      device_alert: data.device_alert,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'settings_save_failed';
    if (msg === 'username_change_limit') {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error('[account settings PATCH]', e);
    return NextResponse.json({ error: 'settings_save_failed' }, { status: 500 });
  }
}
