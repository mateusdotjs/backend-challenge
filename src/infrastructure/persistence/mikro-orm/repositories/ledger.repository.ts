import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';

import { Money } from '../../../../domain/shared/money/money.js';
import { WalletLedgerEntry } from '../../../../domain/ledger/wallet-ledger-entry.js';
import { LedgerRepositoryPort } from '../../../../application/ports/repositories/ledger-repository.port.js';
import {
  WalletLedgerEntryEntity,
  IWalletLedgerEntry,
} from '../entities/wallet-ledger-entry.entity.js';

@Injectable()
export class LedgerMikroOrmRepository implements LedgerRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  async save(entry: WalletLedgerEntry): Promise<void> {
    await this.em.insert(WalletLedgerEntryEntity, this.toPersistence(entry));
  }

  async findByWalletId(walletId: string): Promise<WalletLedgerEntry[]> {
    const entities = await this.em.find(
      WalletLedgerEntryEntity,
      { walletId },
      { orderBy: { createdAt: 'asc' } },
    );
    return entities.map((e) => this.toDomain(e));
  }

  private toDomain(entity: IWalletLedgerEntry): WalletLedgerEntry {
    return WalletLedgerEntry.rehydrate({
      id: entity.id,
      walletId: entity.walletId,
      transactionId: entity.transactionId,
      direction: entity.direction,
      money: Money.from({
        amount: entity.moneyAmount,
        currency: entity.moneyCurrency,
      }),
      balanceBefore: Money.from({
        amount: entity.balanceBeforeAmount,
        currency: entity.balanceBeforeCurrency,
      }),
      balanceAfter: Money.from({
        amount: entity.balanceAfterAmount,
        currency: entity.balanceAfterCurrency,
      }),
      createdAt: entity.createdAt,
    });
  }

  private toPersistence(entry: WalletLedgerEntry): IWalletLedgerEntry {
    return {
      id: entry.id,
      walletId: entry.walletId,
      transactionId: entry.transactionId,
      direction: entry.direction,
      moneyAmount: entry.money.toString(),
      moneyCurrency: entry.money.currency,
      balanceBeforeAmount: entry.balanceBefore.toString(),
      balanceBeforeCurrency: entry.balanceBefore.currency,
      balanceAfterAmount: entry.balanceAfter.toString(),
      balanceAfterCurrency: entry.balanceAfter.currency,
      createdAt: entry.createdAt,
    };
  }
}
