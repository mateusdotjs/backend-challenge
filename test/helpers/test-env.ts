export const TEST_DB_NAME = 'wagering_test';

export function applyTestEnv(): void {
  process.env['NODE_ENV'] = 'test';
  process.env['DB_HOST'] = process.env['DB_HOST'] ?? 'localhost';
  process.env['DB_PORT'] = process.env['DB_PORT'] ?? '5432';
  process.env['DB_USER'] = process.env['DB_USER'] ?? 'postgres';
  process.env['DB_PASSWORD'] = process.env['DB_PASSWORD'] ?? 'postgres';
  process.env['DB_NAME'] = TEST_DB_NAME;
  process.env['DB_DEBUG'] = 'false';

  process.env['AWS_REGION'] = 'us-east-1';
  process.env['AWS_ENDPOINT_URL'] =
    process.env['AWS_ENDPOINT_URL'] ?? 'http://localhost:4566';
  process.env['AWS_ACCESS_KEY_ID'] = 'test';
  process.env['AWS_SECRET_ACCESS_KEY'] = 'test';

  process.env['SQS_WAGER_TRANSACTIONS_QUEUE_URL'] =
    'http://localhost:4566/000000000000/wager-transactions.fifo';
  process.env['SQS_WAGER_TRANSACTIONS_DLQ_URL'] =
    'http://localhost:4566/000000000000/wager-transactions-dlq.fifo';
  process.env['SQS_OUTBOX_EVENTS_QUEUE_URL'] =
    'http://localhost:4566/000000000000/outbox-events.fifo';
  process.env['SQS_OUTBOX_EVENTS_DLQ_URL'] =
    'http://localhost:4566/000000000000/outbox-events-dlq.fifo';

  process.env['OUTBOX_POLL_INTERVAL_MS'] = '999999';
  process.env['PENDING_REFERENCE_POLL_INTERVAL_MS'] = '999999';
  process.env['PENDING_REFERENCE_MAX_ATTEMPTS'] = '20';
}
