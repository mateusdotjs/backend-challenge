import Big from 'big.js';

export interface MoneyProps {
  amount: string;
  currency: string;
}

const SCIENTIFIC_NOTATION = /[eE]/;
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

export class Money {
  private readonly value: Big;
  public readonly currency: string;

  private constructor(value: Big, currency: string) {
    this.value = value;
    this.currency = currency;
  }

  static from(props: MoneyProps): Money {
    const { amount, currency } = props;

    if (!currency || currency.trim() === '') {
      throw new Error('Currency must not be empty');
    }

    if (!amount || amount.trim() === '') {
      throw new Error('Amount must not be empty');
    }

    if (SCIENTIFIC_NOTATION.test(amount)) {
      throw new Error(`Amount must not use scientific notation: "${amount}"`);
    }

    if (!DECIMAL_PATTERN.test(amount)) {
      throw new Error(`Amount is not a valid decimal: "${amount}"`);
    }

    const dotIndex = amount.indexOf('.');
    if (dotIndex !== -1 && amount.length - dotIndex - 1 > 2) {
      throw new Error(`Amount must have at most 2 decimal places: "${amount}"`);
    }

    let big: Big;
    try {
      big = new Big(amount);
    } catch {
      throw new Error(`Amount is not a valid number: "${amount}"`);
    }

    if (big.lt(0)) {
      throw new Error(`Amount must not be negative: "${amount}"`);
    }

    return new Money(big, currency.trim().toUpperCase());
  }

  static zero(currency: string): Money {
    if (!currency || currency.trim() === '') {
      throw new Error('Currency must not be empty');
    }
    return new Money(new Big(0), currency.trim().toUpperCase());
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.plus(other.value), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.minus(other.value), this.currency);
  }

  negate(): Money {
    return new Money(this.value.times(-1), this.currency);
  }

  isZero(): boolean {
    return this.value.eq(0);
  }

  isPositive(): boolean {
    return this.value.gt(0);
  }

  isNegative(): boolean {
    return this.value.lt(0);
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lt(other.value);
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.gt(other.value);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.eq(other.value);
  }

  toString(): string {
    return this.value.toFixed(2);
  }

  toJSON(): MoneyProps {
    return {
      amount: this.value.toFixed(2),
      currency: this.currency,
    };
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Currency mismatch: cannot operate on ${this.currency} and ${other.currency}`,
      );
    }
  }
}
