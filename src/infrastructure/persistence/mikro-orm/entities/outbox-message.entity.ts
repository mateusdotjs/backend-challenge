import { type InferEntity, defineEntity, p } from '@mikro-orm/core';

export const OutboxMessageEntity = defineEntity({
  name: 'OutboxMessage',
  properties: {
    id: p.uuid().primary(),
    aggregateId: p.string(),
    eventType: p.string(),
    payload: p.json<Record<string, unknown>>(),
    occurredAt: p.datetime(),
    attempts: p.integer(),
    nextAttemptAt: p.datetime().nullable(),
    publishedAt: p.datetime().nullable(),
  },
});

export type IOutboxMessage = InferEntity<typeof OutboxMessageEntity>;
