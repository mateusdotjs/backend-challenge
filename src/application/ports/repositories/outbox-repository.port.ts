import { OutboxMessage } from '../../../domain/messaging/outbox-message.js';

export interface FindPendingOutboxMessagesParams {
  limit: number;
  now: Date;
}

export interface OutboxRepositoryPort {
  save(message: OutboxMessage): Promise<void>;

  /**
   * Return up to `params.limit` messages that are unpublished and whose
   * nextAttemptAt is null or at/before `params.now`.
   *
   * The adapter is responsible for ensuring that concurrent outbox workers
   * do not claim the same message (e.g. via SELECT FOR UPDATE SKIP LOCKED).
   */
  findPending(
    params: FindPendingOutboxMessagesParams,
  ): Promise<OutboxMessage[]>;
}
