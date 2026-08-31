import { OutboxMessage } from '../../domain/messaging/outbox-message.js';

export interface EventPublisherPort {
  /**
   * Publish a persisted outbox message to the broker.
   *
   * The outbox worker use case calls this after loading an OutboxMessage from
   * the database. The adapter uses message.eventType for routing and
   * message.payload as the message body — the application layer does not
   * know the destination is SQS.
   */
  publish(message: OutboxMessage): Promise<void>;
}
