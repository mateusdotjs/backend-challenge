import type { INestApplication } from '@nestjs/common';
import type { Message } from '@aws-sdk/client-sqs';

import type { ProcessWagerTransactionCommand } from '../../src/application/use-cases/shared/use-case.types.js';
import { PROCESS_WAGER_TRANSACTION_ADAPTER } from '../../src/infrastructure/wagering/process-wager-transaction.adapter.js';
import { MetricsService } from '../../src/infrastructure/metrics/metrics.service.js';
import { OutboxBacklogProbe } from '../../src/infrastructure/metrics/outbox-backlog.probe.js';
import { WagerTransactionConsumer } from '../../src/infrastructure/messaging/sqs/wager-transaction.consumer.js';
import { OutboxPublisherWorker } from '../../src/infrastructure/messaging/sqs/outbox-publisher.worker.js';
import { PendingReferenceWorker } from '../../src/infrastructure/messaging/sqs/pending-reference.worker.js';
import { SQS_CLIENT } from '../../src/infrastructure/messaging/sqs/sqs.client.js';
import { EVENT_PUBLISHER } from '../../src/infrastructure/messaging/sqs/sqs-event.publisher.js';
import {
  INBOX_REPOSITORY,
  OUTBOX_REPOSITORY,
  UNIT_OF_WORK,
  WAGER_TRANSACTION_REPOSITORY,
} from '../../src/infrastructure/persistence/mikro-orm/mikro-orm.module.js';
import { CLOCK } from '../../src/infrastructure/clock/system-clock.js';

function createConsumer(app: INestApplication): WagerTransactionConsumer {
  return new WagerTransactionConsumer(
    app.get(SQS_CLIENT),
    app.get(INBOX_REPOSITORY),
    app.get(UNIT_OF_WORK),
    app.get(PROCESS_WAGER_TRANSACTION_ADAPTER),
    app.get(CLOCK),
    app.get(MetricsService),
  );
}

function createOutboxWorker(app: INestApplication): OutboxPublisherWorker {
  return new OutboxPublisherWorker(
    app.get(OUTBOX_REPOSITORY),
    app.get(UNIT_OF_WORK),
    app.get(EVENT_PUBLISHER),
    app.get(CLOCK),
    app.get(MetricsService),
    app.get(OutboxBacklogProbe),
  );
}

function createPendingReferenceWorker(
  app: INestApplication,
): PendingReferenceWorker {
  return new PendingReferenceWorker(
    app.get(WAGER_TRANSACTION_REPOSITORY),
    app.get(UNIT_OF_WORK),
    app.get(PROCESS_WAGER_TRANSACTION_ADAPTER),
    app.get(CLOCK),
    app.get(MetricsService),
  );
}

async function invokeRawMessage(
  app: INestApplication,
  message: Message,
): Promise<void> {
  const consumer = createConsumer(app);
  await (
    consumer as unknown as {
      handleMessage(msg: Message): Promise<void>;
    }
  ).handleMessage(message);
}

export async function invokeConsumerMessage(
  app: INestApplication,
  messageId: string,
  data: ProcessWagerTransactionCommand,
  receiptHandle = `receipt-${messageId}-${Date.now()}`,
): Promise<void> {
  await invokeRawMessage(app, {
    Body: JSON.stringify({
      messageId,
      type: 'WagerTransactionRequested',
      occurredAt: new Date().toISOString(),
      data,
    }),
    ReceiptHandle: receiptHandle,
    MessageId: messageId,
    Attributes: { MessageGroupId: data.walletId },
  });
}

export async function invokeInvalidConsumerMessage(
  app: INestApplication,
  body: string,
  messageId: string,
): Promise<void> {
  await invokeRawMessage(app, {
    Body: body,
    ReceiptHandle: `receipt-${messageId}`,
    MessageId: messageId,
    Attributes: { MessageGroupId: 'default' },
  });
}

export async function runOutboxPublisherOnce(
  app: INestApplication,
): Promise<void> {
  const worker = createOutboxWorker(app);
  await (
    worker as unknown as { pollOnce(): Promise<void> }
  ).pollOnce();
}

export async function runPendingReferenceWorkerOnce(
  app: INestApplication,
): Promise<void> {
  const worker = createPendingReferenceWorker(app);
  await (
    worker as unknown as { pollOnce(): Promise<void> }
  ).pollOnce();
}
