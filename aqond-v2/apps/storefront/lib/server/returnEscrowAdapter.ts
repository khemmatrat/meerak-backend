import {
  getEscrowDbAdapter,
  getEscrowStorageBackend,
  listEscrowHoldRecords,
  resetEscrowDbForTests,
} from '@/lib/server/escrowStore';
import type { EscrowAdapter } from '@aqond/return-core';
import type { EscrowHoldRecord } from '@aqond/return-core';

export { getEscrowStorageBackend };

export async function getReturnEscrowAdapter(): Promise<EscrowAdapter> {
  return getEscrowDbAdapter();
}

export async function listEscrowHolds(): Promise<EscrowHoldRecord[]> {
  return listEscrowHoldRecords();
}

export function resetEscrowCacheForTests() {
  resetEscrowDbForTests();
}
