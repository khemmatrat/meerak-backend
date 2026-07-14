import { NextResponse } from 'next/server';
import { getEscrowStorageBackend, listEscrowHolds } from '@/lib/server/returnEscrowAdapter';
import { RETURN_REFUND_CORE_MISSION_ID } from '@aqond/return-core';
import { loadServerReturnConfig } from '@/lib/server/returnConfigStore';

export const dynamic = 'force-dynamic';

/** B2.7-S003 — Escrow adapter status (existing_escrow, no rewrite). */
export async function GET() {
  const loaded = loadServerReturnConfig();
  const holds = await listEscrowHolds();
  return NextResponse.json(
    {
      ok: true,
      scenario: 'B2.7-S003',
      mission: RETURN_REFUND_CORE_MISSION_ID,
      adapter: loaded.config.escrow.adapter,
      storage: getEscrowStorageBackend(),
      rewrite_allowed: loaded.config.escrow.rewrite_allowed,
      escrow_refund_enabled: loaded.config.capabilities.escrow_refund?.enabled === true,
      hold_count: holds.length,
      holds: holds.slice(-20),
    },
    {
      headers: {
        'X-Aqond-Return-Core': 'return-core',
        'X-Aqond-Return-Scenario': 'B2.7-S003',
      },
    },
  );
}
