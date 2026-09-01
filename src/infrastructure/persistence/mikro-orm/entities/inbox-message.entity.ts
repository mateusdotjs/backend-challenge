import { type InferEntity, defineEntity, p } from '@mikro-orm/core';

export const InboxMessageEntity = defineEntity({
  name: 'InboxMessage',
  properties: {
    messageId: p.string().primary(),
    consumerName: p.string().primary(),
    payloadHash: p.string(),
    receivedAt: p.datetime(),
    processedAt: p.datetime().nullable(),
  },
});

export type IInboxMessage = InferEntity<typeof InboxMessageEntity>;
