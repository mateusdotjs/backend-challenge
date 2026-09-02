export function isWalletConcurrencyError(err: unknown): boolean {
  const codes = new Set(['40001', '40P01', '55P03']);
  let current: unknown = err;
  while (current && typeof current === 'object') {
    const code = (current as { code?: string }).code;
    if (code && codes.has(code)) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
