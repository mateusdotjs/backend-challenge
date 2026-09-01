import {
  GetQueueAttributesCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';

import type { ProcessWagerTransactionCommand } from '../../src/application/use-cases/shared/use-case.types.js';
import { applyTestEnv } from './test-env.js';

export function createTestSqsClient(): SQSClient {
  applyTestEnv();
  return new SQSClient({
    region: process.env['AWS_REGION'] ?? 'us-east-1',
    endpoint: process.env['AWS_ENDPOINT_URL'],
    credentials: {
      accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? 'test',
      secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? 'test',
    },
  });
}

export function wagerQueueUrl(): string {
  return process.env['SQS_WAGER_TRANSACTIONS_QUEUE_URL']!;
}

export function wagerDlqUrl(): string {
  return process.env['SQS_WAGER_TRANSACTIONS_DLQ_URL']!;
}

export function outboxEventsQueueUrl(): string {
  return process.env['SQS_OUTBOX_EVENTS_QUEUE_URL']!;
}

export async function purgeQueue(
  client: SQSClient,
  queueUrl: string,
): Promise<void> {
  await client.send(new PurgeQueueCommand({ QueueUrl: queueUrl }));
}

export async function purgeAllTestQueues(client: SQSClient): Promise<void> {
  await Promise.all([
    purgeQueue(client, wagerQueueUrl()),
    purgeQueue(client, wagerDlqUrl()),
    purgeQueue(client, outboxEventsQueueUrl()),
    purgeQueue(
      client,
      process.env['SQS_OUTBOX_EVENTS_DLQ_URL']!,
    ),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 500));
}

export async function sendWagerTransactionMessage(
  client: SQSClient,
  messageId: string,
  data: ProcessWagerTransactionCommand,
  messageGroupId = data.walletId,
): Promise<void> {
  await client.send(
    new SendMessageCommand({
      QueueUrl: wagerQueueUrl(),
      MessageBody: JSON.stringify({
        messageId,
        type: 'WagerTransactionRequested',
        occurredAt: new Date().toISOString(),
        data,
      }),
      MessageGroupId: messageGroupId,
      MessageDeduplicationId: `${messageId}-${Date.now()}-${Math.random()}`,
    }),
  );
}

export async function receiveMessages(
  client: SQSClient,
  queueUrl: string,
  maxMessages = 10,
): Promise<number> {
  const result = await client.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: 1,
    }),
  );
  return result.Messages?.length ?? 0;
}

export async function getQueueMessageCount(
  client: SQSClient,
  queueUrl: string,
): Promise<number> {
  const result = await client.send(
    new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages'],
    }),
  );
  return Number(result.Attributes?.['ApproximateNumberOfMessages'] ?? 0);
}
