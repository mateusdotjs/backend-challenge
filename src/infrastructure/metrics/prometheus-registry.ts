type Labels = Record<string, string>;

const DEFAULT_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

function labelKey(labels: Labels): string {
  return Object.keys(labels)
    .sort()
    .map((key) => `${key}=${labels[key]}`)
    .join('|');
}

function formatLabels(labels: Labels): string {
  const parts = Object.keys(labels)
    .sort()
    .map((key) => `${key}="${escapeLabel(labels[key]!)}"`);
  return parts.length > 0 ? `{${parts.join(',')}}` : '';
}

function escapeLabel(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
}

class Counter {
  private readonly values = new Map<string, { labels: Labels; value: number }>();

  constructor(
    readonly name: string,
    readonly help: string,
  ) {}

  inc(labels: Labels = {}, amount = 1): void {
    const key = labelKey(labels);
    const existing = this.values.get(key);
    if (existing) {
      existing.value += amount;
      return;
    }
    this.values.set(key, { labels, value: amount });
  }

  render(): string[] {
    const lines = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
    ];
    for (const { labels, value } of this.values.values()) {
      lines.push(`${this.name}${formatLabels(labels)} ${value}`);
    }
    return lines;
  }
}

class Gauge {
  private readonly values = new Map<string, { labels: Labels; value: number }>();

  constructor(
    readonly name: string,
    readonly help: string,
  ) {}

  set(labels: Labels, value: number): void {
    const key = labelKey(labels);
    this.values.set(key, { labels, value });
  }

  render(): string[] {
    const lines = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} gauge`,
    ];
    for (const { labels, value } of this.values.values()) {
      lines.push(`${this.name}${formatLabels(labels)} ${value}`);
    }
    return lines;
  }
}

class Histogram {
  private readonly values = new Map<
    string,
    {
      labels: Labels;
      buckets: Map<number, number>;
      sum: number;
      count: number;
    }
  >();

  constructor(
    readonly name: string,
    readonly help: string,
    private readonly buckets: number[] = DEFAULT_BUCKETS,
  ) {}

  observe(labels: Labels, value: number): void {
    const key = labelKey(labels);
    let entry = this.values.get(key);
    if (!entry) {
      entry = {
        labels,
        buckets: new Map(this.buckets.map((bucket) => [bucket, 0])),
        sum: 0,
        count: 0,
      };
      this.values.set(key, entry);
    }

    entry.sum += value;
    entry.count += 1;
    for (const bucket of this.buckets) {
      if (value <= bucket) {
        entry.buckets.set(bucket, (entry.buckets.get(bucket) ?? 0) + 1);
      }
    }
  }

  render(): string[] {
    const lines = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`,
    ];

    for (const entry of this.values.values()) {
      const base = formatLabels(entry.labels);
      for (const bucket of this.buckets) {
        const count = entry.buckets.get(bucket) ?? 0;
        const bucketLabels =
          base.length > 0
            ? base.replace('}', `,le="${bucket}"}`)
            : `{le="${bucket}"}`;
        lines.push(`${this.name}_bucket${bucketLabels} ${count}`);
      }
      lines.push(`${this.name}_sum${base} ${entry.sum}`);
      lines.push(`${this.name}_count${base} ${entry.count}`);
    }

    return lines;
  }
}

export class PrometheusRegistry {
  readonly wagerTransactionsTotal = new Counter(
    'wager_transactions_total',
    'Total wager transactions observed by status',
  );

  readonly wagerTransactionDuplicatesTotal = new Counter(
    'wager_transaction_duplicates_total',
    'Total idempotent duplicate wager transactions',
  );

  readonly wagerTransactionRetriesTotal = new Counter(
    'wager_transaction_retries_total',
    'Total wager transaction retries',
  );

  readonly wagerMessagesDlqTotal = new Counter(
    'wager_messages_dlq_total',
    'Total wager messages routed to DLQ',
  );

  readonly walletLockConflictsTotal = new Counter(
    'wallet_lock_conflicts_total',
    'Total wallet concurrency conflicts',
  );

  readonly wagerTransactionProcessingDuration = new Histogram(
    'wager_transaction_processing_duration_seconds',
    'Wager transaction processing duration in seconds',
  );

  readonly outboxPendingTotal = new Gauge(
    'outbox_pending_total',
    'Total pending outbox messages ready for publishing',
  );

  readonly outboxPublishAttemptsTotal = new Counter(
    'outbox_publish_attempts_total',
    'Total outbox publish attempts by event type',
  );

  readonly outboxPublishedTotal = new Counter(
    'outbox_published_total',
    'Total successfully published outbox messages by event type',
  );

  readonly outboxPublishFailedTotal = new Counter(
    'outbox_publish_failed_total',
    'Total failed outbox publish attempts by event type',
  );

  readonly outboxPublishRetriesTotal = new Counter(
    'outbox_publish_retries_total',
    'Total outbox publish retries by event type',
  );

  readonly httpRequestDuration = new Histogram(
    'http_request_duration_seconds',
    'HTTP request duration in seconds',
  );

  render(): string {
    return [
      ...this.wagerTransactionsTotal.render(),
      ...this.wagerTransactionDuplicatesTotal.render(),
      ...this.wagerTransactionRetriesTotal.render(),
      ...this.wagerMessagesDlqTotal.render(),
      ...this.walletLockConflictsTotal.render(),
      ...this.wagerTransactionProcessingDuration.render(),
      ...this.outboxPendingTotal.render(),
      ...this.outboxPublishAttemptsTotal.render(),
      ...this.outboxPublishedTotal.render(),
      ...this.outboxPublishFailedTotal.render(),
      ...this.outboxPublishRetriesTotal.render(),
      ...this.httpRequestDuration.render(),
    ].join('\n');
  }
}
