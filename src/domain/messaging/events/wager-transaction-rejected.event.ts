import { MoneyProps } from '../../shared/money/money.js';
import { FailureCode } from '../../shared/failure-code.js';
import { WagerTransactionKind } from '../../wagering/wager-transaction.enums.js';
import { WagerTransaction } from '../../wagering/wager-transaction.js';
import { IntegrationEvent, IntegrationEventProps } from '../integration-event.js';
import { EventContext } from './wallet-balance-changed.event.js';

export interface WagerTransactionRejectedData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  failureCode: FailureCode;
  idempotencyKey: string;
}

export class WagerTransactionRejected extends IntegrationEvent<WagerTransactionRejectedData> {
  readonly eventType = 'WagerTransactionRejected';
  readonly version = 1;

  private constructor(props: IntegrationEventProps<WagerTransactionRejectedData>) {
    super(props);
  }

  static from(tx: WagerTransaction, ctx: EventContext): WagerTransactionRejected {
    if (!tx.failureCode) {
      throw new Error(
        `Cannot emit WagerTransactionRejected: transaction "${tx.id}" has no failureCode`,
      );
    }

    return new WagerTransactionRejected({
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
        failureCode: tx.failureCode,
        idempotencyKey: tx.idempotencyKey,
      },
    });
  }
}
