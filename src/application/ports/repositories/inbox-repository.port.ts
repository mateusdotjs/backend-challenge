import { InboxMessage } from '../../../domain/messaging/inbox-message.js';

export interface InboxRepositoryPort {
  /**
   * Return the inbox message for a given consumer and SQS message identifier,
   * or null if it has not been seen before.
   *
   * The uniqueness guarantee (concurrent inserts for the same key must not
   * both succeed) is enforced by a database unique constraint in the adapter,
   * not by a prior read in the application layer.
   */
  findByMessageId(
    consumerName: string,
    messageId: string,
  ): Promise<InboxMessage | null>;

  save(message: InboxMessage): Promise<void>;
}
