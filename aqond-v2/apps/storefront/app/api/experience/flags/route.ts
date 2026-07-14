import { NextResponse } from 'next/server';
import { proxyExperienceFlags } from '@/lib/server/experienceProxy';

export async function GET() {
  const out = await proxyExperienceFlags();
  return NextResponse.json(out.data, { status: out.ok ? 200 : 502 });
}
