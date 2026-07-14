import { NextResponse } from 'next/server';
import { proxyExperienceRollout } from '@/lib/server/experienceProxy';

export async function GET() {
  const { ok, data, status } = await proxyExperienceRollout();
  return NextResponse.json(data, { status: ok ? 200 : status });
}
