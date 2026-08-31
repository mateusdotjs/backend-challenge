import { WagerTransaction } from '../../../domain/wagering/wager-transaction.js';
import { WagerTransactionRepositoryPort } from '../../ports/repositories/wager-transaction-repository.port.js';
import { WagerTransactionDto } from '../shared/use-case.types.js';

export class WagerTransactionNotFoundError extends Error {
  constructor(detail: string) {
    super(`WagerTransaction not found: ${detail}`);
    this.name = 'WagerTransactionNotFoundError';
  }
}

export class GetWagerTransactionByIdUseCase {
  constructor(private readonly wagerTxRepo: WagerTransactionRepositoryPort) {}

  async execute(transactionId: string): Promise<WagerTransactionDto> {
    const tx = await this.wagerTxRepo.findById(transactionId);
    if (!tx) {
      throw new WagerTransactionNotFoundError(transactionId);
    }
    return toWagerTransactionDto(tx);
  }
}

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
