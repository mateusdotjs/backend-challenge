import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/core';

@Controller('health')
export class HealthController {
  constructor(private readonly orm: MikroORM) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    const isConnected = await this.orm.isConnected();
    if (!isConnected) {
      throw new ServiceUnavailableException('PostgreSQL is not connected');
    }

    try {
      await this.orm.em.getConnection().execute('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('PostgreSQL is not reachable');
    }

    return { status: 'ok' };
  }
}
