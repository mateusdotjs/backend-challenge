import { Money } from '../shared/money/money.js';
import {
  WalletLedgerEntry,
} from '../ledger/wallet-ledger-entry.js';
import { LedgerDirection } from '../ledger/ledger.enums.js';
import {
  InsufficientBalanceError,
  WalletCurrencyMismatchError,
} from './wallet.errors.js';

export interface WalletOpenProps {
  id: string;
  playerId: string;
  balance: Money;
  createdAt: Date;
}

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DebitProps {
  money: Money;
  transactionId: string;
  ledgerEntryId: string;
  at: Date;
}

export interface CreditProps {
  money: Money;
  transactionId: string;
  ledgerEntryId: string;
  at: Date;
}

export class Wallet {
  public readonly id: string;
  public readonly playerId: string;
  public readonly currency: string;
  public readonly createdAt: Date;
  private _balance: Money;
  private _version: number;
  private _updatedAt: Date;

  private constructor(state: WalletState) {
    this.id = state.id;
    this.playerId = state.playerId;
    this.currency = state.currency;
    this._balance = state.balance;
    this._version = state.version;
    this.createdAt = state.createdAt;
    this._updatedAt = state.updatedAt;
  }

  static open(props: WalletOpenProps): Wallet {
    const now = props.createdAt;
    return new Wallet({
      id: props.id,
      playerId: props.playerId,
      currency: props.balance.currency,
      balance: props.balance,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(state: WalletState): Wallet {
    return new Wallet(state);
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(props: DebitProps): WalletLedgerEntry {
    this.assertSameCurrency(props.money);

    if (this._balance.isLessThan(props.money)) {
      throw new InsufficientBalanceError(
        this._balance.toString(),
        props.money.toString(),
        this.currency,
      );
    }

    const balanceBefore = this._balance;
    const balanceAfter = this._balance.subtract(props.money);

    this._balance = balanceAfter;
    this._version += 1;
    this._updatedAt = props.at;

    return WalletLedgerEntry.create({
      id: props.ledgerEntryId,
      walletId: this.id,
      transactionId: props.transactionId,
      direction: LedgerDirection.Debit,
      money: props.money,
      balanceBefore,
      balanceAfter,
      createdAt: props.at,
    });
  }

  credit(props: CreditProps): WalletLedgerEntry {
    this.assertSameCurrency(props.money);

    const balanceBefore = this._balance;
    const balanceAfter = this._balance.add(props.money);

    this._balance = balanceAfter;
    this._version += 1;
    this._updatedAt = props.at;

    return WalletLedgerEntry.create({
      id: props.ledgerEntryId,
      walletId: this.id,
      transactionId: props.transactionId,
      direction: LedgerDirection.Credit,
      money: props.money,
      balanceBefore,
      balanceAfter,
      createdAt: props.at,
    });
  }

  private assertSameCurrency(money: Money): void {
    if (money.currency !== this.currency) {
      throw new WalletCurrencyMismatchError(this.currency, money.currency);
    }
  }
}
