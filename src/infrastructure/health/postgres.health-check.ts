import { Injectable } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/core';

@Injectable()
export class PostgresHealthCheck {
  constructor(private readonly orm: MikroORM) {}

  async isHealthy(): Promise<boolean> {
    if (!(await this.orm.isConnected())) {
      return false;
    }

    try {
      await this.orm.em.getConnection().execute('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
