import { WagerTransaction } from '../../../domain/wagering/wager-transaction.js';
import { WagerTransactionDto } from '../shared/use-case.types.js';

export function toWagerTransactionDto(tx: WagerTransaction): WagerTransactionDto {
  return {
    id: tx.id,
    providerId: tx.providerId,
    externalTransactionId: tx.externalTransactionId,
    idempotencyKey: tx.idempotencyKey,
    walletId: tx.walletId,
    playerId: tx.playerId,
    roundId: tx.roundId,
    gameId: tx.gameId,
    kind: tx.kind,
    status: tx.status,
    money: tx.money.toJSON(),
    referenceExternalTransactionId: tx.referenceExternalTransactionId ?? null,
    referenceTransactionId: tx.referenceTransactionId ?? null,
    failureCode: tx.failureCode ?? null,
    observedBalance: tx.observedBalance?.toJSON() ?? null,
    processedAt: tx.processedAt?.toISOString() ?? null,
    createdAt: tx.createdAt.toISOString(),
  };
}
