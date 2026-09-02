import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';

import { PostgresHealthCheck } from './postgres.health-check.js';
import { SqsHealthCheck } from './sqs.health-check.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly postgresHealth: PostgresHealthCheck,
    private readonly sqsHealth: SqsHealthCheck,
  ) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    const [postgresOk, sqsOk] = await Promise.all([
      this.postgresHealth.isHealthy(),
      this.sqsHealth.isHealthy(),
    ]);

    if (!postgresOk || !sqsOk) {
      throw new ServiceUnavailableException({
        status: 'error',
        checks: {
          postgres: postgresOk ? 'ok' : 'error',
          sqs: sqsOk ? 'ok' : 'error',
        },
      });
    }

    return {
      status: 'ok',
      checks: {
        postgres: 'ok',
        sqs: 'ok',
      },
    };
  }
}
