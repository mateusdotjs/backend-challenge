import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';

import { InboxMessage } from '../../../../domain/messaging/inbox-message.js';
import { InboxRepositoryPort } from '../../../../application/ports/repositories/inbox-repository.port.js';
import { InboxMessageEntity, IInboxMessage } from '../entities/inbox-message.entity.js';

@Injectable()
export class InboxMikroOrmRepository implements InboxRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  async findByMessageId(
    consumerName: string,
    messageId: string,
  ): Promise<InboxMessage | null> {
    const entity = await this.em.findOne(InboxMessageEntity, {
      messageId,
      consumerName,
    });
    return entity ? this.toDomain(entity) : null;
  }

  async save(message: InboxMessage): Promise<void> {
    await this.em.upsert(InboxMessageEntity, this.toPersistence(message));
  }

  private toDomain(entity: IInboxMessage): InboxMessage {
    return InboxMessage.rehydrate({
      messageId: entity.messageId,
      consumerName: entity.consumerName,
      payloadHash: entity.payloadHash,
      receivedAt: entity.receivedAt,
      processedAt: entity.processedAt ?? undefined,
    });
  }

  private toPersistence(message: InboxMessage): IInboxMessage {
    return {
      messageId: message.messageId,
      consumerName: message.consumerName,
      payloadHash: message.payloadHash,
      receivedAt: message.receivedAt,
      processedAt: message.processedAt ?? null,
    };
  }
}
