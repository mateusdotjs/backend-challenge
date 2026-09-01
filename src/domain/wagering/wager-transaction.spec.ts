import { describe, expect, it } from 'bun:test';

import { Money } from '../shared/money/money.js';
import { FailureCode } from '../shared/failure-code.js';
import { LedgerDirection } from '../ledger/ledger.enums.js';
import { WagerTransaction } from './wager-transaction.js';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from './wager-transaction.enums.js';
import {
  InvalidTransactionStateError,
  OpeningTransactionForbiddenError,
  ReferenceMissingError,
} from './wager-transaction.errors.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function baseProps(
  overrides: Partial<Parameters<typeof WagerTransaction.create>[0]> = {},
) {
  return {
    id: 'tx-1',
    providerId: 'provider-a',
    externalTransactionId: 'ext-1',
    idempotencyKey: 'provider-a:ext-1',
    payloadHash: 'hash-1',
    walletId: 'wallet-1',
    playerId: 'player-1',
    roundId: 'round-1',
    gameId: 'game-1',
    kind: WagerTransactionKind.Bet,
    money: Money.from({ amount: '10.00', currency: 'BRL' }),
    createdAt: NOW,
    ...overrides,
  };
}

describe('WagerTransaction', () => {
  it('create starts in PENDING', () => {
    const tx = WagerTransaction.create(baseProps());
    expect(tx.status).toBe(WagerTransactionStatus.Pending);
  });

  it('forbids OPENING via create', () => {
    expect(() =>
      WagerTransaction.create(
        baseProps({ kind: WagerTransactionKind.Opening }),
      ),
    ).toThrow(OpeningTransactionForbiddenError);
  });

  it('requires reference for REFUND and ROLLBACK', () => {
    expect(() =>
      WagerTransaction.create(
        baseProps({ kind: WagerTransactionKind.Refund }),
      ),
    ).toThrow(ReferenceMissingError);

    expect(() =>
      WagerTransaction.create(
        baseProps({ kind: WagerTransactionKind.Rollback }),
      ),
    ).toThrow(ReferenceMissingError);
  });

  it('blocks transitions from terminal states', () => {
    const tx = WagerTransaction.create(baseProps());
    tx.markProcessed(
      undefined,
      Money.from({ amount: '90.00', currency: 'BRL' }),
      NOW,
    );

    expect(() =>
      tx.reject(FailureCode.InsufficientBalance),
    ).toThrow(InvalidTransactionStateError);
    expect(() =>
      tx.markPendingReference(new Date()),
    ).toThrow(InvalidTransactionStateError);
  });

  it('affectsBalance is false for LOSS', () => {
    const loss = WagerTransaction.create(
      baseProps({ kind: WagerTransactionKind.Loss }),
    );
    const bet = WagerTransaction.create(baseProps());

    expect(loss.affectsBalance()).toBe(false);
    expect(bet.affectsBalance()).toBe(true);
  });

  it('ledgerDirectionFor returns correct directions', () => {
    const bet = WagerTransaction.create(baseProps());
    const win = WagerTransaction.create(
      baseProps({ kind: WagerTransactionKind.Win }),
    );

    expect(bet.ledgerDirectionFor()).toBe(LedgerDirection.Debit);
    expect(win.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
  });

  it('ROLLBACK inverts reference direction', () => {
    const bet = WagerTransaction.create(baseProps());
    bet.markProcessed(
      undefined,
      Money.from({ amount: '90.00', currency: 'BRL' }),
      NOW,
    );

    const rollback = WagerTransaction.create(
      baseProps({
        kind: WagerTransactionKind.Rollback,
        referenceExternalTransactionId: 'ext-1',
      }),
    );

    expect(rollback.ledgerDirectionFor(bet)).toBe(LedgerDirection.Credit);
  });

  it('matchesPayload compares hash', () => {
    const tx = WagerTransaction.create(baseProps({ payloadHash: 'abc' }));
    expect(tx.matchesPayload('abc')).toBe(true);
    expect(tx.matchesPayload('xyz')).toBe(false);
  });
});
