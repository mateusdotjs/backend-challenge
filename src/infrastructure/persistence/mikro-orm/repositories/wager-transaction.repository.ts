import { Injectable } from '@nestjs/common';
import { EntityManager, LockMode } from '@mikro-orm/core';

import { Money } from '../../../../domain/shared/money/money.js';
import { WagerTransaction } from '../../../../domain/wagering/wager-transaction.js';
import { WagerTransactionStatus } from '../../../../domain/wagering/wager-transaction.enums.js';
import {
  WagerTransactionRepositoryPort,
  FindPendingReferenceParams,
} from '../../../../application/ports/repositories/wager-transaction-repository.port.js';
import {
  WagerTransactionEntity,
  IWagerTransaction,
} from '../entities/wager-transaction.entity.js';

@Injectable()
export class WagerTransactionMikroOrmRepository
  implements WagerTransactionRepositoryPort
{
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, { id });
    return entity ? this.toDomain(entity) : null;
  }

  async findByIdForUpdate(id: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(
      WagerTransactionEntity,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    return entity ? this.toDomain(entity) : null;
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, {
      idempotencyKey,
    });
    return entity ? this.toDomain(entity) : null;
  }

  async findByProviderAndExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, {
      providerId,
      externalTransactionId,
    });
    return entity ? this.toDomain(entity) : null;
  }

  async findPendingReference(
    params: FindPendingReferenceParams,
  ): Promise<WagerTransaction[]> {
    const entities = await this.em.find(
      WagerTransactionEntity,
      {
        status: WagerTransactionStatus.PendingReference,
        $or: [
          { nextReferenceAttemptAt: null },
          { nextReferenceAttemptAt: { $lte: params.now } },
        ],
      },
      {
        lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE,
        limit: params.limit,
        orderBy: { nextReferenceAttemptAt: 'asc' },
      },
    );
    return entities.map((e) => this.toDomain(e));
  }

  async findProcessedReversalByReferenceId(
    referenceTransactionId: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, {
      referenceTransactionId,
      status: WagerTransactionStatus.Processed,
    });
    return entity ? this.toDomain(entity) : null;
  }

  async save(wagerTransaction: WagerTransaction): Promise<void> {
    await this.em.upsert(
      WagerTransactionEntity,
      this.toPersistence(wagerTransaction),
    );
  }

  private toDomain(entity: IWagerTransaction): WagerTransaction {
    const observedBalance =
      entity.observedBalanceAmount != null &&
      entity.observedBalanceCurrency != null
        ? Money.from({
            amount: entity.observedBalanceAmount,
            currency: entity.observedBalanceCurrency,
          })
        : undefined;

    return WagerTransaction.rehydrate({
      id: entity.id,
      providerId: entity.providerId,
      externalTransactionId: entity.externalTransactionId,
      idempotencyKey: entity.idempotencyKey,
      payloadHash: entity.payloadHash,
      walletId: entity.walletId,
      playerId: entity.playerId,
      roundId: entity.roundId,
      gameId: entity.gameId,
      kind: entity.kind,
      money: Money.from({
        amount: entity.moneyAmount,
        currency: entity.moneyCurrency,
      }),
      referenceExternalTransactionId:
        entity.referenceExternalTransactionId ?? undefined,
      createdAt: entity.createdAt,
      status: entity.status,
      referenceTransactionId: entity.referenceTransactionId ?? undefined,
      failureCode: entity.failureCode ?? undefined,
      processedAt: entity.processedAt ?? undefined,
      observedBalance,
      referenceResolutionAttempts: entity.referenceResolutionAttempts,
      nextReferenceAttemptAt: entity.nextReferenceAttemptAt ?? undefined,
    });
  }

  private toPersistence(tx: WagerTransaction): IWagerTransaction {
    return {
      id: tx.id,
      providerId: tx.providerId,
      externalTransactionId: tx.externalTransactionId,
      idempotencyKey: tx.idempotencyKey,
      payloadHash: tx.payloadHash,
      walletId: tx.walletId,
      playerId: tx.playerId,
      roundId: tx.roundId,
      gameId: tx.gameId,
      kind: tx.kind,
      moneyAmount: tx.money.toString(),
      moneyCurrency: tx.money.currency,
      referenceExternalTransactionId:
        tx.referenceExternalTransactionId ?? null,
      status: tx.status,
      referenceTransactionId: tx.referenceTransactionId ?? null,
      failureCode: tx.failureCode ?? null,
      processedAt: tx.processedAt ?? null,
      observedBalanceAmount: tx.observedBalance?.toString() ?? null,
      observedBalanceCurrency: tx.observedBalance?.currency ?? null,
      referenceResolutionAttempts: tx.referenceResolutionAttempts,
      nextReferenceAttemptAt: tx.nextReferenceAttemptAt ?? null,
      createdAt: tx.createdAt,
    };
  }
}
