export enum FailureCode {
  InsufficientBalance = 'INSUFFICIENT_BALANCE',
  CurrencyMismatch = 'CURRENCY_MISMATCH',
  ReferenceNotFound = 'REFERENCE_NOT_FOUND',
  InvalidReference = 'INVALID_REFERENCE',
  ReversalAlreadyApplied = 'REVERSAL_ALREADY_APPLIED',
  InvalidTransactionState = 'INVALID_TRANSACTION_STATE',
  PayloadConflict = 'PAYLOAD_CONFLICT',
  ReversalWouldNegateBalance = 'REVERSAL_WOULD_NEGATE_BALANCE',
}
