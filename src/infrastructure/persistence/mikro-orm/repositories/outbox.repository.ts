import { Injectable } from '@nestjs/common';
import { EntityManager, LockMode } from '@mikro-orm/core';

import { OutboxMessage } from '../../../../domain/messaging/outbox-message.js';
import {
  OutboxRepositoryPort,
  FindPendingOutboxMessagesParams,
} from '../../../../application/ports/repositories/outbox-repository.port.js';
import {
  OutboxMessageEntity,
  IOutboxMessage,
} from '../entities/outbox-message.entity.js';

@Injectable()
export class OutboxMikroOrmRepository implements OutboxRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  async save(message: OutboxMessage): Promise<void> {
    await this.em.upsert(OutboxMessageEntity, this.toPersistence(message));
  }

  async findPending(
    params: FindPendingOutboxMessagesParams,
  ): Promise<OutboxMessage[]> {
    const entities = await this.em.find(
      OutboxMessageEntity,
      {
        publishedAt: null,
        $or: [
          { nextAttemptAt: null },
          { nextAttemptAt: { $lte: params.now } },
        ],
      },
      {
        lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE,
        limit: params.limit,
        orderBy: { occurredAt: 'asc' },
      },
    );
    return entities.map((e) => this.toDomain(e));
  }

  private toDomain(entity: IOutboxMessage): OutboxMessage {
    return OutboxMessage.rehydrate({
      id: entity.id,
      aggregateId: entity.aggregateId,
      eventType: entity.eventType,
      payload: entity.payload,
      occurredAt: entity.occurredAt,
      attempts: entity.attempts,
      nextAttemptAt: entity.nextAttemptAt ?? undefined,
      publishedAt: entity.publishedAt ?? undefined,
    });
  }

  private toPersistence(message: OutboxMessage): IOutboxMessage {
    return {
      id: message.id,
      aggregateId: message.aggregateId,
      eventType: message.eventType,
      payload: message.payload as Record<string, unknown>,
      occurredAt: message.occurredAt,
      attempts: message.attempts,
      nextAttemptAt: message.nextAttemptAt ?? null,
      publishedAt: message.publishedAt ?? null,
    };
  }
}
