import { type InferEntity, defineEntity, p } from '@mikro-orm/core';

import { FailureCode } from '../../../../domain/shared/failure-code.js';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../../../domain/wagering/wager-transaction.enums.js';

export const WagerTransactionEntity = defineEntity({
  name: 'WagerTransaction',
  properties: {
    id: p.uuid().primary(),
    providerId: p.string(),
    externalTransactionId: p.string(),
    idempotencyKey: p.string(),
    payloadHash: p.string(),
    walletId: p.uuid(),
    playerId: p.string(),
    roundId: p.string(),
    gameId: p.string(),
    kind: p.enum(() => WagerTransactionKind),
    moneyAmount: p.string().columnType('numeric(18,2)'),
    moneyCurrency: p.string(),
    referenceExternalTransactionId: p.string().nullable(),
    status: p.enum(() => WagerTransactionStatus),
    referenceTransactionId: p.uuid().nullable(),
    failureCode: p.enum(() => FailureCode).nullable(),
    processedAt: p.datetime().nullable(),
    observedBalanceAmount: p.string().columnType('numeric(18,2)').nullable(),
    observedBalanceCurrency: p.string().nullable(),
    referenceResolutionAttempts: p.integer(),
    nextReferenceAttemptAt: p.datetime().nullable(),
    createdAt: p.datetime(),
  },
});

export type IWagerTransaction = InferEntity<typeof WagerTransactionEntity>;
