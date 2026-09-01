import { describe, expect, it } from 'bun:test';

import { Money } from './money.js';

describe('Money', () => {
  describe('from', () => {
    it('accepts valid decimal strings and normalizes to 2 places in toJSON', () => {
      expect(Money.from({ amount: '25.00', currency: 'BRL' }).toJSON()).toEqual({
        amount: '25.00',
        currency: 'BRL',
      });
      expect(Money.from({ amount: '25', currency: 'BRL' }).toJSON().amount).toBe(
        '25.00',
      );
      expect(Money.from({ amount: '25.5', currency: 'BRL' }).toJSON().amount).toBe(
        '25.50',
      );
    });

    it('uppercases and trims currency', () => {
      expect(Money.from({ amount: '1.00', currency: ' brl ' }).currency).toBe(
        'BRL',
      );
    });

    it('rejects empty amount', () => {
      expect(() => Money.from({ amount: '', currency: 'BRL' })).toThrow(
        'Amount must not be empty',
      );
    });

    it('rejects empty currency', () => {
      expect(() => Money.from({ amount: '1.00', currency: '' })).toThrow(
        'Currency must not be empty',
      );
    });

    it('rejects scientific notation', () => {
      expect(() => Money.from({ amount: '1e2', currency: 'BRL' })).toThrow(
        'scientific notation',
      );
    });

    it('rejects more than 2 decimal places', () => {
      expect(() => Money.from({ amount: '1.234', currency: 'BRL' })).toThrow(
        'at most 2 decimal places',
      );
    });

    it('rejects negative amounts', () => {
      expect(() => Money.from({ amount: '-1.00', currency: 'BRL' })).toThrow(
        'not a valid decimal',
      );
    });

    it('rejects invalid decimal format', () => {
      expect(() => Money.from({ amount: 'abc', currency: 'BRL' })).toThrow(
        'not a valid decimal',
      );
    });
  });

  describe('arithmetic', () => {
    it('adds and subtracts same currency', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '3.50', currency: 'BRL' });

      expect(a.add(b).toString()).toBe('13.50');
      expect(a.subtract(b).toString()).toBe('6.50');
    });

    it('negates value', () => {
      const m = Money.from({ amount: '5.00', currency: 'BRL' });
      expect(m.negate().toString()).toBe('-5.00');
    });

    it('throws on currency mismatch', () => {
      const brl = Money.from({ amount: '1.00', currency: 'BRL' });
      const usd = Money.from({ amount: '1.00', currency: 'USD' });

      expect(() => brl.add(usd)).toThrow('Currency mismatch');
      expect(() => brl.subtract(usd)).toThrow('Currency mismatch');
      expect(() => brl.isLessThan(usd)).toThrow('Currency mismatch');
    });

    it('compares amounts correctly', () => {
      const low = Money.from({ amount: '10.00', currency: 'BRL' });
      const high = Money.from({ amount: '20.00', currency: 'BRL' });

      expect(low.isLessThan(high)).toBe(true);
      expect(high.isGreaterThan(low)).toBe(true);
      expect(low.equals(Money.from({ amount: '10.00', currency: 'BRL' }))).toBe(
        true,
      );
    });

    it('is immutable', () => {
      const original = Money.from({ amount: '10.00', currency: 'BRL' });
      const added = original.add(
        Money.from({ amount: '1.00', currency: 'BRL' }),
      );

      expect(original.toString()).toBe('10.00');
      expect(added.toString()).toBe('11.00');
    });
  });

  describe('zero', () => {
    it('creates zero money', () => {
      const zero = Money.zero('BRL');
      expect(zero.isZero()).toBe(true);
      expect(zero.isPositive()).toBe(false);
      expect(zero.isNegative()).toBe(false);
    });
  });
});
