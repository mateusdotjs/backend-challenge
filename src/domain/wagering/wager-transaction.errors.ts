import { DomainError } from '../shared/domain.error.js';
import { WagerTransactionStatus } from './wager-transaction.enums.js';

export class InvalidTransactionStateError extends DomainError {
  constructor(
    transactionId: string,
    currentStatus: WagerTransactionStatus,
    attemptedTransition: string,
  ) {
    super(
      `Cannot perform "${attemptedTransition}" on transaction "${transactionId}": status is already terminal (${currentStatus})`,
      'INVALID_TRANSACTION_STATE',
    );
  }
}

export class OpeningTransactionForbiddenError extends DomainError {
  constructor() {
    super(
      'OPENING transactions are internal and cannot be created via API or SQS',
      'INVALID_TRANSACTION_STATE',
    );
  }
}

export class ReferenceMissingError extends DomainError {
  constructor(kind: string) {
    super(
      `${kind} transactions require a referenceExternalTransactionId`,
      'INVALID_REFERENCE',
    );
  }
}
