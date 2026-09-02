import { WalletRepositoryPort } from '../../ports/repositories/wallet-repository.port.js';
import { WalletDto } from '../shared/use-case.types.js';
import { toWalletDto } from './create-wallet.use-case.js';
import { WalletNotFoundError } from './wallet.errors.js';

export class GetWalletUseCase {
  constructor(private readonly walletRepo: WalletRepositoryPort) {}

  async execute(walletId: string): Promise<WalletDto> {
    const wallet = await this.walletRepo.findById(walletId);
    if (!wallet) {
      throw new WalletNotFoundError(walletId);
    }
    return toWalletDto(wallet);
  }
}
