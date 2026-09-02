import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';

import { OutboxMessage } from '../../../domain/messaging/outbox-message.js';
import { type OutboxRepositoryPort } from '../../../application/ports/repositories/outbox-repository.port.js';
import { type UnitOfWorkPort } from '../../../application/ports/unit-of-work.port.js';
import { type EventPublisherPort } from '../../../application/ports/event-publisher.port.js';
import { type ClockPort } from '../../../application/ports/clock.port.js';
import { runWithLogContextAsync } from '../../logging/log-context.js';
import { StructuredLogger } from '../../logging/structured-logger.js';
import { MetricsService } from '../../metrics/metrics.service.js';
import { OutboxBacklogProbe } from '../../metrics/outbox-backlog.probe.js';

import {
  OUTBOX_REPOSITORY,
  UNIT_OF_WORK,
} from '../../persistence/mikro-orm/mikro-orm.module.js';
import { CLOCK } from '../../clock/system-clock.js';

import { EVENT_PUBLISHER } from './sqs-event.publisher.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class OutboxPublisherWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new StructuredLogger(OutboxPublisherWorker.name);
  private stopped = false;
  private pollPromise: Promise<void> | null = null;

  constructor(
    @Inject(OUTBOX_REPOSITORY)
    private readonly outboxRepo: OutboxRepositoryPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWorkPort,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisherPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly metrics: MetricsService,
    private readonly outboxBacklog: OutboxBacklogProbe,
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
      try {
        await this.pollOnce();
      } catch (err) {
        this.logger.error('outbox_poll_failed', {}, err);
        const pollIntervalMs = Number(
          process.env['OUTBOX_POLL_INTERVAL_MS'] ?? 1000,
        );
        await this.interruptibleSleep(pollIntervalMs);
      }
    }
  }

  private async pollOnce(): Promise<void> {
    const batchSize = Number(process.env['OUTBOX_BATCH_SIZE'] ?? 10);
    const pollIntervalMs = Number(process.env['OUTBOX_POLL_INTERVAL_MS'] ?? 1000);
    const now = this.clock.now();

    await this.outboxBacklog.refresh();

    const messages = await this.uow.runInTransaction(async () =>
      this.outboxRepo.findPending({ limit: batchSize, now }),
    );

    if (messages.length === 0) {
      await this.interruptibleSleep(pollIntervalMs);
      return;
    }

    for (const message of messages) {
      if (this.stopped) {
        break;
      }
      await this.processMessage(message);
    }
  }

  private async processMessage(message: OutboxMessage): Promise<void> {
    const fields = outboxLogFields(message);

    await runWithLogContextAsync(
      {
        correlationId:
          typeof fields.correlationId === 'string'
            ? fields.correlationId
            : undefined,
        transactionId:
          typeof fields.transactionId === 'string'
            ? fields.transactionId
            : undefined,
      },
      () => this.publishMessage(message, fields),
    );
  }

  private async publishMessage(
    message: OutboxMessage,
    fields: Record<string, unknown>,
  ): Promise<void> {
    const eventType = message.eventType;
    const now = this.clock.now();

    this.metrics.incrementOutboxPublishAttempt(eventType);
    this.logger.log('outbox_publish_attempt', fields);

    try {
      await this.eventPublisher.publish(message);
      message.markPublished(now);
      this.metrics.incrementOutboxPublished(eventType);
      this.logger.log('outbox_published', fields);
    } catch (err) {
      this.metrics.incrementOutboxPublishFailed(eventType);
      message.scheduleRetry(now);
      this.metrics.incrementOutboxPublishRetry(eventType);
      this.logger.error('outbox_publish_failed', fields, err);
    }

    await this.uow.runInTransaction(async () => {
      await this.outboxRepo.save(message);
    });

    await this.outboxBacklog.refresh();
  }

  private async interruptibleSleep(ms: number): Promise<void> {
    const stepMs = 100;
    let remaining = ms;

    while (remaining > 0 && !this.stopped) {
      const waitMs = Math.min(stepMs, remaining);
      await sleep(waitMs);
      remaining -= waitMs;
    }
  }
}

function outboxLogFields(message: OutboxMessage): Record<string, unknown> {
  const payload = message.payload;
  const data = payload['data'];
  const transactionId =
    data !== null &&
    typeof data === 'object' &&
    'transactionId' in data &&
    typeof (data as { transactionId?: unknown }).transactionId === 'string'
      ? (data as { transactionId: string }).transactionId
      : undefined;

  return {
    outboxId: message.id,
    eventType: message.eventType,
    correlationId:
      typeof payload['correlationId'] === 'string'
        ? payload['correlationId']
        : undefined,
    transactionId,
  };
}
