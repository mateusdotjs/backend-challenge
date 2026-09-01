import { randomUUID } from 'crypto';
import {
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';

import { InboxMessage } from '../../../domain/messaging/inbox-message.js';
import { type InboxRepositoryPort } from '../../../application/ports/repositories/inbox-repository.port.js';
import { type UnitOfWorkPort } from '../../../application/ports/unit-of-work.port.js';
import { type ClockPort } from '../../../application/ports/clock.port.js';
import { ProcessWagerTransactionUseCase } from '../../../application/use-cases/wagering/process-wager-transaction.use-case.js';
import { PayloadConflictError } from '../../../application/use-cases/wagering/process-wager-transaction.use-case.js';
import { ProcessWagerTransactionCommand } from '../../../application/use-cases/shared/use-case.types.js';
import { computePayloadHash } from '../../../application/use-cases/shared/payload-hash.js';

import { SQS_CLIENT } from './sqs.client.js';
import {
  INBOX_REPOSITORY,
  UNIT_OF_WORK,
} from '../../persistence/mikro-orm/mikro-orm.module.js';
import { CLOCK } from '../../clock/system-clock.js';

const CONSUMER_NAME = 'wager-transaction-consumer';

interface SqsWagerTransactionMessage {
  messageId: string;
  type: string;
  data: ProcessWagerTransactionCommand;
}

@Injectable()
export class WagerTransactionConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(WagerTransactionConsumer.name);
  private stopped = false;
  private pollPromise: Promise<void> | null = null;

  constructor(
    @Inject(SQS_CLIENT) private readonly sqsClient: SQSClient,
    @Inject(INBOX_REPOSITORY) private readonly inboxRepo: InboxRepositoryPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWorkPort,
    private readonly processWagerTransaction: ProcessWagerTransactionUseCase,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  onApplicationBootstrap(): void {
    this.pollPromise = this.startPolling();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.pollPromise) {
      await this.pollPromise;
    }
  }

  private async startPolling(): Promise<void> {
    while (!this.stopped) {
      await this.pollOnce();
    }
  }

  private async pollOnce(): Promise<void> {
    const result = await this.sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: process.env['SQS_WAGER_TRANSACTIONS_QUEUE_URL'],
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20,
        ReceiveRequestAttemptId: randomUUID(),
        AttributeNames: ['All'],
      }),
    );

    for (const message of result.Messages ?? []) {
      await this.handleMessage(message);
    }
  }

  private async sendToDlq(
    sqsMessage: Message,
    reason: string,
    deduplicationId: string,
  ): Promise<void> {
    this.logger.error(
      `[${CONSUMER_NAME}] Routing to DLQ — reason="${reason}" sqsMessageId="${sqsMessage.MessageId}"`,
    );
    await this.sqsClient.send(
      new SendMessageCommand({
        QueueUrl: process.env['SQS_WAGER_TRANSACTIONS_DLQ_URL'],
        MessageBody: sqsMessage.Body ?? '',
        MessageGroupId:
          sqsMessage.Attributes?.['MessageGroupId'] ?? 'default',
        MessageDeduplicationId: deduplicationId,
      }),
    );
    await this.sqsClient.send(
      new DeleteMessageCommand({
        QueueUrl: process.env['SQS_WAGER_TRANSACTIONS_QUEUE_URL'],
        ReceiptHandle: sqsMessage.ReceiptHandle,
      }),
    );
  }

  private async handleMessage(sqsMessage: Message): Promise<void> {
    let parsed: SqsWagerTransactionMessage;
    try {
      parsed = JSON.parse(sqsMessage.Body ?? '') as SqsWagerTransactionMessage;
    } catch {
      // Permanent error — message will never parse. Route directly to DLQ.
      // sqsMessage.MessageId is the SQS-assigned ID, used as deduplication key
      // since the body cannot be parsed to extract a business idempotency key.
      await this.sendToDlq(
        sqsMessage,
        'invalid-message-body',
        sqsMessage.MessageId ?? randomUUID(),
      );
      return;
    }

    const payloadHash = computePayloadHash(parsed.data);

    try {
      await this.uow.runInTransaction(async () => {
        const existing = await this.inboxRepo.findByMessageId(
          CONSUMER_NAME,
          parsed.messageId,
        );

        if (existing?.isProcessed()) {
          if (existing.payloadHash !== payloadHash) {
            // same messageId, different payload — permanent conflict, not a replay.
            // Throw to abort the transaction; outer catch routes to DLQ.
            throw new PayloadConflictError(parsed.messageId);
          }
          return; // genuine replay — ACK
        }

        const inbox = existing ?? InboxMessage.receive({
          messageId: parsed.messageId,
          consumerName: CONSUMER_NAME,
          payloadHash,
          receivedAt: this.clock.now(),
        });

        if (!existing) {
          try {
            await this.inboxRepo.save(inbox);
          } catch (error) {
            if (error instanceof UniqueConstraintViolationException) {
              const constraint = (
                error.cause as { constraint?: string } | undefined
              )?.constraint;
              if (constraint === 'inbox_message_pkey') {
                // concurrent instance won the race — commit no-op, ACK
                return;
              }
            }
            throw error;
          }
        }

        await this.processWagerTransaction.execute(parsed.data);

        inbox.markProcessed(this.clock.now());
        await this.inboxRepo.save(inbox);
      });

      await this.sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: process.env['SQS_WAGER_TRANSACTIONS_QUEUE_URL'],
          ReceiptHandle: sqsMessage.ReceiptHandle,
        }),
      );
    } catch (err) {
      if (err instanceof PayloadConflictError) {
        // Permanent conflict — route directly to DLQ and ACK the original message.
        await this.sendToDlq(
          sqsMessage,
          `inbox-payload-conflict:messageId=${parsed.messageId}`,
          parsed.data.idempotencyKey,
        );
      } else {
        // Transient or unknown error — do not ACK. Visibility timeout expires,
        // SQS redelivers, and the message goes to the DLQ after maxReceiveCount.
        this.logger.error(
          `[${CONSUMER_NAME}] Processing failed for SQS messageId="${sqsMessage.MessageId}"`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }
}
