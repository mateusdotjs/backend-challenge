import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import { CreateWalletUseCase } from '../../../application/use-cases/wallet/create-wallet.use-case.js';
import { GetWalletUseCase } from '../../../application/use-cases/wallet/get-wallet.use-case.js';
import { GetWalletLedgerUseCase } from '../../../application/use-cases/wallet/get-wallet-ledger.use-case.js';
import { ReconcileWalletUseCase } from '../../../application/use-cases/wallet/reconcile-wallet.use-case.js';
import { CreateWalletDto } from '../dto/create-wallet.dto.js';
import { LedgerQueryDto } from '../dto/ledger-query.dto.js';
import {
  toCreateWalletCommand,
  toGetWalletLedgerQuery,
} from '../mappers/wallet.mapper.js';
import { MetricsService } from '../../metrics/metrics.service.js';
import { StructuredLogger } from '../../logging/structured-logger.js';

@Controller('wallets')
export class WalletController {
  private readonly logger = new StructuredLogger(WalletController.name);

  constructor(
    private readonly createWallet: CreateWalletUseCase,
    private readonly getWallet: GetWalletUseCase,
    private readonly getWalletLedger: GetWalletLedgerUseCase,
    private readonly reconcileWallet: ReconcileWalletUseCase,
    private readonly metrics: MetricsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateWalletDto) {
    return this.createWallet.execute(toCreateWalletCommand(dto));
  }

  @Get(':walletId')
  getById(@Param('walletId', ParseUUIDPipe) walletId: string) {
    return this.getWallet.execute(walletId);
  }

  @Get(':walletId/ledger')
  getLedger(
    @Param('walletId', ParseUUIDPipe) walletId: string,
    @Query() query: LedgerQueryDto,
  ) {
    return this.getWalletLedger.execute(toGetWalletLedgerQuery(walletId, query));
  }

  @Post(':walletId/reconciliation')
  @HttpCode(HttpStatus.OK)
  async reconcile(@Param('walletId', ParseUUIDPipe) walletId: string) {
    const result = await this.reconcileWallet.execute({ walletId });

    if (!result.consistent) {
      this.logger.warn('reconciliation_divergence', {
        walletId,
        storedBalance: result.storedBalance.amount,
        calculatedBalance: result.calculatedBalance.amount,
        difference: result.difference.amount,
        checkedEntries: result.checkedEntries,
      });
      this.metrics.incrementReconciliationDivergence(walletId);
    }

    return result;
  }
}
