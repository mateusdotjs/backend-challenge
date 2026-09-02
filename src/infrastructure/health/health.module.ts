import { Module } from '@nestjs/common';

import { MikroOrmPersistenceModule } from '../persistence/mikro-orm/mikro-orm.module.js';
import { MessagingModule } from '../messaging/messaging.module.js';

import { HealthController } from './health.controller.js';
import { PostgresHealthCheck } from './postgres.health-check.js';
import { SqsHealthCheck } from './sqs.health-check.js';

@Module({
  imports: [MikroOrmPersistenceModule, MessagingModule],
  controllers: [HealthController],
  providers: [PostgresHealthCheck, SqsHealthCheck],
})
export class HealthModule {}
