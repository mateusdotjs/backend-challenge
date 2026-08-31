import { WagerTransaction } from '../../../domain/wagering/wager-transaction.js';

export interface FindPendingReferenceParams {
  limit: number;
  now: Date;
}

export interface WagerTransactionRepositoryPort {
  findById(id: string): Promise<WagerTransaction | null>;

  findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<WagerTransaction | null>;

  /**
   * Look up a transaction by its provider + external identifier.
   *
   * Used in two contexts:
   *   1. Normal duplicate detection: (providerId, externalTransactionId)
   *   2. Reference resolution: (providerId, referenceExternalTransactionId)
   *      — works because referenceExternalTransactionId points to the
   *        externalTransactionId of the referenced transaction within the
   *        same provider.
   */
  findByProviderAndExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null>;

  /**
   * Return transactions that are in PENDING_REFERENCE status and whose
   * nextReferenceAttemptAt is at or before `params.now`.
   */
  findPendingReference(
    params: FindPendingReferenceParams,
  ): Promise<WagerTransaction[]>;

  save(wagerTransaction: WagerTransaction): Promise<void>;
}
