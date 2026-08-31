import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

import { OpeningTransactionForbiddenError } from '../../../domain/wagering/wager-transaction.errors.js';
import { ReferenceMissingError } from '../../../domain/wagering/wager-transaction.errors.js';
import { WagerTransactionNotFoundError } from '../../../application/use-cases/wagering/get-wager-transaction-by-id.use-case.js';
import { PayloadConflictError } from '../../../application/use-cases/wagering/process-wager-transaction.use-case.js';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, body } = this.mapException(exception);
    response.status(status).json(body);
  }

  private mapException(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof BadRequestException) {
      return this.mapBadRequest(exception);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : ((response as { message?: string | string[] }).message ??
            exception.message);

      return {
        status,
        body: {
          code: status === HttpStatus.BAD_REQUEST ? 'INVALID_PAYLOAD' : 'HTTP_ERROR',
          message: Array.isArray(message) ? message.join('; ') : String(message),
        },
      };
    }

    if (this.isNamedError(exception, 'WalletNotFoundError')) {
      return {
        status: HttpStatus.NOT_FOUND,
        body: {
          code: 'WALLET_NOT_FOUND',
          message: (exception as Error).message,
        },
      };
    }

    if (exception instanceof WagerTransactionNotFoundError) {
      return {
        status: HttpStatus.NOT_FOUND,
        body: {
          code: 'WAGER_TRANSACTION_NOT_FOUND',
          message: exception.message,
        },
      };
    }

    if (exception instanceof PayloadConflictError) {
      return {
        status: HttpStatus.CONFLICT,
        body: {
          code: 'IDEMPOTENCY_CONFLICT',
          message: exception.message,
        },
      };
    }

    if (
      exception instanceof OpeningTransactionForbiddenError ||
      exception instanceof ReferenceMissingError
    ) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          code: 'INVALID_PAYLOAD',
          message: (exception as Error).message,
        },
      };
    }

    if (this.isUniqueViolation(exception)) {
      return {
        status: HttpStatus.CONFLICT,
        body: {
          code: 'WALLET_CONFLICT',
          message: 'A wallet already exists for this player and currency',
        },
      };
    }

    if (this.isInfrastructureError(exception)) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        body: {
          code: 'INFRASTRUCTURE_ERROR',
          message: 'A dependency is temporarily unavailable',
        },
      };
    }

    if (exception instanceof Error && this.isInvalidPayloadMessage(exception.message)) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          code: 'INVALID_PAYLOAD',
          message: exception.message,
        },
      };
    }

    const message =
      exception instanceof Error ? exception.message : 'Unexpected error';

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: 'INTERNAL_ERROR',
        message,
      },
    };
  }

  private mapBadRequest(exception: BadRequestException): {
    status: number;
    body: ErrorBody;
  } {
    const response = exception.getResponse();
    if (typeof response === 'object' && response !== null) {
      const payload = response as {
        message?: string | string[];
        details?: unknown;
      };
      const message = payload.message ?? exception.message;

      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          code: 'INVALID_PAYLOAD',
          message: Array.isArray(message) ? message.join('; ') : String(message),
          details: payload.details,
        },
      };
    }

    return {
      status: HttpStatus.BAD_REQUEST,
      body: {
        code: 'INVALID_PAYLOAD',
        message: String(response),
      },
    };
  }

  private isNamedError(exception: unknown, name: string): boolean {
    return exception instanceof Error && exception.name === name;
  }

  private isUniqueViolation(exception: unknown): boolean {
    if (typeof exception !== 'object' || exception === null) {
      return false;
    }

    const err = exception as { code?: string; constraint?: string };
    return err.code === '23505';
  }

  private isInfrastructureError(exception: unknown): boolean {
    if (typeof exception !== 'object' || exception === null) {
      return false;
    }

    const err = exception as { code?: string; name?: string };
    const pgCodes = new Set([
      '08000',
      '08003',
      '08006',
      '57P01',
      '53300',
      'ECONNREFUSED',
      'ETIMEDOUT',
    ]);

    if (err.code && pgCodes.has(err.code)) {
      return true;
    }

    return err.name === 'ConnectionError' || err.name === 'TimeoutError';
  }

  private isInvalidPayloadMessage(message: string): boolean {
    const patterns = [
      /^Amount /,
      /^Currency /,
      /must not be empty/,
      /must not be negative/,
      /must not use scientific notation/,
      /is not a valid decimal/,
      /require a referenceExternalTransactionId/,
    ];

    return patterns.some((pattern) => pattern.test(message));
  }
}
