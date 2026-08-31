import { Wallet } from '../../../domain/wallet/wallet.js';

export interface WalletRepositoryPort {
  findById(id: string): Promise<Wallet | null>;

  /**
   * Load the wallet with an exclusive lock, signalling the intent to mutate
   * the balance. The adapter is responsible for translating this into
   * the appropriate database-level lock (e.g. PESSIMISTIC_WRITE in MikroORM).
   */
  findByIdForUpdate(id: string): Promise<Wallet | null>;

  findByPlayerIdAndCurrency(
    playerId: string,
    currency: string,
  ): Promise<Wallet | null>;

  save(wallet: Wallet): Promise<void>;
}
