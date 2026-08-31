import { IntegrationEvent } from './integration-event.js';

const MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes
const BASE_BACKOFF_MS = 5 * 1000;     // 5 seconds

export interface OutboxMessageState {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Readonly<Record<string, unknown>>;
  occurredAt: Date;
  attempts: number;
  nextAttemptAt?: Date;
  publishedAt?: Date;
}

export class OutboxMessage {
  public readonly id: string;
  public readonly aggregateId: string;
  public readonly eventType: string;
  public readonly payload: Readonly<Record<string, unknown>>;
  public readonly occurredAt: Date;
  private _attempts: number;
  private _nextAttemptAt: Date | undefined;
  private _publishedAt: Date | undefined;

  private constructor(state: OutboxMessageState) {
    this.id = state.id;
    this.aggregateId = state.aggregateId;
    this.eventType = state.eventType;
    this.payload = Object.freeze({ ...state.payload });
    this.occurredAt = state.occurredAt;
    this._attempts = state.attempts;
    this._nextAttemptAt = state.nextAttemptAt;
    this._publishedAt = state.publishedAt;
  }

  static enqueue(
    id: string,
    event: IntegrationEvent<unknown>,
  ): OutboxMessage {
    return new OutboxMessage({
      id,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: event.toJSON() as unknown as Record<string, unknown>,
      occurredAt: event.occurredAt,
      attempts: 0,
      nextAttemptAt: undefined,
      publishedAt: undefined,
    });
  }

  static rehydrate(state: OutboxMessageState): OutboxMessage {
    return new OutboxMessage(state);
  }

  get attempts(): number {
    return this._attempts;
  }

  get nextAttemptAt(): Date | undefined {
    return this._nextAttemptAt;
  }

  get publishedAt(): Date | undefined {
    return this._publishedAt;
  }

  isPending(): boolean {
    return this._publishedAt === undefined;
  }

  isDue(now: Date): boolean {
    if (!this.isPending()) {
      return false;
    }
    return this._nextAttemptAt === undefined || this._nextAttemptAt <= now;
  }

  markPublished(at: Date): void {
    this._publishedAt = at;
  }

  scheduleRetry(now: Date): void {
    this._attempts += 1;
    const backoffMs = Math.min(
      BASE_BACKOFF_MS * Math.pow(2, this._attempts - 1),
      MAX_BACKOFF_MS,
    );
    this._nextAttemptAt = new Date(now.getTime() + backoffMs);
  }
}
