import { describe, expect, it } from 'bun:test';

import {
  getLogContext,
  runWithLogContext,
  runWithLogContextAsync,
  updateLogContext,
} from './log-context.js';

describe('log-context', () => {
  it('merges parent context when nesting', () => {
    runWithLogContext({ correlationId: 'corr-1' }, () => {
      runWithLogContext({ messageId: 'msg-1' }, () => {
        expect(getLogContext()).toEqual({
          correlationId: 'corr-1',
          messageId: 'msg-1',
        });
      });
    });
  });

  it('updates context in place for the current store', () => {
    runWithLogContext({ correlationId: 'corr-1' }, () => {
      updateLogContext({ transactionId: 'tx-1' });
      expect(getLogContext()).toEqual({
        correlationId: 'corr-1',
        transactionId: 'tx-1',
      });
    });
  });

  it('does not leak context between parallel async executions', async () => {
    const results = await Promise.all([
      runWithLogContextAsync({ correlationId: 'a' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return getLogContext().correlationId;
      }),
      runWithLogContextAsync({ correlationId: 'b' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getLogContext().correlationId;
      }),
    ]);

    expect(results).toEqual(['a', 'b']);
  });

  it('omits null and undefined values from merged context', () => {
    runWithLogContext(
      { correlationId: 'corr-1', messageId: undefined, walletId: null as unknown as string },
      () => {
        expect(getLogContext()).toEqual({ correlationId: 'corr-1' });
      },
    );
  });
});
