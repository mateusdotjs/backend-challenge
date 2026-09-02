import { Global, Module } from '@nestjs/common';

import { ApplicationModule } from '../application/application.module.js';
import { MikroOrmPersistenceModule } from './persistence/mikro-orm/mikro-orm.module.js';

import { MetricsController } from './metrics/metrics.controller.js';
import { MetricsService } from './metrics/metrics.service.js';
import { OutboxBacklogProbe } from './metrics/outbox-backlog.probe.js';
import {
  PROCESS_WAGER_TRANSACTION_ADAPTER,
  ProcessWagerTransactionAdapter,
} from './wagering/process-wager-transaction.adapter.js';

@Global()
@Module({
  imports: [ApplicationModule, MikroOrmPersistenceModule],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    OutboxBacklogProbe,
    ProcessWagerTransactionAdapter,
    {
      provide: PROCESS_WAGER_TRANSACTION_ADAPTER,
      useExisting: ProcessWagerTransactionAdapter,
    },
  ],
  exports: [
    MetricsService,
    OutboxBacklogProbe,
    ProcessWagerTransactionAdapter,
    PROCESS_WAGER_TRANSACTION_ADAPTER,
  ],
})
export class ObservabilityModule {}
