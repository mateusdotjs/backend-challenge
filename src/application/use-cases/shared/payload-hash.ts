import { createHash } from 'crypto';
import { MoneyProps } from '../../../domain/shared/money/money.js';
import { WagerTransactionKind } from '../../../domain/wagering/wager-transaction.enums.js';

/**
 * Fields that form the canonical business payload for a wager transaction.
 * Transport metadata (headers, timestamps, idempotency key) is excluded
 * so the hash captures only the business intent.
 */
interface PayloadFields {
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  referenceExternalTransactionId?: string;
}

/**
 * Produce a deterministic SHA-256 hash of the business payload.
 * Keys are sorted alphabetically before serialisation so that field order
 * differences in the source object do not produce different hashes.
 */
export function computePayloadHash(fields: PayloadFields): string {
  const canonical = sortedJson(fields);
  return createHash('sha256').update(canonical).digest('hex');
}

function sortedJson(value: unknown): string {
  if (value === undefined) {
    return JSON.stringify(null);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const sorted = Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      const fieldValue = (value as Record<string, unknown>)[key];
      if (fieldValue !== undefined) {
        acc[key] = fieldValue;
      }
      return acc;
    }, {});
  // #region agent log
  fetch('http://127.0.0.1:7557/ingest/03872681-9ff9-405b-8a84-5368f552b0d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'892c16'},body:JSON.stringify({sessionId:'892c16',location:'payload-hash.ts:sortedJson',message:'canonical payload serialized',data:{keys:Object.keys(sorted)},timestamp:Date.now(),hypothesisId:'A',runId:'post-fix'})}).catch(()=>{});
  // #endregion
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(sorted).map(([k, v]) => [k, JSON.parse(sortedJson(v))]),
    ),
  );
}
