import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './infrastructure/http/filters/http-exception.filter.js';
import { HttpObservabilityInterceptor } from './infrastructure/http/interceptors/http-observability.interceptor.js';
import { MetricsService } from './infrastructure/metrics/metrics.service.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new HttpObservabilityInterceptor(app.get(MetricsService)),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
