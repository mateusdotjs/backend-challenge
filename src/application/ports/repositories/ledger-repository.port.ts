import { WalletLedgerEntry } from '../../../domain/ledger/wallet-ledger-entry.js';

export interface LedgerRepositoryPort {
  save(entry: WalletLedgerEntry): Promise<void>;

  /**
   * Return all ledger entries for a wallet, ordered by creation time ascending.
   * Used for balance reconciliation and ledger queries.
   */
  findByWalletId(walletId: string): Promise<WalletLedgerEntry[]>;
}
