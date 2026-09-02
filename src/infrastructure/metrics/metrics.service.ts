import { Injectable } from '@nestjs/common';

import { WagerTransactionStatus } from '../../domain/wagering/wager-transaction.enums.js';

import { PrometheusRegistry } from './prometheus-registry.js';

@Injectable()
export class MetricsService {
  private readonly registry = new PrometheusRegistry();

  incrementWagerTransaction(status: WagerTransactionStatus): void {
    this.registry.wagerTransactionsTotal.inc({ status });
  }

  incrementDuplicate(): void {
    this.registry.wagerTransactionDuplicatesTotal.inc();
  }

  incrementRetry(): void {
    this.registry.wagerTransactionRetriesTotal.inc();
  }

  incrementDlq(): void {
    this.registry.wagerMessagesDlqTotal.inc();
  }

  incrementLockConflict(): void {
    this.registry.walletLockConflictsTotal.inc();
  }

  recordWagerProcessingDuration(seconds: number): void {
    this.registry.wagerTransactionProcessingDuration.observe({}, seconds);
  }

  recordHttpDuration(method: string, route: string, seconds: number): void {
    this.registry.httpRequestDuration.observe({ method, route }, seconds);
  }

  setOutboxPending(count: number): void {
    this.registry.outboxPendingTotal.set({}, count);
  }

  incrementOutboxPublishAttempt(eventType: string): void {
    this.registry.outboxPublishAttemptsTotal.inc({ eventType });
  }

  incrementOutboxPublished(eventType: string): void {
    this.registry.outboxPublishedTotal.inc({ eventType });
  }

  incrementOutboxPublishFailed(eventType: string): void {
    this.registry.outboxPublishFailedTotal.inc({ eventType });
  }

  incrementOutboxPublishRetry(eventType: string): void {
    this.registry.outboxPublishRetriesTotal.inc({ eventType });
  }

  incrementReconciliationDivergence(walletId: string): void {
    this.registry.walletReconciliationDivergencesTotal.inc({ walletId });
  }

  render(): string {
    return this.registry.render();
  }
}
