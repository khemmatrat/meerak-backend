/**
 * Escrow cutover maintenance — fail-closed on escrow writes so PaySo/gateway retries (5xx).
 * Set ESCROW_CUTOVER_FREEZE=1 during maintenance window before switching backends.
 */
export const ESCROW_CUTOVER_FREEZE_ENV = 'ESCROW_CUTOVER_FREEZE';

export function isEscrowCutoverFrozen(): boolean {
  const v = String(process.env[ESCROW_CUTOVER_FREEZE_ENV] ?? '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export type EscrowCutoverFreezeResponse = {
  error: 'escrow_cutover_freeze';
  code: 'ESCROW_CUTOVER_FREEZE';
  message: string;
  retry: true;
};

export function escrowCutoverFreezePayload(): EscrowCutoverFreezeResponse {
  return {
    error: 'escrow_cutover_freeze',
    code: 'ESCROW_CUTOVER_FREEZE',
    message: 'Escrow maintenance in progress — retry later',
    retry: true,
  };
}

/** HTTP 503 — gateway/PaySo should retry webhook and verify calls. */
export const ESCROW_CUTOVER_FREEZE_HTTP_STATUS = 503;
