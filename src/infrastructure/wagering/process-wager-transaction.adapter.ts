import { Injectable } from '@nestjs/common';

import { ProcessWagerTransactionUseCase } from '../../application/use-cases/wagering/process-wager-transaction.use-case.js';
import { PayloadConflictError } from '../../application/use-cases/wagering/process-wager-transaction.use-case.js';
import {
  ProcessWagerTransactionCommand,
  ProcessTransactionResultDto,
} from '../../application/use-cases/shared/use-case.types.js';
import { WagerTransactionStatus } from '../../domain/wagering/wager-transaction.enums.js';
import { getLogContext, updateLogContext } from '../logging/log-context.js';
import { StructuredLogger } from '../logging/structured-logger.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { isWalletConcurrencyError } from '../metrics/wallet-concurrency.js';

export const PROCESS_WAGER_TRANSACTION_ADAPTER =
  'ProcessWagerTransactionAdapter';

@Injectable()
export class ProcessWagerTransactionAdapter {
  private readonly logger = new StructuredLogger(
    ProcessWagerTransactionAdapter.name,
  );

  constructor(
    private readonly processWagerTransaction: ProcessWagerTransactionUseCase,
    private readonly metrics: MetricsService,
  ) {}

  async execute(
    command: ProcessWagerTransactionCommand,
  ): Promise<ProcessTransactionResultDto> {
    return this.runWithInstrumentation(command, () =>
      this.processWagerTransaction.execute(command),
    );
  }

  async executeWithinTransaction(
    command: ProcessWagerTransactionCommand,
  ): Promise<ProcessTransactionResultDto> {
    return this.runWithInstrumentation(command, () =>
      this.processWagerTransaction.executeWithinTransaction(command),
    );
  }

  reprocessPendingReferenceWithinTransaction(
    transactionId: string,
  ): Promise<void> {
    return this.processWagerTransaction.reprocessPendingReferenceWithinTransaction(
      transactionId,
    );
  }

  failTransactionIfExistsWithinTransaction(
    providerId: string,
    idempotencyKey: string,
  ): Promise<void> {
    return this.processWagerTransaction.failTransactionIfExistsWithinTransaction(
      providerId,
      idempotencyKey,
    );
  }

  private async runWithInstrumentation(
    command: ProcessWagerTransactionCommand,
    work: () => Promise<ProcessTransactionResultDto>,
  ): Promise<ProcessTransactionResultDto> {
    updateLogContext({
      walletId: command.walletId,
      providerId: command.providerId,
    });

    const startedAt = performance.now();

    try {
      const result = await work();
      updateLogContext({ transactionId: result.transactionId });

      this.metrics.incrementWagerTransaction(result.status);
      if (result.idempotentReplay) {
        this.metrics.incrementDuplicate();
      }

      this.recordOutcomeLogs(result);
      return result;
    } catch (err) {
      if (isWalletConcurrencyError(err)) {
        this.metrics.incrementLockConflict();
        this.logger.warn('wallet_concurrency_conflict', {
          walletId: command.walletId,
          providerId: command.providerId,
        });
      }

      if (!(err instanceof PayloadConflictError)) {
        this.logger.error(
          'wager_transaction_processing_failed',
          {
            walletId: command.walletId,
            providerId: command.providerId,
          },
          err,
        );
      }

      throw err;
    } finally {
      const seconds = (performance.now() - startedAt) / 1000;
      this.metrics.recordWagerProcessingDuration(seconds);
    }
  }

  private recordOutcomeLogs(result: ProcessTransactionResultDto): void {
    if (result.idempotentReplay) {
      return;
    }

    const ctx = getLogContext();
    const fields = {
      transactionId: result.transactionId,
      walletId: ctx.walletId,
      providerId: ctx.providerId,
    };

    switch (result.status) {
      case WagerTransactionStatus.Processed:
        this.logger.log('wager_transaction_processed', fields);
        break;
      case WagerTransactionStatus.Rejected:
        this.logger.log('wager_transaction_rejected', fields);
        break;
      case WagerTransactionStatus.PendingReference:
        this.logger.log('wager_transaction_pending_reference', fields);
        break;
      default:
        break;
    }
  }
}
