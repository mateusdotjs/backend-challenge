import { type InferEntity, defineEntity, p } from '@mikro-orm/core';

export const WalletEntity = defineEntity({
  name: 'Wallet',
  uniques: [
    { properties: ['playerId', 'currency'], name: 'wallet_player_id_currency_unique' },
  ],
  checks: [
    { expression: '"balance_amount" >= 0', name: 'wallet_balance_amount_non_negative' },
  ],
  properties: {
    id: p.uuid().primary(),
    playerId: p.string(),
    currency: p.string(),
    balanceAmount: p.string().columnType('numeric(18,2)'),
    version: p.integer(),
    createdAt: p.datetime(),
    updatedAt: p.datetime(),
  },
});

export type IWallet = InferEntity<typeof WalletEntity>;
