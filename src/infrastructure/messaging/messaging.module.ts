import { Module } from '@nestjs/common';

import { ApplicationModule } from '../../application/application.module.js';
import { MikroOrmPersistenceModule } from '../persistence/mikro-orm/mikro-orm.module.js';

import { SQS_CLIENT, createSqsClient } from './sqs/sqs.client.js';
import { WagerTransactionConsumer } from './sqs/wager-transaction.consumer.js';

@Module({
  imports: [ApplicationModule, MikroOrmPersistenceModule],
  providers: [
    { provide: SQS_CLIENT, useFactory: createSqsClient },
    WagerTransactionConsumer,
  ],
  exports: [SQS_CLIENT],
})
export class MessagingModule {}
