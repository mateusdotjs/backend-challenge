import { MoneyProps } from '../../shared/money/money.js';
import { WagerTransactionKind } from '../../wagering/wager-transaction.enums.js';
import { WagerTransaction } from '../../wagering/wager-transaction.js';
import { IntegrationEvent, IntegrationEventProps } from '../integration-event.js';
import { EventContext } from './wallet-balance-changed.event.js';

export interface WagerTransactionPendingReferenceData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  referenceExternalTransactionId: string;
  referenceResolutionAttempts: number;
  nextReferenceAttemptAt: string;
  idempotencyKey: string;
}

export class WagerTransactionPendingReference extends IntegrationEvent<WagerTransactionPendingReferenceData> {
  readonly eventType = 'WagerTransactionPendingReference';
  readonly version = 1;

  private constructor(
    props: IntegrationEventProps<WagerTransactionPendingReferenceData>,
  ) {
    super(props);
  }

  static from(
    tx: WagerTransaction,
    ctx: EventContext,
  ): WagerTransactionPendingReference {
    if (!tx.referenceExternalTransactionId) {
      throw new Error(
        `Cannot emit WagerTransactionPendingReference: transaction "${tx.id}" has no referenceExternalTransactionId`,
      );
    }

    if (!tx.nextReferenceAttemptAt) {
      throw new Error(
        `Cannot emit WagerTransactionPendingReference: transaction "${tx.id}" has no nextReferenceAttemptAt`,
      );
    }

    return new WagerTransactionPendingReference({
      eventId: ctx.eventId,
      aggregateId: tx.walletId,
      correlationId: ctx.correlationId,
      causationId: ctx.causationId,
      occurredAt: tx.createdAt,
      data: {
        transactionId: tx.id,
        providerId: tx.providerId,
        externalTransactionId: tx.externalTransactionId,
        walletId: tx.walletId,
        playerId: tx.playerId,
        kind: tx.kind,
        money: tx.money.toJSON(),
        referenceExternalTransactionId: tx.referenceExternalTransactionId,
        referenceResolutionAttempts: tx.referenceResolutionAttempts,
        nextReferenceAttemptAt: tx.nextReferenceAttemptAt.toISOString(),
        idempotencyKey: tx.idempotencyKey,
      },
    });
  }
}
