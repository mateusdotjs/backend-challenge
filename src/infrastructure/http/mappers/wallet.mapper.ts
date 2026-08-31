import {
  CreateWalletCommand,
  GetWalletLedgerQuery,
} from '../../../application/use-cases/shared/use-case.types.js';
import { CreateWalletDto } from '../dto/create-wallet.dto.js';
import { LedgerQueryDto } from '../dto/ledger-query.dto.js';

export function toCreateWalletCommand(
  dto: CreateWalletDto,
): CreateWalletCommand {
  return {
    playerId: dto.playerId,
    initialBalance: {
      amount: dto.initialBalance.amount,
      currency: dto.initialBalance.currency,
    },
  };
}

export function toGetWalletLedgerQuery(
  walletId: string,
  dto: LedgerQueryDto,
): GetWalletLedgerQuery {
  return {
    walletId,
    cursor: dto.cursor,
    limit: dto.limit,
  };
}
