import { WalletLedgerEntry } from '../../../domain/ledger/wallet-ledger-entry.js';
import { Wallet } from '../../../domain/wallet/wallet.js';
import { LedgerEntryDto, WalletDto } from '../shared/use-case.types.js';

export function toWalletDto(wallet: Wallet): WalletDto {
  return {
    id: wallet.id,
    playerId: wallet.playerId,
    currency: wallet.currency,
    balance: wallet.balance.toJSON(),
    version: wallet.version,
  };
}

export function toLedgerEntryDto(entry: WalletLedgerEntry): LedgerEntryDto {
  return {
    id: entry.id,
    walletId: entry.walletId,
    transactionId: entry.transactionId,
    direction: entry.direction,
    money: entry.money.toJSON(),
    balanceBefore: entry.balanceBefore.toJSON(),
    balanceAfter: entry.balanceAfter.toJSON(),
    createdAt: entry.createdAt.toISOString(),
  };
}
