import { UnderscoreNamingStrategy } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/postgresql';

import { InboxMessageEntity } from './entities/inbox-message.entity.js';
import { OutboxMessageEntity } from './entities/outbox-message.entity.js';
import { WagerTransactionEntity } from './entities/wager-transaction.entity.js';
import { WalletEntity } from './entities/wallet.entity.js';
import { WalletLedgerEntryEntity } from './entities/wallet-ledger-entry.entity.js';

export default defineConfig({
  host: process.env['DB_HOST'] ?? 'localhost',
  port: Number(process.env['DB_PORT'] ?? 5432),
  user: process.env['DB_USER'] ?? 'postgres',
  password: process.env['DB_PASSWORD'] ?? 'postgres',
  dbName: process.env['DB_NAME'] ?? 'wagering',
  entities: [
    WalletEntity,
    WagerTransactionEntity,
    WalletLedgerEntryEntity,
    InboxMessageEntity,
    OutboxMessageEntity,
  ],
  namingStrategy: UnderscoreNamingStrategy,
});
