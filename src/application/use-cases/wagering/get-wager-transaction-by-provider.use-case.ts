import { WagerTransactionRepositoryPort } from '../../ports/repositories/wager-transaction-repository.port.js';
import { WagerTransactionDto } from '../shared/use-case.types.js';
import {
  toWagerTransactionDto,
} from './get-wager-transaction-by-id.use-case.js';
import { WagerTransactionNotFoundError } from './wagering.errors.js';

export interface GetWagerTransactionByProviderQuery {
  providerId: string;
  externalTransactionId: string;
}

export class GetWagerTransactionByProviderUseCase {
  constructor(private readonly wagerTxRepo: WagerTransactionRepositoryPort) {}

  async execute(query: GetWagerTransactionByProviderQuery): Promise<WagerTransactionDto> {
    const tx = await this.wagerTxRepo.findByProviderAndExternalId(
      query.providerId,
      query.externalTransactionId,
    );
    if (!tx) {
      throw new WagerTransactionNotFoundError(
        `providerId=${query.providerId} externalTransactionId=${query.externalTransactionId}`,
      );
    }
    return toWagerTransactionDto(tx);
  }
}
