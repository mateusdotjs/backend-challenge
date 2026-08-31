import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const SCIENTIFIC_NOTATION = /[eE]/;

@ValidatorConstraint({ name: 'isMoneyAmount', async: false })
export class IsMoneyAmountConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const amount = value.trim();
    if (amount === '') {
      return false;
    }

    if (SCIENTIFIC_NOTATION.test(amount)) {
      return false;
    }

    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      return false;
    }

    const dotIndex = amount.indexOf('.');
    if (dotIndex !== -1 && amount.length - dotIndex - 1 > 2) {
      return false;
    }

    return true;
  }

  defaultMessage(): string {
    return 'amount must be a non-negative decimal string with at most 2 decimal places';
  }
}

export function IsMoneyAmount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsMoneyAmountConstraint,
    });
  };
}
