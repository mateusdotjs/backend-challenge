import { randomUUID } from 'crypto';
import { Money } from '../../../domain/shared/money/money.js';
import { Wallet } from '../../../domain/wallet/wallet.js';
import { WagerTransaction } from '../../../domain/wagering/wager-transaction.js';
import { WalletLedgerEntry } from '../../../domain/ledger/wallet-ledger-entry.js';
import { LedgerDirection } from '../../../domain/ledger/ledger.enums.js';
import { OutboxMessage } from '../../../domain/messaging/outbox-message.js';
import { WagerTransactionProcessed } from '../../../domain/messaging/events/wager-transaction-processed.event.js';
import { WalletBalanceChanged } from '../../../domain/messaging/events/wallet-balance-changed.event.js';
import { WalletRepositoryPort } from '../../ports/repositories/wallet-repository.port.js';
import { WagerTransactionRepositoryPort } from '../../ports/repositories/wager-transaction-repository.port.js';
import { LedgerRepositoryPort } from '../../ports/repositories/ledger-repository.port.js';
import { OutboxRepositoryPort } from '../../ports/repositories/outbox-repository.port.js';
import { UnitOfWorkPort } from '../../ports/unit-of-work.port.js';
import { ClockPort } from '../../ports/clock.port.js';
import { CreateWalletCommand, WalletDto } from '../shared/use-case.types.js';

export class CreateWalletUseCase {
  constructor(
    private readonly walletRepo: WalletRepositoryPort,
    private readonly wagerTxRepo: WagerTransactionRepositoryPort,
    private readonly ledgerRepo: LedgerRepositoryPort,
    private readonly outboxRepo: OutboxRepositoryPort,
    private readonly uow: UnitOfWorkPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(command: CreateWalletCommand): Promise<WalletDto> {
    const now = this.clock.now();
    const initialBalance = Money.from(command.initialBalance);

    return this.uow.runInTransaction(async () => {
      // Open the wallet directly with the initial balance.
      // version = 1 after open — version only increments on subsequent balance changes.
      const wallet = Wallet.open({
        id: randomUUID(),
        playerId: command.playerId,
        balance: initialBalance,
        createdAt: now,
      });

      await this.walletRepo.save(wallet);
      // #region agent log
      fetch('http://127.0.0.1:7557/ingest/03872681-9ff9-405b-8a84-5368f552b0d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'892c16'},body:JSON.stringify({sessionId:'892c16',location:'create-wallet.use-case.ts:execute',message:'wallet saved',data:{walletId:wallet.id,initialBalancePositive:initialBalance.isPositive()},timestamp:Date.now(),hypothesisId:'B',runId:'post-fix'})}).catch(()=>{});
      // #endregion

      if (initialBalance.isPositive()) {
        // Create the internal OPENING transaction.
        const tx = WagerTransaction.createOpening({
          id: randomUUID(),
          providerId: 'system',
          externalTransactionId: `opening:${wallet.id}`,
          idempotencyKey: `opening:${wallet.id}`,
          payloadHash: `opening:${wallet.id}`,
          walletId: wallet.id,
          playerId: command.playerId,
          roundId: `opening:${wallet.id}`,
          gameId: 'system',
          money: initialBalance,
          createdAt: now,
        });

        // Build the ledger entry directly, recording the initial credit.
        // We do NOT call wallet.credit() here because the balance was already
        // set in Wallet.open(), so version stays at 1.
        const entry = WalletLedgerEntry.create({
          id: randomUUID(),
          walletId: wallet.id,
          transactionId: tx.id,
          direction: LedgerDirection.Credit,
          money: initialBalance,
          balanceBefore: Money.zero(initialBalance.currency),
          balanceAfter: initialBalance,
          createdAt: now,
        });

        tx.markProcessed(undefined, wallet.balance, now);

        await this.wagerTxRepo.save(tx);
        await this.ledgerRepo.save(entry);

        const balanceCtx = { eventId: randomUUID(), correlationId: tx.id };
        const processedCtx = { eventId: randomUUID(), correlationId: tx.id };

        await this.outboxRepo.save(
          OutboxMessage.enqueue(randomUUID(), WalletBalanceChanged.from(wallet, entry, balanceCtx)),
        );
        await this.outboxRepo.save(
          OutboxMessage.enqueue(randomUUID(), WagerTransactionProcessed.from(tx, processedCtx)),
        );
        // #region agent log
        fetch('http://127.0.0.1:7557/ingest/03872681-9ff9-405b-8a84-5368f552b0d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'892c16'},body:JSON.stringify({sessionId:'892c16',location:'create-wallet.use-case.ts:execute',message:'opening flow completed including outbox',data:{walletId:wallet.id,txId:tx.id},timestamp:Date.now(),hypothesisId:'A',runId:'post-fix'})}).catch(()=>{});
        // #endregion
      }

      return toWalletDto(wallet);
    });
  }
}

export function toWalletDto(wallet: Wallet): WalletDto {
  return {
    id: wallet.id,
    playerId: wallet.playerId,
    currency: wallet.currency,
    balance: wallet.balance.toJSON(),
    version: wallet.version,
  };
}
