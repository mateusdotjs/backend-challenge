import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { ApplicationModule } from '../../application/application.module.js';

import { WalletController } from './controllers/wallet.controller.js';
import { WageringController } from './controllers/wagering.controller.js';
import { ProviderWageringController } from './controllers/provider-wagering.controller.js';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware.js';

@Module({
  imports: [ApplicationModule],
  controllers: [
    WalletController,
    WageringController,
    ProviderWageringController,
  ],
})
export class HttpModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
