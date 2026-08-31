import { Module } from '@nestjs/common';

import {
  MikroOrmPersistenceModule,
  WALLET_REPOSITORY,
  WAGER_TRANSACTION_REPOSITORY,
  LEDGER_REPOSITORY,
  OUTBOX_REPOSITORY,
  UNIT_OF_WORK,
} from '../infrastructure/persistence/mikro-orm/mikro-orm.module.js';
import { CLOCK, SystemClock } from '../infrastructure/clock/system-clock.js';

import { WalletRepositoryPort } from './ports/repositories/wallet-repository.port.js';
import { WagerTransactionRepositoryPort } from './ports/repositories/wager-transaction-repository.port.js';
import { LedgerRepositoryPort } from './ports/repositories/ledger-repository.port.js';
import { OutboxRepositoryPort } from './ports/repositories/outbox-repository.port.js';
import { UnitOfWorkPort } from './ports/unit-of-work.port.js';
import { ClockPort } from './ports/clock.port.js';

import { CreateWalletUseCase } from './use-cases/wallet/create-wallet.use-case.js';
import { GetWalletUseCase } from './use-cases/wallet/get-wallet.use-case.js';
import { GetWalletLedgerUseCase } from './use-cases/wallet/get-wallet-ledger.use-case.js';
import { ReconcileWalletUseCase } from './use-cases/wallet/reconcile-wallet.use-case.js';
import { ProcessWagerTransactionUseCase } from './use-cases/wagering/process-wager-transaction.use-case.js';
import { GetWagerTransactionByIdUseCase } from './use-cases/wagering/get-wager-transaction-by-id.use-case.js';
import { GetWagerTransactionByProviderUseCase } from './use-cases/wagering/get-wager-transaction-by-provider.use-case.js';

@Module({
  imports: [MikroOrmPersistenceModule],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: CreateWalletUseCase,
      useFactory: (
        walletRepo: WalletRepositoryPort,
        wagerTxRepo: WagerTransactionRepositoryPort,
        ledgerRepo: LedgerRepositoryPort,
        outboxRepo: OutboxRepositoryPort,
        uow: UnitOfWorkPort,
        clock: ClockPort,
      ) =>
        new CreateWalletUseCase(
          walletRepo,
          wagerTxRepo,
          ledgerRepo,
          outboxRepo,
          uow,
          clock,
        ),
      inject: [
        WALLET_REPOSITORY,
        WAGER_TRANSACTION_REPOSITORY,
        LEDGER_REPOSITORY,
        OUTBOX_REPOSITORY,
        UNIT_OF_WORK,
        CLOCK,
      ],
    },
    {
      provide: GetWalletUseCase,
      useFactory: (walletRepo: WalletRepositoryPort) =>
        new GetWalletUseCase(walletRepo),
      inject: [WALLET_REPOSITORY],
    },
    {
      provide: GetWalletLedgerUseCase,
      useFactory: (ledgerRepo: LedgerRepositoryPort) =>
        new GetWalletLedgerUseCase(ledgerRepo),
      inject: [LEDGER_REPOSITORY],
    },
    {
      provide: ReconcileWalletUseCase,
      useFactory: (
        walletRepo: WalletRepositoryPort,
        ledgerRepo: LedgerRepositoryPort,
      ) => new ReconcileWalletUseCase(walletRepo, ledgerRepo),
      inject: [WALLET_REPOSITORY, LEDGER_REPOSITORY],
    },
    {
      provide: ProcessWagerTransactionUseCase,
      useFactory: (
        walletRepo: WalletRepositoryPort,
        wagerTxRepo: WagerTransactionRepositoryPort,
        ledgerRepo: LedgerRepositoryPort,
        outboxRepo: OutboxRepositoryPort,
        uow: UnitOfWorkPort,
        clock: ClockPort,
      ) =>
        new ProcessWagerTransactionUseCase(
          walletRepo,
          wagerTxRepo,
          ledgerRepo,
          outboxRepo,
          uow,
          clock,
        ),
      inject: [
        WALLET_REPOSITORY,
        WAGER_TRANSACTION_REPOSITORY,
        LEDGER_REPOSITORY,
        OUTBOX_REPOSITORY,
        UNIT_OF_WORK,
        CLOCK,
      ],
    },
    {
      provide: GetWagerTransactionByIdUseCase,
      useFactory: (wagerTxRepo: WagerTransactionRepositoryPort) =>
        new GetWagerTransactionByIdUseCase(wagerTxRepo),
      inject: [WAGER_TRANSACTION_REPOSITORY],
    },
    {
      provide: GetWagerTransactionByProviderUseCase,
      useFactory: (wagerTxRepo: WagerTransactionRepositoryPort) =>
        new GetWagerTransactionByProviderUseCase(wagerTxRepo),
      inject: [WAGER_TRANSACTION_REPOSITORY],
    },
  ],
  exports: [
    CLOCK,
    CreateWalletUseCase,
    GetWalletUseCase,
    GetWalletLedgerUseCase,
    ReconcileWalletUseCase,
    ProcessWagerTransactionUseCase,
    GetWagerTransactionByIdUseCase,
    GetWagerTransactionByProviderUseCase,
  ],
})
export class ApplicationModule {}
