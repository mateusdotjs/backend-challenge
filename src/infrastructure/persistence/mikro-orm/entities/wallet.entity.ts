import { type InferEntity, defineEntity, p } from '@mikro-orm/core';

export const WalletEntity = defineEntity({
  name: 'Wallet',
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
