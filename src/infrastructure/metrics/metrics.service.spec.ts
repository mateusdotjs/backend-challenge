import { describe, expect, it } from 'bun:test';

import { WagerTransactionStatus } from '../../domain/wagering/wager-transaction.enums.js';

import { MetricsService } from './metrics.service.js';

describe('MetricsService', () => {
  it('renders counters and histogram metrics in Prometheus format', () => {
    const metrics = new MetricsService();

    metrics.incrementWagerTransaction(WagerTransactionStatus.Processed);
    metrics.incrementWagerTransaction(WagerTransactionStatus.Rejected);
    metrics.incrementDuplicate();
    metrics.incrementRetry();
    metrics.incrementDlq();
    metrics.incrementLockConflict();
    metrics.recordWagerProcessingDuration(0.12);
    metrics.setOutboxPending(3);

    const rendered = metrics.render();

    expect(rendered).toContain('wager_transactions_total{status="PROCESSED"} 1');
    expect(rendered).toContain('wager_transactions_total{status="REJECTED"} 1');
    expect(rendered).toContain('wager_transaction_duplicates_total 1');
    expect(rendered).toContain('wager_transaction_retries_total 1');
    expect(rendered).toContain('wager_messages_dlq_total 1');
    expect(rendered).toContain('wallet_lock_conflicts_total 1');
    expect(rendered).toContain('outbox_pending_total 3');
    expect(rendered).toContain('wager_transaction_processing_duration_seconds_bucket');
    expect(rendered).not.toContain('transactionId=');
    expect(rendered).not.toContain('walletId=');
    expect(rendered).not.toContain('correlationId=');
  });
});
