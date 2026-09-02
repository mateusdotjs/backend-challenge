import { getLogContext } from './log-context.js';

export type LogLevel = 'log' | 'warn' | 'error';

export class StructuredLogger {
  constructor(private readonly context: string) {}

  log(event: string, fields?: Record<string, unknown>): void {
    this.write('log', event, fields);
  }

  warn(event: string, fields?: Record<string, unknown>): void {
    this.write('warn', event, fields);
  }

  error(
    event: string,
    fields?: Record<string, unknown>,
    error?: unknown,
  ): void {
    this.write('error', event, fields, errorFields(error));
  }

  private write(
    level: LogLevel,
    event: string,
    fields?: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): void {
    const payload = omitEmpty({
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      event,
      ...getLogContext(),
      ...omitEmpty(fields ?? {}),
      ...omitEmpty(extra ?? {}),
    });

    const line = JSON.stringify(payload);
    if (level === 'error') {
      console.error(line);
      return;
    }
    if (level === 'warn') {
      console.warn(line);
      return;
    }
    console.log(line);
  }
}

function errorFields(error: unknown): Record<string, unknown> {
  if (error === undefined || error === null) {
    return {};
  }
  if (typeof error !== 'object') {
    return { errorMessage: String(error) };
  }

  const err = error as {
    name?: unknown;
    message?: unknown;
    failureCode?: unknown;
    stack?: unknown;
  };

  return omitEmpty({
    errorName: err.name,
    errorMessage: err.message,
    failureCode: err.failureCode,
    stack: err.stack,
  });
}

function omitEmpty(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  );
}
