import { Controller, Get, Param } from '@nestjs/common';

import { GetWagerTransactionByProviderUseCase } from '../../../application/use-cases/wagering/get-wager-transaction-by-provider.use-case.js';

@Controller('providers/:providerId/wagering/transactions')
export class ProviderWageringController {
  constructor(
    private readonly getWagerTransactionByProvider: GetWagerTransactionByProviderUseCase,
  ) {}

  @Get(':externalTransactionId')
  getByProvider(
    @Param('providerId') providerId: string,
    @Param('externalTransactionId') externalTransactionId: string,
  ) {
    return this.getWagerTransactionByProvider.execute({
      providerId,
      externalTransactionId,
    });
  }
}
