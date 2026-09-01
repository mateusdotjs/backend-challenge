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
import { runParallel } from '../helpers/parallel.helper.js';
import { WagerTransactionStatus } from '../../src/domain/wagering/wager-transaction.enums.js';

describe('concurrency: idempotent parallel submissions', () => {
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

  it('processes 50 parallel identical bets as a single debit', async () => {
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '100.00');
    const body = defaultWagerBody({
      walletId: wallet.id,
      playerId,
      externalTransactionId: 'parallel-bet',
      money: { amount: '10.00', currency: 'BRL' },
    });

    const results = await runParallel(50, () =>
      submitWager(ctx.app, 'provider-a:parallel-bet', body),
    );

    const processed = results.filter((r) => r.body.status === WagerTransactionStatus.Processed);
    const replays = results.filter((r) => r.body.idempotentReplay === true);

    expect(processed.length).toBeGreaterThanOrEqual(1);
    expect(replays.length).toBeGreaterThanOrEqual(1);

    const orm = ctx.app.get(MikroORM);
    const ledgerCount = await orm.em.getConnection().execute(
      `SELECT COUNT(*)::int AS count FROM wallet_ledger_entry WHERE wallet_id = '${wallet.id}' AND direction = 'DEBIT' AND money_amount = 10.00`,
    );
    expect((ledgerCount as { count: number }[])[0].count).toBe(1);

    const walletRow = await orm.em.getConnection().execute(
      `SELECT balance_amount FROM wallet WHERE id = '${wallet.id}'`,
    );
    expect(Number((walletRow as { balance_amount: string }[])[0].balance_amount)).toBe(
      90,
    );

    await assertBalanceMatchesLedger(ctx.app, wallet.id);
  });
});

describe('concurrency: hot wallet race', () => {
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

  it('allows exactly one of two parallel 80 BRL bets on 100 BRL balance', async () => {
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '100.00');

    const betA = defaultWagerBody({
      walletId: wallet.id,
      playerId,
      externalTransactionId: 'race-a',
      money: { amount: '80.00', currency: 'BRL' },
    });
    const betB = defaultWagerBody({
      walletId: wallet.id,
      playerId,
      externalTransactionId: 'race-b',
      money: { amount: '80.00', currency: 'BRL' },
    });

    const [resultA, resultB] = await Promise.all([
      submitWager(ctx.app, 'provider-a:race-a', betA),
      submitWager(ctx.app, 'provider-a:race-b', betB),
    ]);

    const statuses = [resultA.body.status, resultB.body.status];
    expect(statuses.filter((s) => s === WagerTransactionStatus.Processed)).toHaveLength(
      1,
    );
    expect(statuses.filter((s) => s === WagerTransactionStatus.Rejected)).toHaveLength(
      1,
    );

    const orm = ctx.app.get(MikroORM);
    const ledgerCount = await orm.em.getConnection().execute(
      `SELECT COUNT(*)::int AS count FROM wallet_ledger_entry WHERE wallet_id = '${wallet.id}' AND direction = 'DEBIT' AND money_amount = 80.00`,
    );
    expect((ledgerCount as { count: number }[])[0].count).toBe(1);

    const walletRow = await orm.em.getConnection().execute(
      `SELECT balance_amount FROM wallet WHERE id = '${wallet.id}'`,
    );
    expect(Number((walletRow as { balance_amount: string }[])[0].balance_amount)).toBe(
      20,
    );

    await assertBalanceMatchesLedger(ctx.app, wallet.id);

    const replayRejected = await submitWager(
      ctx.app,
      statuses[0] === WagerTransactionStatus.Rejected
        ? 'provider-a:race-a'
        : 'provider-a:race-b',
      statuses[0] === WagerTransactionStatus.Rejected ? betA : betB,
    );
    expect(replayRejected.body.idempotentReplay).toBe(true);
    await assertBalanceMatchesLedger(ctx.app, wallet.id);
  });
});

describe('concurrency: multi-instance simulation', () => {
  it('serializes operations across three Nest application instances', async () => {
    const apps = await Promise.all([
      createTestApp({ enableWorkers: false }),
      createTestApp({ enableWorkers: false }),
      createTestApp({ enableWorkers: false }),
    ]);

    try {
      const playerId = randomUUID();
      const wallet = await createWallet(apps[0].app, playerId, '100.00');

      const bets = Array.from({ length: 9 }, (_, index) =>
        defaultWagerBody({
          walletId: wallet.id,
          playerId,
          externalTransactionId: `multi-${index}`,
          money: { amount: '15.00', currency: 'BRL' },
        }),
      );

      const results = await Promise.all(
        bets.map((body, index) =>
          submitWager(
            apps[index % 3].app,
            `provider-a:multi-${index}`,
            body,
          ),
        ),
      );

      const processed = results.filter(
        (r) => r.body.status === WagerTransactionStatus.Processed,
      ).length;
      const rejected = results.filter(
        (r) => r.body.status === WagerTransactionStatus.Rejected,
      ).length;

      expect(processed).toBe(6);
      expect(rejected).toBe(3);

      for (const { app } of apps) {
        await assertBalanceMatchesLedger(app, wallet.id);
      }
    } finally {
      await Promise.all(apps.map(({ app }) => app.close()));
    }
  });
});
