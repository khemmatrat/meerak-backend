import type { EscrowAdapter } from '../contracts';

/** Reuse existing escrow — adapter only, no rewrite (Phase 0). */
export type { EscrowAdapter };

export const ESCROW_ADAPTER_ID = 'existing_escrow';
