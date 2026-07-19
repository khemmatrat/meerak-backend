import { bffGet, type AuthState } from '@/lib/bff';
import type {
  AccountWalletBffResponse,
  AccountWalletLedgerEntry,
  TalentWalletSummary,
} from '@/lib/talent/wallet/talentWalletTypes';

const MICRO = 1_000_000;

function microToMajor(micro: number): number {
  return micro / MICRO;
}

function derivePendingThb(entries: AccountWalletLedgerEntry[] | undefined): number {
  if (!Array.isArray(entries) || entries.length === 0) return 0;

  let holdMicro = 0;
  let settledMicro = 0;
  for (const entry of entries) {
    const amount = Math.abs(Number(entry.amount_micro ?? 0));
    if (!amount) continue;
    if (entry.entry_type === 'HOLD') holdMicro += amount;
    if (entry.entry_type === 'RELEASE' || entry.entry_type === 'REFUND') settledMicro += amount;
  }

  return microToMajor(Math.max(0, holdMicro - settledMicro));
}

/** Map Account wallet BFF response → Talent Money / Today presentation fields */
export function mapAccountWalletToTalentSummary(
  data: AccountWalletBffResponse | null | undefined,
): TalentWalletSummary | null {
  if (!data || typeof data !== 'object') return null;

  const balanceMicro = Number(data.balance_micro ?? 0);
  const available = microToMajor(balanceMicro);
  const pending = derivePendingThb(data.transactions);
  const total = available + pending;

  return {
    available,
    pending,
    total,
    wallet_frozen: false,
    balance_micro: balanceMicro,
    currency: data.currency ?? 'THB',
  };
}

export async function fetchAccountWalletBff(auth: AuthState): Promise<AccountWalletBffResponse> {
  return bffGet<AccountWalletBffResponse>(
    `/v1/wallet?user_id=${encodeURIComponent(auth.userId)}`,
    auth,
  );
}

/** SSOT wallet read — same path as /m/account/wallet */
export async function fetchTalentWalletSummary(auth: AuthState): Promise<TalentWalletSummary | null> {
  const data = await fetchAccountWalletBff(auth);
  const mapped = mapAccountWalletToTalentSummary(data);
  if (!mapped) throw new Error('wallet_unavailable');
  return mapped;
}
