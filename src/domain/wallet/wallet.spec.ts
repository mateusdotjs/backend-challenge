import { describe, expect, it } from 'bun:test';

import { Money } from '../shared/money/money.js';
import { LedgerDirection } from '../ledger/ledger.enums.js';
import { Wallet } from './wallet.js';
import {
  InsufficientBalanceError,
  WalletCurrencyMismatchError,
} from './wallet.errors.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');

describe('Wallet', () => {
  function openWallet(balance = '100.00'): Wallet {
    return Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      balance: Money.from({ amount: balance, currency: 'BRL' }),
      createdAt: NOW,
    });
  }

  it('opens with version 1 and correct balance', () => {
    const wallet = openWallet();
    expect(wallet.version).toBe(1);
    expect(wallet.balance.toString()).toBe('100.00');
    expect(wallet.currency).toBe('BRL');
  });

  it('debits and returns balanced ledger entry', () => {
    const wallet = openWallet();
    const entry = wallet.debit({
      money: Money.from({ amount: '25.00', currency: 'BRL' }),
      transactionId: 'tx-1',
      ledgerEntryId: 'entry-1',
      at: NOW,
    });

    expect(wallet.balance.toString()).toBe('75.00');
    expect(wallet.version).toBe(2);
    expect(entry.direction).toBe(LedgerDirection.Debit);
    expect(entry.balanceBefore.toString()).toBe('100.00');
    expect(entry.balanceAfter.toString()).toBe('75.00');
    expect(entry.isBalanced()).toBe(true);
  });

  it('credits and increments version', () => {
    const wallet = openWallet('50.00');
    wallet.credit({
      money: Money.from({ amount: '10.00', currency: 'BRL' }),
      transactionId: 'tx-1',
      ledgerEntryId: 'entry-1',
      at: NOW,
    });

    expect(wallet.balance.toString()).toBe('60.00');
    expect(wallet.version).toBe(2);
  });

  it('rejects debit when balance is insufficient', () => {
    const wallet = openWallet('10.00');

    expect(() =>
      wallet.debit({
        money: Money.from({ amount: '20.00', currency: 'BRL' }),
        transactionId: 'tx-1',
        ledgerEntryId: 'entry-1',
        at: NOW,
      }),
    ).toThrow(InsufficientBalanceError);
  });

  it('rejects currency mismatch on debit and credit', () => {
    const wallet = openWallet();
    const usd = Money.from({ amount: '1.00', currency: 'USD' });

    expect(() =>
      wallet.debit({
        money: usd,
        transactionId: 'tx-1',
        ledgerEntryId: 'entry-1',
        at: NOW,
      }),
    ).toThrow(WalletCurrencyMismatchError);

    expect(() =>
      wallet.credit({
        money: usd,
        transactionId: 'tx-2',
        ledgerEntryId: 'entry-2',
        at: NOW,
      }),
    ).toThrow(WalletCurrencyMismatchError);
  });
});
