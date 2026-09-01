import { randomUUID } from 'crypto';
import { Money } from '../../../domain/shared/money/money.js';
import { FailureCode } from '../../../domain/shared/failure-code.js';
import { Wallet } from '../../../domain/wallet/wallet.js';
import {
  InsufficientBalanceError,
  WalletCurrencyMismatchError,
} from '../../../domain/wallet/wallet.errors.js';
import { WagerTransaction } from '../../../domain/wagering/wager-transaction.js';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../../domain/wagering/wager-transaction.enums.js';
import { OutboxMessage } from '../../../domain/messaging/outbox-message.js';
import { WalletBalanceChanged } from '../../../domain/messaging/events/wallet-balance-changed.event.js';
import { WagerTransactionProcessed } from '../../../domain/messaging/events/wager-transaction-processed.event.js';
import { WagerTransactionRejected } from '../../../domain/messaging/events/wager-transaction-rejected.event.js';
import { WagerTransactionPendingReference } from '../../../domain/messaging/events/wager-transaction-pending-reference.event.js';
import { WalletRepositoryPort } from '../../ports/repositories/wallet-repository.port.js';
import { WagerTransactionRepositoryPort } from '../../ports/repositories/wager-transaction-repository.port.js';
import { LedgerRepositoryPort } from '../../ports/repositories/ledger-repository.port.js';
import { OutboxRepositoryPort } from '../../ports/repositories/outbox-repository.port.js';
import { UnitOfWorkPort } from '../../ports/unit-of-work.port.js';
import { ClockPort } from '../../ports/clock.port.js';
import {
  ProcessWagerTransactionCommand,
  ProcessTransactionResultDto,
} from '../shared/use-case.types.js';
import { computePayloadHash } from '../shared/payload-hash.js';

// ---------------------------------------------------------------------------
// Application-layer errors (not domain errors)
// ---------------------------------------------------------------------------

export class PayloadConflictError extends Error {
  constructor(idempotencyKey: string) {
    super(
      `Idempotency key "${idempotencyKey}" already exists with a different payload`,
    );
    this.name = 'PayloadConflictError';
  }
}

export class WalletNotFoundError extends Error {
  constructor(walletId: string) {
    super(`Wallet not found: ${walletId}`);
    this.name = 'WalletNotFoundError';
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

// ---------------------------------------------------------------------------
// Pending-reference backoff (5 s base, doubles per attempt, cap 5 min)
// ---------------------------------------------------------------------------
const BASE_PENDING_BACKOFF_MS = 5_000;
const MAX_PENDING_BACKOFF_MS = 5 * 60_000;

function nextReferenceAttemptAt(attempts: number, now: Date): Date {
  const backoffMs = Math.min(
    BASE_PENDING_BACKOFF_MS * Math.pow(2, attempts),
    MAX_PENDING_BACKOFF_MS,
  );
  return new Date(now.getTime() + backoffMs);
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class ProcessWagerTransactionUseCase {
  constructor(
    private readonly walletRepo: WalletRepositoryPort,
    private readonly wagerTxRepo: WagerTransactionRepositoryPort,
    private readonly ledgerRepo: LedgerRepositoryPort,
    private readonly outboxRepo: OutboxRepositoryPort,
    private readonly uow: UnitOfWorkPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(
    command: ProcessWagerTransactionCommand,
  ): Promise<ProcessTransactionResultDto> {
    const payloadHash = computePayloadHash(command);
    // #region agent log
    fetch('http://127.0.0.1:7557/ingest/03872681-9ff9-405b-8a84-5368f552b0d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'892c16'},body:JSON.stringify({sessionId:'892c16',location:'process-wager-transaction.use-case.ts:execute',message:'payload hash computed',data:{payloadHash,kind:command.kind,hasReference:command.referenceExternalTransactionId!=null},timestamp:Date.now(),hypothesisId:'A',runId:'post-fix'})}).catch(()=>{});
    // #endregion

    // Fast-path idempotency check before entering the transaction.
    // The definitive check is re-done inside the transaction to handle races.
    const existingFast = await this.wagerTxRepo.findByIdempotencyKey(
      command.idempotencyKey,
    );
    if (existingFast) {
      return this.handleExisting(existingFast, payloadHash, command.idempotencyKey);
    }

    return this.uow.runInTransaction(async () => {
      // Acquire an exclusive lock on the wallet first to serialise concurrent
      // operations that affect the same wallet's balance.
      const wallet = await this.walletRepo.findByIdForUpdate(command.walletId);
      if (!wallet) {
        throw new WalletNotFoundError(command.walletId);
      }

      // Re-check idempotency inside the transaction to handle the race where
      // two concurrent requests both passed the fast-path check.
      const existing = await this.wagerTxRepo.findByIdempotencyKey(
        command.idempotencyKey,
      );
      if (existing) {
        return this.handleExisting(existing, payloadHash, command.idempotencyKey);
      }

      const now = this.clock.now();
      const money = Money.from(command.money);

      const tx = WagerTransaction.create({
        id: randomUUID(),
        providerId: command.providerId,
        externalTransactionId: command.externalTransactionId,
        idempotencyKey: command.idempotencyKey,
        payloadHash,
        walletId: command.walletId,
        playerId: command.playerId,
        roundId: command.roundId,
        gameId: command.gameId,
        kind: command.kind,
        money,
        referenceExternalTransactionId: command.referenceExternalTransactionId,
        createdAt: now,
      });

      // Operations requiring a reference (REFUND, ROLLBACK) and optionally WIN
      if (tx.requiresReference() || (tx.kind === WagerTransactionKind.Win && command.referenceExternalTransactionId)) {
        const refExternalId = command.referenceExternalTransactionId!;
        const reference = await this.wagerTxRepo.findByProviderAndExternalId(
          command.providerId,
          refExternalId,
        );

        if (!reference) {
          return this.persistPendingReference(tx, now);
        }

        // Validate reference compatibility — on failure, save as REJECTED
        try {
          this.validateReferenceCompatibility(tx, reference);
        } catch (err) {
          if (err instanceof ReferenceValidationError) {
            return this.persistRejected(tx, wallet, err.failureCode, now);
          }
          throw err;
        }

        // Check reversal deduplication (only for REFUND and ROLLBACK)
        if (tx.kind === WagerTransactionKind.Refund || tx.kind === WagerTransactionKind.Rollback) {
          const existingReversal =
            await this.wagerTxRepo.findProcessedReversalByReferenceId(reference.id);
          if (existingReversal) {
            return this.persistRejected(tx, wallet, FailureCode.ReversalAlreadyApplied, now);
          }
        }

        return this.applyWithReference(tx, wallet, reference, now);
      }

      return this.applyWithoutReference(tx, wallet, now);
    });
  }

  // -------------------------------------------------------------------------
  // Idempotency replay / conflict
  // -------------------------------------------------------------------------

  private handleExisting(
    existing: WagerTransaction,
    payloadHash: string,
    idempotencyKey: string,
  ): ProcessTransactionResultDto {
    if (!existing.matchesPayload(payloadHash)) {
      throw new PayloadConflictError(idempotencyKey);
    }
    return toResult(existing, true);
  }

  // -------------------------------------------------------------------------
  // PENDING_REFERENCE path
  // -------------------------------------------------------------------------

  private async persistPendingReference(
    tx: WagerTransaction,
    now: Date,
  ): Promise<ProcessTransactionResultDto> {
    const nextAttempt = nextReferenceAttemptAt(
      tx.referenceResolutionAttempts,
      now,
    );
    tx.markPendingReference(nextAttempt);
    await this.wagerTxRepo.save(tx);

    const ctx = { eventId: randomUUID(), correlationId: tx.idempotencyKey };
    await this.outboxRepo.save(
      OutboxMessage.enqueue(
        randomUUID(),
        WagerTransactionPendingReference.from(tx, ctx),
      ),
    );

    // No wallet balance available yet — return zero for the wallet's currency
    return {
      transactionId: tx.id,
      status: tx.status,
      balance: Money.zero(tx.money.currency).toJSON(),
      idempotentReplay: false,
    };
  }

  // -------------------------------------------------------------------------
  // Business rejection path
  // -------------------------------------------------------------------------

  private async persistRejected(
    tx: WagerTransaction,
    wallet: Wallet,
    code: FailureCode,
    now: Date,
  ): Promise<ProcessTransactionResultDto> {
    tx.reject(code);
    // Rejected transactions do not call markProcessed — reject() is terminal.
    // We record the wallet balance at rejection time for the response DTO.
    const balanceAtRejection = wallet.balance;

    await this.wagerTxRepo.save(tx);

    const ctx = { eventId: randomUUID(), correlationId: tx.idempotencyKey };
    await this.outboxRepo.save(
      OutboxMessage.enqueue(randomUUID(), WagerTransactionRejected.from(tx, ctx)),
    );

    return {
      transactionId: tx.id,
      status: tx.status,
      balance: balanceAtRejection.toJSON(),
      idempotentReplay: false,
    };
  }

  // -------------------------------------------------------------------------
  // Reference validation
  // -------------------------------------------------------------------------

  private validateReferenceCompatibility(
    tx: WagerTransaction,
    reference: WagerTransaction,
  ): void {
    if (reference.providerId !== tx.providerId) {
      throw new ReferenceValidationError(
        `Reference provider mismatch: expected ${tx.providerId}, got ${reference.providerId}`,
        FailureCode.InvalidReference,
      );
    }
    if (reference.playerId !== tx.playerId) {
      throw new ReferenceValidationError(
        `Reference player mismatch: expected ${tx.playerId}, got ${reference.playerId}`,
        FailureCode.InvalidReference,
      );
    }
    if (reference.walletId !== tx.walletId) {
      throw new ReferenceValidationError(
        `Reference wallet mismatch: expected ${tx.walletId}, got ${reference.walletId}`,
        FailureCode.InvalidReference,
      );
    }
    if (reference.money.currency !== tx.money.currency) {
      throw new ReferenceValidationError(
        `Reference currency mismatch: expected ${tx.money.currency}, got ${reference.money.currency}`,
        FailureCode.InvalidReference,
      );
    }
    if (reference.roundId !== tx.roundId) {
      throw new ReferenceValidationError(
        `Reference round mismatch: expected ${tx.roundId}, got ${reference.roundId}`,
        FailureCode.InvalidReference,
      );
    }

    // REFUND: reference must be a processed BET
    if (tx.kind === WagerTransactionKind.Refund) {
      if (reference.kind !== WagerTransactionKind.Bet) {
        throw new ReferenceValidationError(
          `REFUND reference must be a BET, got ${reference.kind}`,
          FailureCode.InvalidReference,
        );
      }
      if (reference.status !== WagerTransactionStatus.Processed) {
        throw new ReferenceValidationError(
          `REFUND reference must be PROCESSED, got ${reference.status}`,
          FailureCode.InvalidReference,
        );
      }
      if (!reference.money.equals(tx.money)) {
        throw new ReferenceValidationError(
          `REFUND amount must equal the referenced BET amount`,
          FailureCode.InvalidReference,
        );
      }
    }

    // ROLLBACK: reference must be BET, WIN, or REFUND (all processed)
    if (tx.kind === WagerTransactionKind.Rollback) {
      const allowedKinds: WagerTransactionKind[] = [
        WagerTransactionKind.Bet,
        WagerTransactionKind.Win,
        WagerTransactionKind.Refund,
      ];
      if (!allowedKinds.includes(reference.kind)) {
        throw new ReferenceValidationError(
          `ROLLBACK reference must be BET, WIN or REFUND, got ${reference.kind}`,
          FailureCode.InvalidReference,
        );
      }
      if (reference.status !== WagerTransactionStatus.Processed) {
        throw new ReferenceValidationError(
          `ROLLBACK reference must be PROCESSED, got ${reference.status}`,
          FailureCode.InvalidReference,
        );
      }
      if (!reference.money.equals(tx.money)) {
        throw new ReferenceValidationError(
          `ROLLBACK amount must equal the referenced transaction amount`,
          FailureCode.InvalidReference,
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Financial operations
  // -------------------------------------------------------------------------

  private async applyWithoutReference(
    tx: WagerTransaction,
    wallet: Wallet,
    now: Date,
  ): Promise<ProcessTransactionResultDto> {
    if (tx.kind === WagerTransactionKind.Loss) {
      return this.applyLoss(tx, wallet, now);
    }

    if (tx.kind === WagerTransactionKind.Bet) {
      return this.applyBet(tx, wallet, now);
    }

    if (tx.kind === WagerTransactionKind.Win) {
      return this.applyWin(tx, wallet, undefined, now);
    }

    // Should not reach here — BET/WIN/LOSS cover all non-reference kinds
    throw new Error(`Unexpected transaction kind without reference: ${tx.kind}`);
  }

  private async applyWithReference(
    tx: WagerTransaction,
    wallet: Wallet,
    reference: WagerTransaction,
    now: Date,
  ): Promise<ProcessTransactionResultDto> {
    if (tx.kind === WagerTransactionKind.Win) {
      return this.applyWin(tx, wallet, reference, now);
    }
    if (tx.kind === WagerTransactionKind.Refund) {
      return this.applyCredit(tx, wallet, reference, now);
    }
    if (tx.kind === WagerTransactionKind.Rollback) {
      return this.applyRollback(tx, wallet, reference, now);
    }

    throw new Error(`Unexpected transaction kind with reference: ${tx.kind}`);
  }

  private async applyLoss(
    tx: WagerTransaction,
    wallet: Wallet,
    now: Date,
  ): Promise<ProcessTransactionResultDto> {
    tx.markProcessed(undefined, wallet.balance, now);
    await this.wagerTxRepo.save(tx);

    const ctx = { eventId: randomUUID(), correlationId: tx.idempotencyKey };
    await this.outboxRepo.save(
      OutboxMessage.enqueue(randomUUID(), WagerTransactionProcessed.from(tx, ctx)),
    );

    return toResult(tx, false);
  }

  private async applyBet(
    tx: WagerTransaction,
    wallet: Wallet,
    now: Date,
  ): Promise<ProcessTransactionResultDto> {
    try {
      const entry = wallet.debit({
        money: tx.money,
        transactionId: tx.id,
        ledgerEntryId: randomUUID(),
        at: now,
      });

      tx.markProcessed(undefined, wallet.balance, now);

      await this.walletRepo.save(wallet);
      await this.ledgerRepo.save(entry);
      await this.wagerTxRepo.save(tx);

      const correlationId = tx.idempotencyKey;
      await this.outboxRepo.save(
        OutboxMessage.enqueue(
          randomUUID(),
          WalletBalanceChanged.from(wallet, entry, {
            eventId: randomUUID(),
            correlationId,
          }),
        ),
      );
      await this.outboxRepo.save(
        OutboxMessage.enqueue(
          randomUUID(),
          WagerTransactionProcessed.from(tx, {
            eventId: randomUUID(),
            correlationId,
          }),
        ),
      );

      return toResult(tx, false);
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return this.persistRejected(tx, wallet, FailureCode.InsufficientBalance, now);
      }
      if (err instanceof WalletCurrencyMismatchError) {
        return this.persistRejected(tx, wallet, FailureCode.CurrencyMismatch, now);
      }
      throw err;
    }
  }

  private async applyWin(
    tx: WagerTransaction,
    wallet: Wallet,
    reference: WagerTransaction | undefined,
    now: Date,
  ): Promise<ProcessTransactionResultDto> {
    let entry;
    try {
      entry = wallet.credit({
        money: tx.money,
        transactionId: tx.id,
        ledgerEntryId: randomUUID(),
        at: now,
      });
    } catch (err) {
      if (err instanceof WalletCurrencyMismatchError) {
        return this.persistRejected(tx, wallet, FailureCode.CurrencyMismatch, now);
      }
      throw err;
    }

    tx.markProcessed(reference?.id, wallet.balance, now);

    await this.walletRepo.save(wallet);
    await this.ledgerRepo.save(entry);
    await this.wagerTxRepo.save(tx);

    const correlationId = tx.idempotencyKey;
    await this.outboxRepo.save(
      OutboxMessage.enqueue(
        randomUUID(),
        WalletBalanceChanged.from(wallet, entry, {
          eventId: randomUUID(),
          correlationId,
        }),
      ),
    );
    await this.outboxRepo.save(
      OutboxMessage.enqueue(
        randomUUID(),
        WagerTransactionProcessed.from(tx, {
          eventId: randomUUID(),
          correlationId,
        }),
      ),
    );

    return toResult(tx, false);
  }

  private async applyCredit(
    tx: WagerTransaction,
    wallet: Wallet,
    reference: WagerTransaction,
    now: Date,
  ): Promise<ProcessTransactionResultDto> {
    let entry;
    try {
      entry = wallet.credit({
        money: tx.money,
        transactionId: tx.id,
        ledgerEntryId: randomUUID(),
        at: now,
      });
    } catch (err) {
      if (err instanceof WalletCurrencyMismatchError) {
        return this.persistRejected(tx, wallet, FailureCode.CurrencyMismatch, now);
      }
      throw err;
    }

    tx.markProcessed(reference.id, wallet.balance, now);

    await this.walletRepo.save(wallet);
    await this.ledgerRepo.save(entry);
    await this.wagerTxRepo.save(tx);

    const correlationId = tx.idempotencyKey;
    await this.outboxRepo.save(
      OutboxMessage.enqueue(
        randomUUID(),
        WalletBalanceChanged.from(wallet, entry, {
          eventId: randomUUID(),
          correlationId,
        }),
      ),
    );
    await this.outboxRepo.save(
      OutboxMessage.enqueue(
        randomUUID(),
        WagerTransactionProcessed.from(tx, {
          eventId: randomUUID(),
          correlationId,
        }),
      ),
    );

    return toResult(tx, false);
  }

  private async applyRollback(
    tx: WagerTransaction,
    wallet: Wallet,
    reference: WagerTransaction,
    now: Date,
  ): Promise<ProcessTransactionResultDto> {
    // Direction is the inverse of the reference's direction.
    // BET (DEBIT) → ROLLBACK credits; WIN/REFUND (CREDIT) → ROLLBACK debits.
    const refDirection = reference.ledgerDirectionFor();
    const isCredit = refDirection === 'DEBIT';

    try {
      const entry = isCredit
        ? wallet.credit({
            money: tx.money,
            transactionId: tx.id,
            ledgerEntryId: randomUUID(),
            at: now,
          })
        : wallet.debit({
            money: tx.money,
            transactionId: tx.id,
            ledgerEntryId: randomUUID(),
            at: now,
          });

      tx.markProcessed(reference.id, wallet.balance, now);

      await this.walletRepo.save(wallet);
      await this.ledgerRepo.save(entry);
      await this.wagerTxRepo.save(tx);

      const correlationId = tx.idempotencyKey;
      await this.outboxRepo.save(
        OutboxMessage.enqueue(
          randomUUID(),
          WalletBalanceChanged.from(wallet, entry, {
            eventId: randomUUID(),
            correlationId,
          }),
        ),
      );
      await this.outboxRepo.save(
        OutboxMessage.enqueue(
          randomUUID(),
          WagerTransactionProcessed.from(tx, {
            eventId: randomUUID(),
            correlationId,
          }),
        ),
      );

      return toResult(tx, false);
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return this.persistRejected(
          tx,
          wallet,
          FailureCode.ReversalWouldNegateBalance,
          now,
        );
      }
      if (err instanceof WalletCurrencyMismatchError) {
        return this.persistRejected(tx, wallet, FailureCode.CurrencyMismatch, now);
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toResult(
  tx: WagerTransaction,
  idempotentReplay: boolean,
): ProcessTransactionResultDto {
  return {
    transactionId: tx.id,
    status: tx.status,
    balance: tx.observedBalance?.toJSON() ?? Money.zero(tx.money.currency).toJSON(),
    idempotentReplay,
  };
}
