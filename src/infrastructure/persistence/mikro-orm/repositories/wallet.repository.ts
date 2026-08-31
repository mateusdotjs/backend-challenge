import { Injectable } from '@nestjs/common';
import { EntityManager, LockMode } from '@mikro-orm/core';

import { Money } from '../../../../domain/shared/money/money.js';
import { Wallet } from '../../../../domain/wallet/wallet.js';
import { WalletRepositoryPort } from '../../../../application/ports/repositories/wallet-repository.port.js';
import { WalletEntity, IWallet } from '../entities/wallet.entity.js';

@Injectable()
export class WalletMikroOrmRepository implements WalletRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletEntity, { id });
    return entity ? this.toDomain(entity) : null;
  }

  async findByIdForUpdate(id: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(
      WalletEntity,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    return entity ? this.toDomain(entity) : null;
  }

  async findByPlayerIdAndCurrency(
    playerId: string,
    currency: string,
  ): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletEntity, { playerId, currency });
    return entity ? this.toDomain(entity) : null;
  }

  async save(wallet: Wallet): Promise<void> {
    await this.em.upsert(WalletEntity, this.toPersistence(wallet));
  }

  private toDomain(entity: IWallet): Wallet {
    return Wallet.rehydrate({
      id: entity.id,
      playerId: entity.playerId,
      currency: entity.currency,
      balance: Money.from({
        amount: entity.balanceAmount,
        currency: entity.currency,
      }),
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  private toPersistence(wallet: Wallet): IWallet {
    return {
      id: wallet.id,
      playerId: wallet.playerId,
      currency: wallet.currency,
      balanceAmount: wallet.balance.toString(),
      version: wallet.version,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }
}
