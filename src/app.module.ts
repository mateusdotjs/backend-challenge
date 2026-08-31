import { Module } from '@nestjs/common';

import { MikroOrmPersistenceModule } from './infrastructure/persistence/mikro-orm/mikro-orm.module.js';

@Module({
  imports: [MikroOrmPersistenceModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
