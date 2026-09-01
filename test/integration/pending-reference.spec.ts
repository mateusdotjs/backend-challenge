import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { MikroORM } from '@mikro-orm/core';
import { randomUUID } from 'crypto';

import { FixedClock } from '../helpers/fixed-clock.js';
import {
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
import {
  invokeConsumerMessage,
  runPendingReferenceWorkerOnce,
} from '../helpers/worker.helper.js';
import { purgeAllTestQueues } from '../helpers/sqs.helper.js';
import { WagerTransactionStatus } from '../../src/domain/wagering/wager-transaction.enums.js';
import { WagerTransactionKind } from '../../src/domain/wagering/wager-transaction.enums.js';

describe('integration: pending reference worker', () => {
  let ctx: TestAppContext;
  let clock: FixedClock;

  beforeAll(async () => {
    clock = new FixedClock(new Date('2026-06-01T12:00:00.000Z'));
    process.env['PENDING_REFERENCE_POLL_INTERVAL_MS'] = '100';
    process.env['PENDING_REFERENCE_MAX_ATTEMPTS'] = '20';
    ctx = await createTestApp({ enableWorkers: false, fixedClock: clock });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.app);
    await purgeAllTestQueues(ctx.sqsClient);
    clock.set(new Date('2026-06-01T12:00:00.000Z'));
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('resolves REFUND after BET arrives out of order', async () => {
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '100.00');

    await invokeConsumerMessage(ctx.app, 'msg-refund-first', {
      idempotencyKey: 'provider-a:refund-1',
      providerId: 'provider-a',
      externalTransactionId: 'refund-1',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Refund,
      money: { amount: '25.00', currency: 'BRL' },
      referenceExternalTransactionId: 'bet-1',
    });

    const pending = await submitWager(
      ctx.app,
      'provider-a:bet-1',
      defaultWagerBody({
        walletId: wallet.id,
        playerId,
        externalTransactionId: 'bet-1',
        kind: 'BET',
        money: { amount: '25.00', currency: 'BRL' },
      }),
    );
    expect(pending.status).toBe(201);

    clock.advance(10_000);
    await runPendingReferenceWorkerOnce(ctx.app);

    const orm = ctx.app.get(MikroORM);
    const refund = await orm.em.getConnection().execute(
      `SELECT status FROM wager_transaction WHERE idempotency_key = 'provider-a:refund-1'`,
    );

    expect((refund as { status: string }[])[0].status).toBe(
      WagerTransactionStatus.Processed,
    );

    const walletRow = await orm.em.getConnection().execute(
      `SELECT balance_amount FROM wallet WHERE id = '${wallet.id}'`,
    );
    expect(Number((walletRow as { balance_amount: string }[])[0].balance_amount)).toBe(
      100,
    );

    await assertBalanceMatchesLedger(ctx.app, wallet.id);
  });
});
