import { FailureCode } from '../../../domain/shared/failure-code.js';

export class PayloadConflictError extends Error {
  constructor(idempotencyKey: string) {
    super(
      `Idempotency key "${idempotencyKey}" already exists with a different payload`,
    );
    this.name = 'PayloadConflictError';
  }
}

export class ReferenceValidationError extends Error {
  readonly failureCode: FailureCode;

  constructor(message: string, failureCode: FailureCode) {
    super(message);
    this.name = 'ReferenceValidationError';
    this.failureCode = failureCode;
  }
}

export class WagerTransactionNotFoundError extends Error {
  constructor(detail: string) {
    super(`WagerTransaction not found: ${detail}`);
    this.name = 'WagerTransactionNotFoundError';
  }
}
