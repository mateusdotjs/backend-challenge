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
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';

import { InboxMessage } from '../../../domain/messaging/inbox-message.js';
import { WagerTransactionStatus } from '../../../domain/wagering/wager-transaction.enums.js';
import { type InboxRepositoryPort } from '../../../application/ports/repositories/inbox-repository.port.js';
import { type UnitOfWorkPort } from '../../../application/ports/unit-of-work.port.js';
import { type ClockPort } from '../../../application/ports/clock.port.js';
import { PayloadConflictError } from '../../../application/use-cases/wagering/wagering.errors.js';
import { ProcessWagerTransactionCommand } from '../../../application/use-cases/shared/use-case.types.js';
import { computePayloadHash } from '../../../application/use-cases/shared/payload-hash.js';
import {
  runWithLogContext,
  runWithLogContextAsync,
} from '../../logging/log-context.js';
import { StructuredLogger } from '../../logging/structured-logger.js';
import { MetricsService } from '../../metrics/metrics.service.js';
import {
  PROCESS_WAGER_TRANSACTION_ADAPTER,
  ProcessWagerTransactionAdapter,
} from '../../wagering/process-wager-transaction.adapter.js';

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
  correlationId?: string;
  data: ProcessWagerTransactionCommand;
}

@Injectable()
export class WagerTransactionConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new StructuredLogger(WagerTransactionConsumer.name);
  private stopped = false;
  private pollPromise: Promise<void> | null = null;

  constructor(
    @Inject(SQS_CLIENT) private readonly sqsClient: SQSClient,
    @Inject(INBOX_REPOSITORY) private readonly inboxRepo: InboxRepositoryPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWorkPort,
    @Inject(PROCESS_WAGER_TRANSACTION_ADAPTER)
    private readonly processWagerTransaction: ProcessWagerTransactionAdapter,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly metrics: MetricsService,
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
    this.logger.error('sqs_message_dlq', {
      reason,
      messageId: sqsMessage.MessageId,
    });
    this.metrics.incrementDlq();

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
      await runWithLogContextAsync(
        {
          correlationId: sqsMessage.MessageId,
          messageId: sqsMessage.MessageId,
        },
        () =>
          this.sendToDlq(
            sqsMessage,
            'invalid-message-body',
            sqsMessage.MessageId ?? randomUUID(),
          ),
      );
      return;
    }

    const correlationId =
      parsed.correlationId ?? parsed.messageId ?? sqsMessage.MessageId;

    await runWithLogContextAsync(
      {
        correlationId,
        messageId: parsed.messageId,
        walletId: parsed.data.walletId,
        providerId: parsed.data.providerId,
      },
      () => this.processParsedMessage(sqsMessage, parsed),
    );
  }

  private async processParsedMessage(
    sqsMessage: Message,
    parsed: SqsWagerTransactionMessage,
  ): Promise<void> {
    const receiveCount = Number(
      sqsMessage.Attributes?.['ApproximateReceiveCount'] ?? '1',
    );
    if (receiveCount > 1) {
      this.logger.log('sqs_message_retry', {
        messageId: parsed.messageId,
        receiveCount,
      });
      this.metrics.incrementRetry();
    }

    this.logger.log('sqs_message_received', {
      messageId: parsed.messageId,
    });

    const payloadHash = computePayloadHash(parsed.data);
    let outcome: 'duplicate' | 'processed' | 'rejected' | undefined;
    let transactionId: string | undefined;
    const startedAt = performance.now();

    try {
      await this.uow.runInTransaction(async () => {
        const existing = await this.inboxRepo.findByMessageId(
          CONSUMER_NAME,
          parsed.messageId,
        );

        if (existing?.isProcessed()) {
          if (existing.payloadHash !== payloadHash) {
            throw new PayloadConflictError(parsed.messageId);
          }
          outcome = 'duplicate';
          return;
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
                outcome = 'duplicate';
                return;
              }
            }
            throw error;
          }
        }

        const result =
          await this.processWagerTransaction.executeWithinTransaction(
            parsed.data,
          );
        transactionId = result.transactionId;

        inbox.markProcessed(this.clock.now());
        await this.inboxRepo.save(inbox);

        outcome =
          result.status === WagerTransactionStatus.Rejected
            ? 'rejected'
            : 'processed';
      });

      await this.sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: process.env['SQS_WAGER_TRANSACTIONS_QUEUE_URL'],
          ReceiptHandle: sqsMessage.ReceiptHandle,
        }),
      );

      if (outcome === 'duplicate') {
        this.metrics.incrementDuplicate();
        this.logger.log('sqs_message_duplicate', {
          messageId: parsed.messageId,
        });
      } else if (outcome === 'rejected') {
        this.logger.log('sqs_message_processed', {
          messageId: parsed.messageId,
          transactionId,
          status: WagerTransactionStatus.Rejected,
        });
      } else if (outcome === 'processed') {
        this.logger.log('sqs_message_processed', {
          messageId: parsed.messageId,
          transactionId,
        });
      }
    } catch (err) {
      if (err instanceof PayloadConflictError) {
        await this.sendToDlq(
          sqsMessage,
          `inbox-payload-conflict:messageId=${parsed.messageId}`,
          parsed.data.idempotencyKey,
        );
      } else {
        this.logger.error(
          'sqs_message_processing_failed',
          { messageId: parsed.messageId },
          err,
        );
        this.metrics.incrementRetry();

        const maxReceiveCount = Number(
          process.env['SQS_MAX_RECEIVE_COUNT'] ?? 5,
        );
        if (receiveCount >= maxReceiveCount) {
          await this.uow
            .runInTransaction(() =>
              this.processWagerTransaction.failTransactionIfExistsWithinTransaction(
                parsed.data.providerId,
                parsed.data.idempotencyKey,
              ),
            )
            .catch((failErr) => {
              this.logger.error(
                'sqs_mark_failed_error',
                { messageId: parsed.messageId },
                failErr,
              );
            });
        }
      }
    } finally {
      const seconds = (performance.now() - startedAt) / 1000;
      this.metrics.recordWagerProcessingDuration(seconds);
    }
  }
}
