import { Module } from '@nestjs/common';

import { ApplicationModule } from '../../application/application.module.js';
import { MikroOrmPersistenceModule } from '../persistence/mikro-orm/mikro-orm.module.js';

import { SQS_CLIENT, createSqsClient } from './sqs/sqs.client.js';
import { WagerTransactionConsumer } from './sqs/wager-transaction.consumer.js';
import {
  EVENT_PUBLISHER,
  SqsEventPublisher,
} from './sqs/sqs-event.publisher.js';
import { OutboxPublisherWorker } from './sqs/outbox-publisher.worker.js';
import { PendingReferenceWorker } from './sqs/pending-reference.worker.js';

@Module({
  imports: [ApplicationModule, MikroOrmPersistenceModule],
  providers: [
    { provide: SQS_CLIENT, useFactory: createSqsClient },
    { provide: EVENT_PUBLISHER, useClass: SqsEventPublisher },
    WagerTransactionConsumer,
    OutboxPublisherWorker,
    PendingReferenceWorker,
  ],
  exports: [SQS_CLIENT],
})
export class MessagingModule {}
