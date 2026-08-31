import { DomainError } from '../shared/domain.error.js';

export class AlreadyProcessedError extends DomainError {
  constructor(messageId: string) {
    super(
      `Inbox message "${messageId}" has already been processed`,
      'INVALID_TRANSACTION_STATE',
    );
  }
}

export interface ReceiveInboxProps {
  messageId: string;
  consumerName: string;
  payloadHash: string;
  receivedAt: Date;
}

export interface InboxMessageState {
  messageId: string;
  consumerName: string;
  payloadHash: string;
  receivedAt: Date;
  processedAt?: Date;
}

export class InboxMessage {
  public readonly messageId: string;
  public readonly consumerName: string;
  public readonly payloadHash: string;
  public readonly receivedAt: Date;
  private _processedAt: Date | undefined;

  private constructor(state: InboxMessageState) {
    this.messageId = state.messageId;
    this.consumerName = state.consumerName;
    this.payloadHash = state.payloadHash;
    this.receivedAt = state.receivedAt;
    this._processedAt = state.processedAt;
  }

  static receive(props: ReceiveInboxProps): InboxMessage {
    return new InboxMessage({ ...props, processedAt: undefined });
  }

  static rehydrate(state: InboxMessageState): InboxMessage {
    return new InboxMessage(state);
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  isProcessed(): boolean {
    return this._processedAt !== undefined;
  }

  markProcessed(at: Date): void {
    if (this.isProcessed()) {
      throw new AlreadyProcessedError(this.messageId);
    }
    this._processedAt = at;
  }
}
