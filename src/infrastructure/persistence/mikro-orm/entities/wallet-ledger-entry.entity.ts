import { type InferEntity, defineEntity, p } from '@mikro-orm/core';

import { LedgerDirection } from '../../../../domain/ledger/ledger.enums.js';

export const WalletLedgerEntryEntity = defineEntity({
  name: 'WalletLedgerEntry',
  uniques: [
    { properties: ['walletId', 'transactionId'], name: 'wallet_ledger_entry_wallet_id_transaction_id_unique' },
  ],
  checks: [
    { expression: '"money_amount" >= 0', name: 'wallet_ledger_entry_money_amount_non_negative' },
    { expression: '"balance_before_amount" >= 0', name: 'wallet_ledger_entry_balance_before_amount_non_negative' },
    { expression: '"balance_after_amount" >= 0', name: 'wallet_ledger_entry_balance_after_amount_non_negative' },
  ],
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
