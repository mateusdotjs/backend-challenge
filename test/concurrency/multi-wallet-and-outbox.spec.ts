import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { MikroORM } from '@mikro-orm/core';
import { randomUUID } from 'crypto';

import {
  createIntegrationTestContext,
  createTestApp,
  resetDatabase,
  type TestAppContext,
} from '../helpers/app.factory.js';
import {
  assertBalanceMatchesLedger,
  createWallet,
  defaultWagerBody,
  submitWager,
} from '../helpers/invariants.helper.js';
import { FixedClock } from '../helpers/fixed-clock.js';
import { runOutboxPublisherOnce, runPendingReferenceWorkerOnce } from '../helpers/worker.helper.js';
import { getQueueMessageCount, outboxEventsQueueUrl } from '../helpers/sqs.helper.js';
import { WagerTransactionStatus } from '../../src/domain/wagering/wager-transaction.enums.js';

describe('concurrency: multi-wallet parallel', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createIntegrationTestContext();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.app);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('processes bets on distinct wallets without cross interference', async () => {
    const playerIds = Array.from({ length: 10 }, () => randomUUID());
    const wallets = await Promise.all(
      playerIds.map((playerId) => createWallet(ctx.app, playerId, '100.00')),
    );

    await Promise.all(
      wallets.map((wallet, index) =>
        submitWager(
          ctx.app,
          `provider-a:wallet-${index}`,
          defaultWagerBody({
            walletId: wallet.id,
            playerId: playerIds[index],
            externalTransactionId: `bet-${index}`,
            money: { amount: '10.00', currency: 'BRL' },
          }),
        ),
      ),
    );

    for (const wallet of wallets) {
      await assertBalanceMatchesLedger(ctx.app, wallet.id);
      const orm = ctx.app.get(MikroORM);
      const row = await orm.em.getConnection().execute(
        `SELECT balance_amount FROM wallet WHERE id = '${wallet.id}'`,
      );
      expect(Number((row as { balance_amount: string }[])[0].balance_amount)).toBe(
        90,
      );
    }
  });
});

describe('concurrency: dual outbox publisher', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    process.env['OUTBOX_POLL_INTERVAL_MS'] = '100';
    ctx = await createIntegrationTestContext();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.app);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('publishes each outbox row once with concurrent workers', async () => {
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '100.00');

    await submitWager(
      ctx.app,
      'provider-a:dual-outbox',
      defaultWagerBody({
        walletId: wallet.id,
        playerId,
        externalTransactionId: 'dual-outbox',
      }),
    );

    await Promise.all([
      runOutboxPublisherOnce(ctx.app),
      runOutboxPublisherOnce(ctx.app),
    ]);

    const orm = ctx.app.get(MikroORM);
    const pending = await orm.em.getConnection().execute(
      `SELECT COUNT(*)::int AS count FROM outbox_message WHERE published_at IS NULL`,
    );
    expect((pending as { count: number }[])[0].count).toBe(0);

    const publishedEvents = await getQueueMessageCount(
      ctx.sqsClient,
      outboxEventsQueueUrl(),
    );
    expect(publishedEvents).toBeGreaterThanOrEqual(2);
  });
});

describe('concurrency: out-of-order reference', () => {
  let ctx: TestAppContext;
  let clock: FixedClock;

  beforeAll(async () => {
    clock = new FixedClock(new Date('2026-06-01T12:00:00.000Z'));
    ctx = await createTestApp({ enableWorkers: false, fixedClock: clock });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.app);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('eventually resolves REFUND and BET submitted in parallel', async () => {
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '100.00');

    const refundBody = defaultWagerBody({
      walletId: wallet.id,
      playerId,
      externalTransactionId: 'refund-oo',
      kind: 'REFUND',
      money: { amount: '20.00', currency: 'BRL' },
      referenceExternalTransactionId: 'bet-oo',
    });
    const betBody = defaultWagerBody({
      walletId: wallet.id,
      playerId,
      externalTransactionId: 'bet-oo',
      kind: 'BET',
      money: { amount: '20.00', currency: 'BRL' },
    });

    await Promise.all([
      submitWager(ctx.app, 'provider-a:refund-oo', refundBody),
      submitWager(ctx.app, 'provider-a:bet-oo', betBody),
    ]);

    clock.advance(10_000);
    await runPendingReferenceWorkerOnce(ctx.app);

    const orm = ctx.app.get(MikroORM);
    const refundStatus = await orm.em.getConnection().execute(
      `SELECT status FROM wager_transaction WHERE idempotency_key = 'provider-a:refund-oo'`,
    );

    expect((refundStatus as { status: string }[])[0].status).toBe(
      WagerTransactionStatus.Processed,
    );
    await assertBalanceMatchesLedger(ctx.app, wallet.id);
  });
});
