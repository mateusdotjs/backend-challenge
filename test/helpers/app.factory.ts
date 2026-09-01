import { ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/core';
import type { INestApplication } from '@nestjs/common';
import { SQSClient } from '@aws-sdk/client-sqs';

import { AppModule } from '../../src/app.module.js';
import { HttpExceptionFilter } from '../../src/infrastructure/http/filters/http-exception.filter.js';
import { CLOCK } from '../../src/infrastructure/clock/system-clock.js';
import { WagerTransactionConsumer } from '../../src/infrastructure/messaging/sqs/wager-transaction.consumer.js';
import { OutboxPublisherWorker } from '../../src/infrastructure/messaging/sqs/outbox-publisher.worker.js';
import { PendingReferenceWorker } from '../../src/infrastructure/messaging/sqs/pending-reference.worker.js';
import { SQS_CLIENT } from '../../src/infrastructure/messaging/sqs/sqs.client.js';

import type { FixedClock } from './fixed-clock.js';
import { applyTestEnv } from './test-env.js';
import {
  createTestOrm,
  truncateAllTables,
  type setupIntegrationDatabase,
  type TestOrm,
} from './database.helper.js';

const noopWorker = {
  onApplicationBootstrap: (): void => {},
  onApplicationShutdown: async (): Promise<void> => {},
};

export interface CreateTestAppOptions {
  enableWorkers?: boolean;
  fixedClock?: FixedClock;
}

export interface TestAppContext {
  moduleRef: TestingModule;
  app: INestApplication;
  orm: TestOrm;
  sqsClient: SQSClient;
}

export async function createTestApp(
  options: CreateTestAppOptions = {},
): Promise<TestAppContext> {
  applyTestEnv();

  const builder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (!options.enableWorkers) {
    builder
      .overrideProvider(WagerTransactionConsumer)
      .useValue(noopWorker)
      .overrideProvider(OutboxPublisherWorker)
      .useValue(noopWorker)
      .overrideProvider(PendingReferenceWorker)
      .useValue(noopWorker);
  }

  if (options.fixedClock) {
    builder.overrideProvider(CLOCK).useValue(options.fixedClock);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.init();

  const orm = app.get(MikroORM) as TestOrm;
  const sqsClient = app.get<SQSClient>(SQS_CLIENT);

  return { moduleRef, app, orm, sqsClient };
}

export async function createIntegrationTestContext(
  options: CreateTestAppOptions = {},
): Promise<TestAppContext> {
  applyTestEnv();
  const orm = await createTestOrm();
  await truncateAllTables(orm);
  await orm.close();

  return createTestApp(options);
}

export async function resetDatabase(app: INestApplication): Promise<void> {
  const orm = app.get(MikroORM) as TestOrm;
  await truncateAllTables(orm);
}

// Re-export for convenience in specs
export type { setupIntegrationDatabase };
