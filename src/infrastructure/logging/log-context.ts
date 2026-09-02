import { AsyncLocalStorage } from 'async_hooks';

export interface LogContext {
  correlationId?: string;
  messageId?: string;
  transactionId?: string;
  walletId?: string;
  providerId?: string;
}

const storage = new AsyncLocalStorage<LogContext>();

export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  const parent = storage.getStore() ?? {};
  const merged = omitEmpty({ ...parent, ...omitEmpty(context) });
  return storage.run(merged, fn);
}

export function runWithLogContextAsync<T>(
  context: LogContext,
  fn: () => Promise<T>,
): Promise<T> {
  const parent = storage.getStore() ?? {};
  const merged = omitEmpty({ ...parent, ...omitEmpty(context) });
  return storage.run(merged, fn);
}

export function getLogContext(): LogContext {
  return storage.getStore() ?? {};
}

export function updateLogContext(context: LogContext): void {
  const store = storage.getStore();
  if (!store) {
    return;
  }
  Object.assign(store, omitEmpty(context));
}

function omitEmpty(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  );
}
