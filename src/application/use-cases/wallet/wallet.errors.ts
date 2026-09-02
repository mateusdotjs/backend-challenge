export class WalletNotFoundError extends Error {
  constructor(walletId: string) {
    super(`Wallet not found: ${walletId}`);
    this.name = 'WalletNotFoundError';
  }
}
