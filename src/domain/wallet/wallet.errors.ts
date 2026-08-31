import { DomainError } from '../shared/domain.error.js';

export class InsufficientBalanceError extends DomainError {
  constructor(available: string, requested: string, currency: string) {
    super(
      `Insufficient balance: available ${available} ${currency}, requested ${requested} ${currency}`,
      'INSUFFICIENT_BALANCE',
    );
  }
}

export class WalletCurrencyMismatchError extends DomainError {
  constructor(walletCurrency: string, operationCurrency: string) {
    super(
      `Currency mismatch: wallet currency is ${walletCurrency}, operation currency is ${operationCurrency}`,
      'CURRENCY_MISMATCH',
    );
  }
}
