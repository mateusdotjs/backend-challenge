import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';

import { OutboxMessage } from '../../../domain/messaging/outbox-message.js';
import { type OutboxRepositoryPort } from '../../../application/ports/repositories/outbox-repository.port.js';
import { type UnitOfWorkPort } from '../../../application/ports/unit-of-work.port.js';
import { type EventPublisherPort } from '../../../application/ports/event-publisher.port.js';
import { type ClockPort } from '../../../application/ports/clock.port.js';

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
  private readonly logger = new Logger(OutboxPublisherWorker.name);
  private stopped = false;
  private pollPromise: Promise<void> | null = null;

  constructor(
    @Inject(OUTBOX_REPOSITORY)
    private readonly outboxRepo: OutboxRepositoryPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWorkPort,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisherPort,
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
    const batchSize = Number(process.env['OUTBOX_BATCH_SIZE'] ?? 10);
    const pollIntervalMs = Number(process.env['OUTBOX_POLL_INTERVAL_MS'] ?? 1000);
    const now = this.clock.now();

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
    const now = this.clock.now();

    try {
      await this.eventPublisher.publish(message);
      message.markPublished(now);
    } catch (err) {
      this.logger.error(
        `[OutboxPublisherWorker] SQS publish failed for outboxId="${message.id}" eventType="${message.eventType}"`,
        err instanceof Error ? err.stack : String(err),
      );
      message.scheduleRetry(now);
    }

    await this.uow.runInTransaction(async () => {
      await this.outboxRepo.save(message);
    });
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
