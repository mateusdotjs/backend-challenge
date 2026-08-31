import { Module } from '@nestjs/common';

import { ApplicationModule } from '../../application/application.module.js';

import { WalletController } from './controllers/wallet.controller.js';
import { WageringController } from './controllers/wagering.controller.js';
import { ProviderWageringController } from './controllers/provider-wagering.controller.js';
import { HealthController } from './controllers/health.controller.js';
@Module({
  imports: [ApplicationModule],
  controllers: [
    WalletController,
    WageringController,
    ProviderWageringController,
    HealthController,
  ],
})
export class HttpModule {}
