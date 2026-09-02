const BASE_PENDING_BACKOFF_MS = 5_000;
const MAX_PENDING_BACKOFF_MS = 5 * 60_000;

export const DEFAULT_MAX_REFERENCE_ATTEMPTS = 20;

export function nextReferenceAttemptAt(attempts: number, now: Date): Date {
  const backoffMs = Math.min(
    BASE_PENDING_BACKOFF_MS * Math.pow(2, attempts),
    MAX_PENDING_BACKOFF_MS,
  );
  return new Date(now.getTime() + backoffMs);
}
