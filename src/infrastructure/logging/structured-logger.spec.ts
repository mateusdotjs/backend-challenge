import { afterEach, describe, expect, it } from 'bun:test';

import { runWithLogContext } from './log-context.js';
import { StructuredLogger } from './structured-logger.js';

describe('StructuredLogger', () => {
  const originalLog = console.log;

  afterEach(() => {
    console.log = originalLog;
  });

  it('writes JSON with context fields', () => {
    let output = '';
    console.log = ((line: string) => {
      output = line;
    }) as typeof console.log;

    runWithLogContext(
      {
        correlationId: 'corr-1',
        walletId: 'wallet-1',
        providerId: 'provider-a',
      },
      () => {
        const logger = new StructuredLogger('TestContext');
        logger.log('wager_transaction_processed', {
          transactionId: 'tx-1',
        });
      },
    );

    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed.event).toBe('wager_transaction_processed');
    expect(parsed.level).toBe('log');
    expect(parsed.context).toBe('TestContext');
    expect(parsed.correlationId).toBe('corr-1');
    expect(parsed.walletId).toBe('wallet-1');
    expect(parsed.providerId).toBe('provider-a');
    expect(parsed.transactionId).toBe('tx-1');
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('includes error fields on error logs', () => {
    let output = '';
    console.error = ((line: string) => {
      output = line;
    }) as typeof console.error;

    const logger = new StructuredLogger('TestContext');
    logger.error('sqs_message_processing_failed', { messageId: 'msg-1' }, new Error('boom'));

    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed.event).toBe('sqs_message_processing_failed');
    expect(parsed.level).toBe('error');
    expect(parsed.errorName).toBe('Error');
    expect(parsed.errorMessage).toBe('boom');
    expect(typeof parsed.stack).toBe('string');
  });
});
