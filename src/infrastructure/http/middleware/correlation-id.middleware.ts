import { randomUUID } from 'crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { runWithLogContext } from '../../logging/log-context.js';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const header = req.header('x-correlation-id');
    const correlationId =
      header && header.trim() !== '' ? header.trim() : randomUUID();
    res.setHeader('x-correlation-id', correlationId);
    runWithLogContext({ correlationId }, () => next());
  }
}
