import { Module } from '@nestjs/common';

import { ApplicationModule } from './application/application.module.js';
import { HttpModule } from './infrastructure/http/http.module.js';
import { MessagingModule } from './infrastructure/messaging/messaging.module.js';

@Module({
  imports: [ApplicationModule, HttpModule, MessagingModule],
})
export class AppModule {}
