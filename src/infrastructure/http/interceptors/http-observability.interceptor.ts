import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, catchError, finalize, tap, throwError } from 'rxjs';

import { StructuredLogger } from '../../logging/structured-logger.js';
import { MetricsService } from '../../metrics/metrics.service.js';

@Injectable()
export class HttpObservabilityInterceptor implements NestInterceptor {
  private readonly logger = new StructuredLogger(
    HttpObservabilityInterceptor.name,
  );

  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const route = normalizeRoute(request);
    const method = request.method;
    const startedAt = performance.now();

    this.logger.log('http_request_received', { method, route });

    return next.handle().pipe(
      tap(() => {
        this.logger.log('http_request_completed', {
          method,
          route,
          statusCode: response.statusCode,
        });
      }),
      catchError((err: unknown) => {
        this.logger.error(
          'http_request_failed',
          {
            method,
            route,
            statusCode: response.statusCode,
          },
          err,
        );
        return throwError(() => err);
      }),
      finalize(() => {
        const seconds = (performance.now() - startedAt) / 1000;
        this.metrics.recordHttpDuration(method, route, seconds);
      }),
    );
  }
}

function normalizeRoute(request: Request): string {
  if (request.route?.path) {
    return `${request.baseUrl}${request.route.path}`;
  }
  return request.path;
}
