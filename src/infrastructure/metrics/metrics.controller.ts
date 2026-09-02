import { Controller, Get, Header } from '@nestjs/common';

import { OutboxBacklogProbe } from './outbox-backlog.probe.js';
import { MetricsService } from './metrics.service.js';

@Controller()
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly outboxBacklog: OutboxBacklogProbe,
  ) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metricsEndpoint(): Promise<string> {
    await this.outboxBacklog.refresh();
    return this.metrics.render();
  }
}
