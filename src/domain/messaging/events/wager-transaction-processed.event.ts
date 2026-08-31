import { MoneyProps } from '../../shared/money/money.js';
import { WagerTransactionKind, WagerTransactionStatus } from '../../wagering/wager-transaction.enums.js';
import { WagerTransaction } from '../../wagering/wager-transaction.js';
import { IntegrationEvent, IntegrationEventProps } from '../integration-event.js';
import { EventContext } from './wallet-balance-changed.event.js';

export interface WagerTransactionProcessedData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  kind: WagerTransactionKind;
  status: WagerTransactionStatus;
  money: MoneyProps;
  observedBalance: MoneyProps;
  idempotencyKey: string;
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionProcessedData> {
  readonly eventType = 'WagerTransactionProcessed';
  readonly version = 1;

  private constructor(props: IntegrationEventProps<WagerTransactionProcessedData>) {
    super(props);
  }

  static from(tx: WagerTransaction, ctx: EventContext): WagerTransactionProcessed {
    if (!tx.observedBalance) {
      throw new Error(
        `Cannot emit WagerTransactionProcessed: transaction "${tx.id}" has no observedBalance`,
      );
    }

    return new WagerTransactionProcessed({
      eventId: ctx.eventId,
      aggregateId: tx.walletId,
      correlationId: ctx.correlationId,
      causationId: ctx.causationId,
      occurredAt: tx.processedAt ?? tx.createdAt,
      data: {
        transactionId: tx.id,
        providerId: tx.providerId,
        externalTransactionId: tx.externalTransactionId,
        walletId: tx.walletId,
        playerId: tx.playerId,
        kind: tx.kind,
        status: tx.status,
        money: tx.money.toJSON(),
        observedBalance: tx.observedBalance.toJSON(),
        idempotencyKey: tx.idempotencyKey,
      },
    });
  }
}
