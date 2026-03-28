/**
 * @fileoverview Valid payment state transitions for AQOND Internal Gateway.
 */
import { GATEWAY_TX_STATUS as S } from './constants.js';

const EDGES = {
  [S.PENDING]: new Set([S.AUTHORIZED, S.FAILED, S.VOIDED]),
  [S.AUTHORIZED]: new Set([S.CAPTURED, S.FAILED, S.VOIDED]),
  [S.CAPTURED]: new Set([S.SETTLED, S.REFUNDED, S.FAILED, S.VOIDED]),
  [S.SETTLED]: new Set([S.REFUNDED]),
  [S.REFUNDED]: new Set(),
  [S.FAILED]: new Set(),
  [S.VOIDED]: new Set(),
};

/**
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function canTransition(from, to) {
  const f = String(from || '').toUpperCase();
  const t = String(to || '').toUpperCase();
  if (!EDGES[f]) return false;
  return EDGES[f].has(t);
}
