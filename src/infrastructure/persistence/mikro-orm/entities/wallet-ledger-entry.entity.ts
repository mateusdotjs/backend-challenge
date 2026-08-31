import { type InferEntity, defineEntity, p } from '@mikro-orm/core';

import { LedgerDirection } from '../../../../domain/ledger/ledger.enums.js';

export const WalletLedgerEntryEntity = defineEntity({
  name: 'WalletLedgerEntry',
  properties: {
    id: p.uuid().primary(),
    walletId: p.uuid(),
    transactionId: p.uuid(),
    direction: p.enum(() => LedgerDirection),
    moneyAmount: p.string().columnType('numeric(18,2)'),
    moneyCurrency: p.string(),
    balanceBeforeAmount: p.string().columnType('numeric(18,2)'),
    balanceBeforeCurrency: p.string(),
    balanceAfterAmount: p.string().columnType('numeric(18,2)'),
    balanceAfterCurrency: p.string(),
    createdAt: p.datetime(),
  },
});

export type IWalletLedgerEntry = InferEntity<typeof WalletLedgerEntryEntity>;
