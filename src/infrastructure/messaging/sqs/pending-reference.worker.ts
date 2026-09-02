import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';

import { FailureCode } from '../../../domain/shared/failure-code.js';
import { WagerTransactionStatus } from '../../../domain/wagering/wager-transaction.enums.js';
import { type WagerTransactionRepositoryPort } from '../../../application/ports/repositories/wager-transaction-repository.port.js';
import { type UnitOfWorkPort } from '../../../application/ports/unit-of-work.port.js';
import { type ClockPort } from '../../../application/ports/clock.port.js';
import { runWithLogContextAsync } from '../../logging/log-context.js';
import { StructuredLogger } from '../../logging/structured-logger.js';
import { MetricsService } from '../../metrics/metrics.service.js';
import { isWalletConcurrencyError } from '../../metrics/wallet-concurrency.js';
import {
  PROCESS_WAGER_TRANSACTION_ADAPTER,
  ProcessWagerTransactionAdapter,
} from '../../wagering/process-wager-transaction.adapter.js';

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
  private readonly logger = new StructuredLogger(PendingReferenceWorker.name);
  private stopped = false;
  private pollPromise: Promise<void> | null = null;

  constructor(
    @Inject(WAGER_TRANSACTION_REPOSITORY)
    private readonly wagerTxRepo: WagerTransactionRepositoryPort,
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
    const batchSize = Number(process.env['PENDING_REFERENCE_BATCH_SIZE'] ?? 10);
    const pollIntervalMs = Number(
      process.env['PENDING_REFERENCE_POLL_INTERVAL_MS'] ?? 5000,
    );
    const now = this.clock.now();
    let processed = 0;

    while (!this.stopped && processed < batchSize) {
      let transactionId: string | undefined;
      let walletId: string | undefined;
      let providerId: string | undefined;

      try {
        const didWork = await this.uow.runInTransaction(async () => {
          const transactions = await this.wagerTxRepo.findPendingReference({
            limit: 1,
            now,
          });

          if (transactions.length === 0) {
            return false;
          }

          const tx = transactions[0];
          transactionId = tx.id;
          walletId = tx.walletId;
          providerId = tx.providerId;
          const statusBefore = tx.status;

          await runWithLogContextAsync(
            {
              transactionId: tx.id,
              walletId: tx.walletId,
              providerId: tx.providerId,
            },
            () =>
              this.processWagerTransaction.reprocessPendingReferenceWithinTransaction(
                tx.id,
              ),
          );

          const updated = await this.wagerTxRepo.findById(tx.id);
          if (updated) {
            this.recordOutcome(statusBefore, updated);
          }

          return true;
        });

        if (!didWork) {
          break;
        }

        processed++;
      } catch (err) {
        this.logger.error(
          'pending_reference_processing_failed',
          { transactionId, walletId, providerId },
          err,
        );
        if (isWalletConcurrencyError(err)) {
          this.metrics.incrementLockConflict();
          this.logger.warn('wallet_concurrency_conflict', {
            transactionId,
            walletId,
            providerId,
          });
        }
        throw err;
      }
    }

    if (processed === 0) {
      await this.interruptibleSleep(pollIntervalMs);
    }
  }

  private recordOutcome(
    statusBefore: WagerTransactionStatus,
    updated: {
      id: string;
      walletId: string;
      providerId: string;
      status: WagerTransactionStatus;
      failureCode?: FailureCode;
    },
  ): void {
    const fields = {
      transactionId: updated.id,
      walletId: updated.walletId,
      providerId: updated.providerId,
    };

    if (
      updated.status === WagerTransactionStatus.PendingReference &&
      statusBefore === WagerTransactionStatus.PendingReference
    ) {
      this.logger.log('pending_reference_retry', fields);
      this.metrics.incrementRetry();
      return;
    }

    if (updated.status === WagerTransactionStatus.Processed) {
      this.logger.log('pending_reference_resolved', fields);
      return;
    }

    if (
      updated.status === WagerTransactionStatus.Rejected &&
      updated.failureCode === FailureCode.ReferenceNotFound
    ) {
      this.logger.log('pending_reference_exhausted', {
        ...fields,
        failureCode: updated.failureCode,
      });
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
