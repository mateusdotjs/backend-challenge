import { Module } from '@nestjs/common';

import { ApplicationModule } from './application/application.module.js';
import { HealthModule } from './infrastructure/health/health.module.js';
import { HttpModule } from './infrastructure/http/http.module.js';
import { MessagingModule } from './infrastructure/messaging/messaging.module.js';
import { ObservabilityModule } from './infrastructure/observability.module.js';

@Module({
  imports: [
    ApplicationModule,
    ObservabilityModule,
    HttpModule,
    MessagingModule,
    HealthModule,
  ],
})
export class AppModule {}
