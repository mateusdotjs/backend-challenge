import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

import { IsMoneyAmount } from '../validators/money-amount.validator.js';

export class MoneyDto {
  @IsString()
  @IsNotEmpty()
  @IsMoneyAmount()
  amount!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  currency!: string;
}
