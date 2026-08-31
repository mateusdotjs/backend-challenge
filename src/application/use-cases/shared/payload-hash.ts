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
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const sorted = Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = (value as Record<string, unknown>)[key];
      return acc;
    }, {});
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(sorted).map(([k, v]) => [k, JSON.parse(sortedJson(v))]),
    ),
  );
}
