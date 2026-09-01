import { describe, expect, it } from 'bun:test';

import { InboxMessage, AlreadyProcessedError } from './inbox-message.js';
import { OutboxMessage } from './outbox-message.js';
import { WagerTransactionProcessed } from './events/wager-transaction-processed.event.js';
import { Money } from '../shared/money/money.js';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../wagering/wager-transaction.enums.js';
import { WagerTransaction } from '../wagering/wager-transaction.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');

describe('InboxMessage', () => {
  it('marks processed once', () => {
    const inbox = InboxMessage.receive({
      messageId: 'msg-1',
      consumerName: 'consumer',
      payloadHash: 'hash',
      receivedAt: NOW,
    });

    inbox.markProcessed(NOW);
    expect(inbox.isProcessed()).toBe(true);

    expect(() => inbox.markProcessed(NOW)).toThrow(AlreadyProcessedError);
  });
});

describe('OutboxMessage', () => {
  function pendingOutbox(): OutboxMessage {
    const tx = WagerTransaction.create({
      id: 'tx-1',
      providerId: 'p',
      externalTransactionId: 'ext',
      idempotencyKey: 'p:ext',
      payloadHash: 'hash',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({ amount: '10.00', currency: 'BRL' }),
      createdAt: NOW,
    });
    tx.markProcessed(
      undefined,
      Money.from({ amount: '90.00', currency: 'BRL' }),
      NOW,
    );

    return OutboxMessage.enqueue(
      'outbox-1',
      WagerTransactionProcessed.from(tx, {
        eventId: 'evt-1',
        correlationId: 'corr-1',
      }),
    );
  }

  it('is due when pending without nextAttemptAt', () => {
    const msg = pendingOutbox();
    expect(msg.isDue(NOW)).toBe(true);
  });

  it('is not due before nextAttemptAt', () => {
    const msg = pendingOutbox();
    msg.scheduleRetry(NOW);
    expect(msg.isDue(NOW)).toBe(false);
  });

  it('applies exponential backoff on scheduleRetry', () => {
    const msg = pendingOutbox();
    msg.scheduleRetry(NOW);

    expect(msg.attempts).toBe(1);
    expect(msg.nextAttemptAt!.getTime() - NOW.getTime()).toBe(5000);

    msg.scheduleRetry(new Date(NOW.getTime() + 5000));
    expect(msg.attempts).toBe(2);
    expect(
      msg.nextAttemptAt!.getTime() - (NOW.getTime() + 5000),
    ).toBe(10_000);
  });

  it('markPublished clears pending state', () => {
    const msg = pendingOutbox();
    msg.markPublished(NOW);

    expect(msg.isPending()).toBe(false);
    expect(msg.isDue(NOW)).toBe(false);
    expect(msg.publishedAt).toEqual(NOW);
  });
});
