import { MoneyProps } from '../../../domain/shared/money/money.js';
import { LedgerDirection } from '../../../domain/ledger/ledger.enums.js';
import { FailureCode } from '../../../domain/shared/failure-code.js';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../../domain/wagering/wager-transaction.enums.js';

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export interface CreateWalletCommand {
  playerId: string;
  initialBalance: MoneyProps;
}

export interface WalletDto {
  id: string;
  playerId: string;
  currency: string;
  balance: MoneyProps;
  version: number;
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export interface GetWalletLedgerQuery {
  walletId: string;
  cursor?: string;
  limit: number;
}

export interface LedgerEntryDto {
  id: string;
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: MoneyProps;
  balanceBefore: MoneyProps;
  balanceAfter: MoneyProps;
  createdAt: string;
}

export interface WalletLedgerPageDto {
  entries: LedgerEntryDto[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export interface ReconcileWalletQuery {
  walletId: string;
}

export interface ReconciliationResultDto {
  walletId: string;
  storedBalance: MoneyProps;
  calculatedBalance: MoneyProps;
  difference: MoneyProps;
  consistent: boolean;
  checkedEntries: number;
}

// ---------------------------------------------------------------------------
// WagerTransaction — commands
// ---------------------------------------------------------------------------

export interface ProcessWagerTransactionCommand {
  idempotencyKey: string;
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  referenceExternalTransactionId?: string;
}

// ---------------------------------------------------------------------------
// WagerTransaction — DTOs
// ---------------------------------------------------------------------------

export interface WagerTransactionDto {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  status: WagerTransactionStatus;
  money: MoneyProps;
  referenceExternalTransactionId: string | null;
  referenceTransactionId: string | null;
  failureCode: FailureCode | null;
  observedBalance: MoneyProps | null;
  processedAt: string | null;
  createdAt: string;
}

export interface ProcessTransactionResultDto {
  transactionId: string;
  status: WagerTransactionStatus;
  balance: MoneyProps;
  idempotentReplay: boolean;
  failureCode: FailureCode | null;
}
