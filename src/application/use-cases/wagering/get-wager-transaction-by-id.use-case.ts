import { WagerTransactionRepositoryPort } from '../../ports/repositories/wager-transaction-repository.port.js';
import { WagerTransactionDto } from '../shared/use-case.types.js';
import { WagerTransactionNotFoundError } from './wagering.errors.js';
import { toWagerTransactionDto } from './wagering.mapper.js';

export class GetWagerTransactionByIdUseCase {
  constructor(private readonly wagerTxRepo: WagerTransactionRepositoryPort) {}

  async execute(transactionId: string): Promise<WagerTransactionDto> {
    const tx = await this.wagerTxRepo.findById(transactionId);
    if (!tx) {
      throw new WagerTransactionNotFoundError(transactionId);
    }
    return toWagerTransactionDto(tx);
  }
}
