import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { ProcessWagerTransactionUseCase } from '../../../application/use-cases/wagering/process-wager-transaction.use-case.js';
import { GetWagerTransactionByIdUseCase } from '../../../application/use-cases/wagering/get-wager-transaction-by-id.use-case.js';
import { ProcessTransactionResultDto } from '../../../application/use-cases/shared/use-case.types.js';
import { WagerTransactionStatus } from '../../../domain/wagering/wager-transaction.enums.js';
import { IdempotencyKey } from '../decorators/idempotency-key.decorator.js';
import { ProcessWagerTransactionDto } from '../dto/process-wager-transaction.dto.js';
import { toProcessWagerTransactionCommand } from '../mappers/wagering.mapper.js';

@Controller('wagering')
export class WageringController {
  constructor(
    private readonly processWagerTransaction: ProcessWagerTransactionUseCase,
    private readonly getWagerTransactionById: GetWagerTransactionByIdUseCase,
  ) {}

  @Post('transactions')
  async submitTransaction(
    @Body() dto: ProcessWagerTransactionDto,
    @IdempotencyKey() idempotencyKey: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ProcessTransactionResultDto> {
    const result = await this.processWagerTransaction.execute(
      toProcessWagerTransactionCommand(dto, idempotencyKey),
    );

    res.status(this.mapProcessStatusToHttp(result));
    return result;
  }

  @Get('transactions/:transactionId')
  getById(@Param('transactionId', ParseUUIDPipe) transactionId: string) {
    return this.getWagerTransactionById.execute(transactionId);
  }

  private mapProcessStatusToHttp(result: ProcessTransactionResultDto): number {
    switch (result.status) {
      case WagerTransactionStatus.Processed:
        return result.idempotentReplay
          ? HttpStatus.OK
          : HttpStatus.CREATED;
      case WagerTransactionStatus.Rejected:
        return HttpStatus.UNPROCESSABLE_ENTITY;
      case WagerTransactionStatus.Pending:
      case WagerTransactionStatus.PendingReference:
        return HttpStatus.ACCEPTED;
      default:
        return HttpStatus.OK;
    }
  }
}
