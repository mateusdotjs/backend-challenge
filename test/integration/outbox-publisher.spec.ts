import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { MikroORM } from '@mikro-orm/core';
import { randomUUID } from 'crypto';

import {
  createTestApp,
  resetDatabase,
  type TestAppContext,
} from '../helpers/app.factory.js';
import {
  createWallet,
  defaultWagerBody,
  submitWager,
} from '../helpers/invariants.helper.js';
import { runOutboxPublisherOnce } from '../helpers/worker.helper.js';
import {
  getQueueMessageCount,
  outboxEventsQueueUrl,
  purgeAllTestQueues,
} from '../helpers/sqs.helper.js';

describe('integration: outbox publisher', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    process.env['OUTBOX_POLL_INTERVAL_MS'] = '100';
    ctx = await createTestApp({ enableWorkers: false });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.app);
    await purgeAllTestQueues(ctx.sqsClient);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('publishes pending outbox events to SQS and marks published_at', async () => {
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '100.00');

    await submitWager(
      ctx.app,
      'provider-a:outbox-bet',
      defaultWagerBody({
        walletId: wallet.id,
        playerId,
        externalTransactionId: 'outbox-bet',
      }),
    );

    const orm = ctx.app.get(MikroORM);
    const pendingBefore = await orm.em.getConnection().execute(
      `SELECT COUNT(*)::int AS count FROM outbox_message WHERE published_at IS NULL`,
    );
    expect((pendingBefore as { count: number }[])[0].count).toBeGreaterThan(0);

    await runOutboxPublisherOnce(ctx.app);

    const published = await orm.em.getConnection().execute(
      `SELECT COUNT(*)::int AS count FROM outbox_message WHERE published_at IS NOT NULL`,
    );
    expect((published as { count: number }[])[0].count).toBeGreaterThan(0);

    const sqsCount = await getQueueMessageCount(
      ctx.sqsClient,
      outboxEventsQueueUrl(),
    );
    expect(sqsCount).toBeGreaterThanOrEqual(1);
  });
});
