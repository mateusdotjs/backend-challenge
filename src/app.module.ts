import { Module } from '@nestjs/common';

import { ApplicationModule } from './application/application.module.js';
import { HttpModule } from './infrastructure/http/http.module.js';

@Module({
  imports: [ApplicationModule, HttpModule],
})
export class AppModule {}
