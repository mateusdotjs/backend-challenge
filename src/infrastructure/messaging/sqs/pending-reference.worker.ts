import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';

import { type WagerTransactionRepositoryPort } from '../../../application/ports/repositories/wager-transaction-repository.port.js';
import { type UnitOfWorkPort } from '../../../application/ports/unit-of-work.port.js';
import { type ClockPort } from '../../../application/ports/clock.port.js';
import { ProcessWagerTransactionUseCase } from '../../../application/use-cases/wagering/process-wager-transaction.use-case.js';

import {
  UNIT_OF_WORK,
  WAGER_TRANSACTION_REPOSITORY,
} from '../../persistence/mikro-orm/mikro-orm.module.js';
import { CLOCK } from '../../clock/system-clock.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class PendingReferenceWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private stopped = false;
  private pollPromise: Promise<void> | null = null;

  constructor(
    @Inject(WAGER_TRANSACTION_REPOSITORY)
    private readonly wagerTxRepo: WagerTransactionRepositoryPort,
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
    const batchSize = Number(process.env['PENDING_REFERENCE_BATCH_SIZE'] ?? 10);
    const pollIntervalMs = Number(
      process.env['PENDING_REFERENCE_POLL_INTERVAL_MS'] ?? 5000,
    );
    const now = this.clock.now();
    let processed = 0;

    while (!this.stopped && processed < batchSize) {
      const didWork = await this.uow.runInTransaction(async () => {
        const transactions = await this.wagerTxRepo.findPendingReference({
          limit: 1,
          now,
        });

        if (transactions.length === 0) {
          return false;
        }

        await this.processWagerTransaction.reprocessPendingReferenceWithinTransaction(
          transactions[0].id,
        );

        return true;
      });

      if (!didWork) {
        break;
      }

      processed++;
    }

    if (processed === 0) {
      await this.interruptibleSleep(pollIntervalMs);
    }
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
