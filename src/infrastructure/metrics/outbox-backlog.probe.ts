import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';

import { OutboxMessageEntity } from '../persistence/mikro-orm/entities/outbox-message.entity.js';

import { MetricsService } from './metrics.service.js';

@Injectable()
export class OutboxBacklogProbe {
  constructor(
    private readonly em: EntityManager,
    private readonly metrics: MetricsService,
  ) {}

  async refresh(): Promise<number> {
    const em = this.em.fork();
    const now = new Date();
    const count = await em.count(OutboxMessageEntity, {
      publishedAt: null,
      $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
    });
    this.metrics.setOutboxPending(count);
    return count;
  }
}
