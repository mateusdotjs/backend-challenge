import { ProcessWagerTransactionCommand } from '../../../application/use-cases/shared/use-case.types.js';
import { ProcessWagerTransactionDto } from '../dto/process-wager-transaction.dto.js';

export function toProcessWagerTransactionCommand(
  dto: ProcessWagerTransactionDto,
  idempotencyKey: string,
): ProcessWagerTransactionCommand {
  return {
    idempotencyKey,
    providerId: dto.providerId,
    externalTransactionId: dto.externalTransactionId,
    playerId: dto.playerId,
    walletId: dto.walletId,
    roundId: dto.roundId,
    gameId: dto.gameId,
    kind: dto.kind,
    money: {
      amount: dto.money.amount,
      currency: dto.money.currency,
    },
    referenceExternalTransactionId: dto.referenceExternalTransactionId,
  };
}
