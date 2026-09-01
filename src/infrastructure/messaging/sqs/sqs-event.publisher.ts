import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { Inject, Injectable } from '@nestjs/common';

import { OutboxMessage } from '../../../domain/messaging/outbox-message.js';
import { type EventPublisherPort } from '../../../application/ports/event-publisher.port.js';

import { SQS_CLIENT } from './sqs.client.js';

export const EVENT_PUBLISHER = 'EventPublisherPort';

@Injectable()
export class SqsEventPublisher implements EventPublisherPort {
  constructor(@Inject(SQS_CLIENT) private readonly sqsClient: SQSClient) {}

  async publish(message: OutboxMessage): Promise<void> {
    await this.sqsClient.send(
      new SendMessageCommand({
        QueueUrl: process.env['SQS_OUTBOX_EVENTS_QUEUE_URL'],
        MessageBody: JSON.stringify(message.payload),
        MessageGroupId: message.aggregateId,
        MessageDeduplicationId: message.id,
      }),
    );
  }
}
