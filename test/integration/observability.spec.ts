import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import request from 'supertest';

import {
  createTestApp,
  type TestAppContext,
} from '../helpers/app.factory.js';

describe('integration: observability', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('returns correlation id header on HTTP requests', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/health/live')
      .set('x-correlation-id', 'corr-test-123');

    expect(response.status).toBe(200);
    expect(response.headers['x-correlation-id']).toBe('corr-test-123');
  });

  it('exposes Prometheus metrics', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('wager_transactions_total');
    expect(response.text).toContain('outbox_pending_total');
  });

  it('reports readiness with postgres and sqs checks', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body.checks.postgres).toBe('ok');
    expect(response.body.checks.sqs).toBe('ok');
  });

  it('keeps liveness independent from external dependencies', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/health/live');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});
