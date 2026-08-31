import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const value = request.headers['idempotency-key'];

    if (value === undefined || value === null) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const trimmed = value.trim();
    if (trimmed === '') {
      throw new BadRequestException('Idempotency-Key header must not be empty');
    }

    return trimmed;
  },
);
