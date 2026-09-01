import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { MikroORM } from '@mikro-orm/core';
import { randomUUID } from 'crypto';

import {
  createTestApp,
  resetDatabase,
  type TestAppContext,
} from '../helpers/app.factory.js';
import {
  assertBalanceMatchesLedger,
  createWallet,
} from '../helpers/invariants.helper.js';
import {
  invokeConsumerMessage,
  runOutboxPublisherOnce,
} from '../helpers/worker.helper.js';
import { purgeAllTestQueues } from '../helpers/sqs.helper.js';
import { WagerTransactionKind } from '../../src/domain/wagering/wager-transaction.enums.js';

describe('concurrency: post-commit pre-ack redelivery', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp({ enableWorkers: false });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.app);
    await purgeAllTestQueues(ctx.sqsClient);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('does not duplicate financial effects on redelivery after successful commit', async () => {
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '100.00');

    const data = {
      idempotencyKey: 'provider-a:redelivery',
      providerId: 'provider-a',
      externalTransactionId: 'redelivery',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: { amount: '15.00', currency: 'BRL' },
    };

    await invokeConsumerMessage(ctx.app, 'msg-redelivery', data, 'receipt-1');
    await invokeConsumerMessage(ctx.app, 'msg-redelivery', data, 'receipt-2');

    const orm = ctx.app.get(MikroORM);
    const ledgerCount = await orm.em.getConnection().execute(
      `SELECT COUNT(*)::int AS count FROM wallet_ledger_entry WHERE wallet_id = '${wallet.id}' AND money_amount = 15.00`,
    );
    expect((ledgerCount as { count: number }[])[0].count).toBe(1);

    await assertBalanceMatchesLedger(ctx.app, wallet.id);
  });
});

describe('concurrency: restart recovery', () => {
  it('drains pending outbox after application restart', async () => {
    let ctx = await createTestApp({ enableWorkers: false });

    try {
      const playerId = randomUUID();
      const wallet = await createWallet(ctx.app, playerId, '100.00');

      const { defaultWagerBody, submitWager } = await import(
        '../helpers/invariants.helper.js'
      );

      await submitWager(
        ctx.app,
        'provider-a:restart',
        defaultWagerBody({
          walletId: wallet.id,
          playerId,
          externalTransactionId: 'restart-bet',
        }),
      );

      await ctx.app.close();

      ctx = await createTestApp({ enableWorkers: false });
      await runOutboxPublisherOnce(ctx.app);

      const orm = ctx.app.get(MikroORM);
      const pending = await orm.em.getConnection().execute(
        `SELECT COUNT(*)::int AS count FROM outbox_message WHERE published_at IS NULL`,
      );
      expect((pending as { count: number }[])[0].count).toBe(0);

      await assertBalanceMatchesLedger(ctx.app, wallet.id);
    } finally {
      await ctx.app.close();
    }
  });
});
