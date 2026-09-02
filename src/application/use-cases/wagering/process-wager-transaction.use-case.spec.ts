import { describe, expect, it } from 'bun:test';

import { Money } from '../../../domain/shared/money/money.js';
import { FailureCode } from '../../../domain/shared/failure-code.js';
import { Wallet } from '../../../domain/wallet/wallet.js';
import { WagerTransaction } from '../../../domain/wagering/wager-transaction.js';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../../domain/wagering/wager-transaction.enums.js';
import { WalletLedgerEntry } from '../../../domain/ledger/wallet-ledger-entry.js';
import { OutboxMessage } from '../../../domain/messaging/outbox-message.js';
import type { WalletRepositoryPort } from '../../ports/repositories/wallet-repository.port.js';
import type { WagerTransactionRepositoryPort } from '../../ports/repositories/wager-transaction-repository.port.js';
import type { LedgerRepositoryPort } from '../../ports/repositories/ledger-repository.port.js';
import type { OutboxRepositoryPort } from '../../ports/repositories/outbox-repository.port.js';
import type { UnitOfWorkPort } from '../../ports/unit-of-work.port.js';
import type { ClockPort } from '../../ports/clock.port.js';
import type { ProcessWagerTransactionCommand } from '../shared/use-case.types.js';
import {
  PayloadConflictError,
  ProcessWagerTransactionUseCase,
} from './process-wager-transaction.use-case.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');

class InMemoryWagerTxRepo implements WagerTransactionRepositoryPort {
  private readonly byId = new Map<string, WagerTransaction>();
  private readonly byIdempotency = new Map<string, WagerTransaction>();
  private readonly byProviderExternal = new Map<string, WagerTransaction>();

  async findById(id: string): Promise<WagerTransaction | null> {
    return this.byId.get(id) ?? null;
  }

  async findByIdForUpdate(id: string): Promise<WagerTransaction | null> {
    return this.findById(id);
  }

  async findByIdempotencyKey(
    providerId: string,
    idempotencyKey: string,
  ): Promise<WagerTransaction | null> {
    return this.byIdempotency.get(`${providerId}:${idempotencyKey}`) ?? null;
  }

  async findByProviderAndExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    return (
      this.byProviderExternal.get(`${providerId}:${externalTransactionId}`) ??
      null
    );
  }

  async findPendingReference(): Promise<WagerTransaction[]> {
    return [];
  }

  async findProcessedReversalByReferenceId(
    referenceTransactionId: string,
  ): Promise<WagerTransaction | null> {
    for (const tx of this.byId.values()) {
      if (
        tx.referenceTransactionId === referenceTransactionId &&
        tx.status === WagerTransactionStatus.Processed &&
        (tx.kind === WagerTransactionKind.Refund ||
          tx.kind === WagerTransactionKind.Rollback)
      ) {
        return tx;
      }
    }
    return null;
  }

  async save(tx: WagerTransaction): Promise<void> {
    this.byId.set(tx.id, tx);
    this.byIdempotency.set(`${tx.providerId}:${tx.idempotencyKey}`, tx);
    this.byProviderExternal.set(
      `${tx.providerId}:${tx.externalTransactionId}`,
      tx,
    );
  }
}

function createHarness(initialBalance = '100.00') {
  let wallet = Wallet.open({
    id: 'wallet-1',
    playerId: 'player-1',
    balance: Money.from({ amount: initialBalance, currency: 'BRL' }),
    createdAt: NOW,
  });

  const walletRepo: WalletRepositoryPort = {
    findById: async (id) => (id === wallet.id ? wallet : null),
    findByIdForUpdate: async (id) => (id === wallet.id ? wallet : null),
    findByPlayerIdAndCurrency: async () => wallet,
    save: async (w) => {
      wallet = w;
    },
  };

  const wagerTxRepo = new InMemoryWagerTxRepo();
  const ledgerEntries: WalletLedgerEntry[] = [];
  const outboxMessages: OutboxMessage[] = [];

  const ledgerRepo: LedgerRepositoryPort = {
    save: async (entry) => {
      ledgerEntries.push(entry);
    },
    findByWalletId: async () => ledgerEntries,
  };

  const outboxRepo: OutboxRepositoryPort = {
    save: async (msg) => {
      outboxMessages.push(msg);
    },
    findPending: async () => outboxMessages.filter((m) => m.isPending()),
  };

  const uow: UnitOfWorkPort = {
    runInTransaction: async (work) => work(),
  };

  const clock: ClockPort = { now: () => NOW };

  const useCase = new ProcessWagerTransactionUseCase(
    walletRepo,
    wagerTxRepo,
    ledgerRepo,
    outboxRepo,
    uow,
    clock,
  );

  return {
    useCase,
    getWallet: () => wallet,
    wagerTxRepo,
    ledgerEntries,
    outboxMessages,
  };
}

function command(
  overrides: Partial<ProcessWagerTransactionCommand> = {},
): ProcessWagerTransactionCommand {
  const base: ProcessWagerTransactionCommand = {
    idempotencyKey: 'provider-a:bet-1',
    providerId: 'provider-a',
    externalTransactionId: 'bet-1',
    playerId: 'player-1',
    walletId: 'wallet-1',
    roundId: 'round-1',
    gameId: 'game-1',
    kind: WagerTransactionKind.Bet,
    money: { amount: '25.00', currency: 'BRL' },
    ...overrides,
  };
  return base;
}

describe('ProcessWagerTransactionUseCase', () => {
  it('processes BET and debits wallet', async () => {
    const { useCase, getWallet, ledgerEntries } = createHarness();

    const result = await useCase.execute(command());

    expect(result.status).toBe(WagerTransactionStatus.Processed);
    expect(result.balance.amount).toBe('75.00');
    expect(getWallet().balance.toString()).toBe('75.00');
    expect(ledgerEntries).toHaveLength(1);
    expect(result.idempotentReplay).toBe(false);
  });

  it('rejects BET with insufficient balance', async () => {
    const { useCase, getWallet, ledgerEntries } = createHarness('10.00');

    const result = await useCase.execute(
      command({ money: { amount: '80.00', currency: 'BRL' } }),
    );

    expect(result.status).toBe(WagerTransactionStatus.Rejected);
    expect(result.failureCode).toBe(FailureCode.InsufficientBalance);
    expect(getWallet().balance.toString()).toBe('10.00');
    expect(ledgerEntries).toHaveLength(0);
  });

  it('processes WIN with credit and no reference required', async () => {
    const { useCase, getWallet, ledgerEntries } = createHarness('50.00');

    const result = await useCase.execute(
      command({
        idempotencyKey: 'provider-a:win-1',
        externalTransactionId: 'win-1',
        kind: WagerTransactionKind.Win,
        money: { amount: '15.00', currency: 'BRL' },
      }),
    );

    expect(result.status).toBe(WagerTransactionStatus.Processed);
    expect(getWallet().balance.toString()).toBe('65.00');
    expect(ledgerEntries).toHaveLength(1);
  });

  it('processes LOSS without ledger entry', async () => {
    const { useCase, getWallet, ledgerEntries, outboxMessages } =
      createHarness();

    const result = await useCase.execute(
      command({
        idempotencyKey: 'provider-a:loss-1',
        externalTransactionId: 'loss-1',
        kind: WagerTransactionKind.Loss,
        money: { amount: '0.00', currency: 'BRL' },
      }),
    );

    expect(result.status).toBe(WagerTransactionStatus.Processed);
    expect(getWallet().balance.toString()).toBe('100.00');
    expect(ledgerEntries).toHaveLength(0);
    expect(outboxMessages.some((m) => m.eventType === 'WagerTransactionProcessed')).toBe(
      true,
    );
  });

  it('processes REFUND referencing processed BET', async () => {
    const { useCase, wagerTxRepo, ledgerEntries } = createHarness();

    await useCase.execute(command());

    const result = await useCase.execute(
      command({
        idempotencyKey: 'provider-a:refund-1',
        externalTransactionId: 'refund-1',
        kind: WagerTransactionKind.Refund,
        money: { amount: '25.00', currency: 'BRL' },
        referenceExternalTransactionId: 'bet-1',
      }),
    );

    expect(result.status).toBe(WagerTransactionStatus.Processed);
    expect(result.balance.amount).toBe('100.00');
    expect(ledgerEntries).toHaveLength(2);

    const reversal = await wagerTxRepo.findByIdempotencyKey('provider-a', 'provider-a:refund-1');
    expect(reversal?.referenceTransactionId).toBeDefined();
  });

  it('rejects duplicate reversal for same reference', async () => {
    const { useCase } = createHarness();

    await useCase.execute(command());
    await useCase.execute(
      command({
        idempotencyKey: 'provider-a:refund-1',
        externalTransactionId: 'refund-1',
        kind: WagerTransactionKind.Refund,
        money: { amount: '25.00', currency: 'BRL' },
        referenceExternalTransactionId: 'bet-1',
      }),
    );

    const secondRefund = await useCase.execute(
      command({
        idempotencyKey: 'provider-a:refund-2',
        externalTransactionId: 'refund-2',
        kind: WagerTransactionKind.Refund,
        money: { amount: '25.00', currency: 'BRL' },
        referenceExternalTransactionId: 'bet-1',
      }),
    );

    expect(secondRefund.status).toBe(WagerTransactionStatus.Rejected);
  });

  it('returns idempotent replay for identical request', async () => {
    const { useCase } = createHarness();
    const cmd = command();

    const first = await useCase.execute(cmd);
    const second = await useCase.execute(cmd);

    expect(first.idempotentReplay).toBe(false);
    expect(second.idempotentReplay).toBe(true);
    expect(second.balance.amount).toBe('75.00');
  });

  it('throws PayloadConflictError for same key with different payload', async () => {
    const { useCase } = createHarness();

    await useCase.execute(command());

    await expect(
      useCase.execute(
        command({ money: { amount: '30.00', currency: 'BRL' } }),
      ),
    ).rejects.toThrow(PayloadConflictError);
  });

  it('persists PENDING_REFERENCE when reference is missing', async () => {
    const { useCase, outboxMessages } = createHarness();

    const result = await useCase.execute(
      command({
        idempotencyKey: 'provider-a:refund-1',
        externalTransactionId: 'refund-1',
        kind: WagerTransactionKind.Refund,
        money: { amount: '25.00', currency: 'BRL' },
        referenceExternalTransactionId: 'missing-bet',
      }),
    );

    expect(result.status).toBe(WagerTransactionStatus.PendingReference);
    expect(
      outboxMessages.some(
        (m) => m.eventType === 'WagerTransactionPendingReference',
      ),
    ).toBe(true);
  });

  it('rejects REFUND when reference is not a BET', async () => {
    const { useCase } = createHarness();

    await useCase.execute(
      command({
        idempotencyKey: 'provider-a:win-1',
        externalTransactionId: 'win-1',
        kind: WagerTransactionKind.Win,
        money: { amount: '10.00', currency: 'BRL' },
      }),
    );

    const result = await useCase.execute(
      command({
        idempotencyKey: 'provider-a:refund-1',
        externalTransactionId: 'refund-1',
        kind: WagerTransactionKind.Refund,
        money: { amount: '10.00', currency: 'BRL' },
        referenceExternalTransactionId: 'win-1',
      }),
    );

    expect(result.status).toBe(WagerTransactionStatus.Rejected);
  });

  it('processes ROLLBACK inverting WIN credit into debit', async () => {
    const { useCase, getWallet, ledgerEntries } = createHarness('50.00');

    await useCase.execute(
      command({
        idempotencyKey: 'provider-a:win-1',
        externalTransactionId: 'win-1',
        kind: WagerTransactionKind.Win,
        money: { amount: '20.00', currency: 'BRL' },
      }),
    );

    const result = await useCase.execute(
      command({
        idempotencyKey: 'provider-a:rollback-1',
        externalTransactionId: 'rollback-1',
        kind: WagerTransactionKind.Rollback,
        money: { amount: '20.00', currency: 'BRL' },
        referenceExternalTransactionId: 'win-1',
      }),
    );

    expect(result.status).toBe(WagerTransactionStatus.Processed);
    expect(getWallet().balance.toString()).toBe('50.00');
    expect(ledgerEntries).toHaveLength(2);
  });

  it('rejects ROLLBACK that would negate balance with distinct failure code', async () => {
    const { useCase } = createHarness('100.00');

    await useCase.execute(
      command({
        idempotencyKey: 'provider-a:win-1',
        externalTransactionId: 'win-1',
        kind: WagerTransactionKind.Win,
        money: { amount: '30.00', currency: 'BRL' },
      }),
    );

    await useCase.execute(
      command({
        idempotencyKey: 'provider-a:bet-2',
        externalTransactionId: 'bet-2',
        kind: WagerTransactionKind.Bet,
        money: { amount: '125.00', currency: 'BRL' },
      }),
    );

    const result = await useCase.execute(
      command({
        idempotencyKey: 'provider-a:rollback-1',
        externalTransactionId: 'rollback-1',
        kind: WagerTransactionKind.Rollback,
        money: { amount: '30.00', currency: 'BRL' },
        referenceExternalTransactionId: 'win-1',
      }),
    );

    expect(result.status).toBe(WagerTransactionStatus.Rejected);
    expect(result.failureCode).toBe(FailureCode.ReversalWouldNegateBalance);
  });
});
