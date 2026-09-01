import { describe, expect, it } from 'bun:test';

import { Money } from '../shared/money/money.js';
import { LedgerDirection } from './ledger.enums.js';
import { WalletLedgerEntry } from './wallet-ledger-entry.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');

describe('WalletLedgerEntry', () => {
  it('creates balanced DEBIT entry', () => {
    const entry = WalletLedgerEntry.create({
      id: 'entry-1',
      walletId: 'wallet-1',
      transactionId: 'tx-1',
      direction: LedgerDirection.Debit,
      money: Money.from({ amount: '25.00', currency: 'BRL' }),
      balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
      balanceAfter: Money.from({ amount: '75.00', currency: 'BRL' }),
      createdAt: NOW,
    });

    expect(entry.isBalanced()).toBe(true);
  });

  it('creates balanced CREDIT entry', () => {
    const entry = WalletLedgerEntry.create({
      id: 'entry-1',
      walletId: 'wallet-1',
      transactionId: 'tx-1',
      direction: LedgerDirection.Credit,
      money: Money.from({ amount: '25.00', currency: 'BRL' }),
      balanceBefore: Money.from({ amount: '75.00', currency: 'BRL' }),
      balanceAfter: Money.from({ amount: '100.00', currency: 'BRL' }),
      createdAt: NOW,
    });

    expect(entry.isBalanced()).toBe(true);
  });

  it('rejects non-positive money', () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: 'entry-1',
        walletId: 'wallet-1',
        transactionId: 'tx-1',
        direction: LedgerDirection.Debit,
        money: Money.from({ amount: '0.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '100.00', currency: 'BRL' }),
        createdAt: NOW,
      }),
    ).toThrow('must be positive');
  });

  it('rejects unbalanced arithmetic', () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: 'entry-1',
        walletId: 'wallet-1',
        transactionId: 'tx-1',
        direction: LedgerDirection.Debit,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '80.00', currency: 'BRL' }),
        createdAt: NOW,
      }),
    ).toThrow('Ledger arithmetic mismatch');
  });

  it('rehydrate skips validation', () => {
    const entry = WalletLedgerEntry.rehydrate({
      id: 'entry-1',
      walletId: 'wallet-1',
      transactionId: 'tx-1',
      direction: LedgerDirection.Debit,
      money: Money.from({ amount: '25.00', currency: 'BRL' }),
      balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
      balanceAfter: Money.from({ amount: '80.00', currency: 'BRL' }),
      createdAt: NOW,
    });

    expect(entry.isBalanced()).toBe(false);
  });
});
