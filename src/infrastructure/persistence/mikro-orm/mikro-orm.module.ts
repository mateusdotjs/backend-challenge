import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';

import { WalletEntity } from './entities/wallet.entity.js';
import { WagerTransactionEntity } from './entities/wager-transaction.entity.js';
import { WalletLedgerEntryEntity } from './entities/wallet-ledger-entry.entity.js';
import { InboxMessageEntity } from './entities/inbox-message.entity.js';
import { OutboxMessageEntity } from './entities/outbox-message.entity.js';

import { WalletMikroOrmRepository } from './repositories/wallet.repository.js';
import { WagerTransactionMikroOrmRepository } from './repositories/wager-transaction.repository.js';
import { LedgerMikroOrmRepository } from './repositories/ledger.repository.js';
import { InboxMikroOrmRepository } from './repositories/inbox.repository.js';
import { OutboxMikroOrmRepository } from './repositories/outbox.repository.js';
import { MikroOrmUnitOfWork } from './unit-of-work/mikro-orm-unit-of-work.js';

import config from './mikro-orm.config.js';

export const WALLET_REPOSITORY = 'WalletRepositoryPort';
export const WAGER_TRANSACTION_REPOSITORY = 'WagerTransactionRepositoryPort';
export const LEDGER_REPOSITORY = 'LedgerRepositoryPort';
export const INBOX_REPOSITORY = 'InboxRepositoryPort';
export const OUTBOX_REPOSITORY = 'OutboxRepositoryPort';
export const UNIT_OF_WORK = 'UnitOfWorkPort';

@Module({
  imports: [
    MikroOrmModule.forRoot(config),
    MikroOrmModule.forFeature([
      WalletEntity,
      WagerTransactionEntity,
      WalletLedgerEntryEntity,
      InboxMessageEntity,
      OutboxMessageEntity,
    ]),
  ],
  providers: [
    { provide: WALLET_REPOSITORY, useClass: WalletMikroOrmRepository },
    {
      provide: WAGER_TRANSACTION_REPOSITORY,
      useClass: WagerTransactionMikroOrmRepository,
    },
    { provide: LEDGER_REPOSITORY, useClass: LedgerMikroOrmRepository },
    { provide: INBOX_REPOSITORY, useClass: InboxMikroOrmRepository },
    { provide: OUTBOX_REPOSITORY, useClass: OutboxMikroOrmRepository },
    { provide: UNIT_OF_WORK, useClass: MikroOrmUnitOfWork },
  ],
  exports: [
    WALLET_REPOSITORY,
    WAGER_TRANSACTION_REPOSITORY,
    LEDGER_REPOSITORY,
    INBOX_REPOSITORY,
    OUTBOX_REPOSITORY,
    UNIT_OF_WORK,
  ],
})
export class MikroOrmPersistenceModule {}
