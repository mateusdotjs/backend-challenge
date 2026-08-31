import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { WagerTransactionKind } from '../../../domain/wagering/wager-transaction.enums.js';
import { MoneyDto } from './money.dto.js';

const API_WAGER_KINDS = [
  WagerTransactionKind.Bet,
  WagerTransactionKind.Win,
  WagerTransactionKind.Loss,
  WagerTransactionKind.Refund,
  WagerTransactionKind.Rollback,
] as const;

export class ProcessWagerTransactionDto {
  @IsString()
  @IsNotEmpty()
  providerId!: string;

  @IsString()
  @IsNotEmpty()
  externalTransactionId!: string;

  @IsUUID()
  playerId!: string;

  @IsUUID()
  walletId!: string;

  @IsString()
  @IsNotEmpty()
  roundId!: string;

  @IsString()
  @IsNotEmpty()
  gameId!: string;

  @IsIn(API_WAGER_KINDS)
  kind!: (typeof API_WAGER_KINDS)[number];

  @ValidateNested()
  @Type(() => MoneyDto)
  money!: MoneyDto;

  @ValidateIf(
    (dto: ProcessWagerTransactionDto) =>
      dto.kind === WagerTransactionKind.Refund ||
      dto.kind === WagerTransactionKind.Rollback,
  )
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  referenceExternalTransactionId?: string;
}
