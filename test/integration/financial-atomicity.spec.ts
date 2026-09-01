import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { MikroORM } from '@mikro-orm/core';
import request from 'supertest';
import { randomUUID } from 'crypto';

import {
  createIntegrationTestContext,
  resetDatabase,
  type TestAppContext,
} from '../helpers/app.factory.js';
import {
  assertBalanceMatchesLedger,
  createWallet,
  defaultWagerBody,
  submitWager,
} from '../helpers/invariants.helper.js';
import { WagerTransactionStatus } from '../../src/domain/wagering/wager-transaction.enums.js';

describe('integration: financial atomicity', () => {
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

  it('persists wallet, ledger and outbox atomically for BET', async () => {
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '100.00');

    const { status, body } = await submitWager(
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

    expect(status).toBe(201);
    expect(body.status).toBe(WagerTransactionStatus.Processed);

    const orm = ctx.app.get(MikroORM);
    const txCount = await orm.em.getConnection().execute(
      `SELECT COUNT(*)::int AS count FROM wager_transaction WHERE idempotency_key = 'provider-a:bet-1'`,
    );
    const ledgerCount = await orm.em.getConnection().execute(
      `SELECT COUNT(*)::int AS count FROM wallet_ledger_entry WHERE wallet_id = '${wallet.id}'`,
    );
    const outboxCount = await orm.em.getConnection().execute(
      `SELECT COUNT(*)::int AS count FROM outbox_message`,
    );

    expect((txCount as { count: number }[])[0].count).toBe(1);
    expect((ledgerCount as { count: number }[])[0].count).toBe(2);
    expect((outboxCount as { count: number }[])[0].count).toBeGreaterThanOrEqual(2);

    await assertBalanceMatchesLedger(ctx.app, wallet.id);
  });

  it('processes LOSS without ledger entry', async () => {
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '100.00');

    const { body } = await submitWager(
      ctx.app,
      'provider-a:loss-1',
      defaultWagerBody({
        walletId: wallet.id,
        playerId,
        externalTransactionId: 'loss-1',
        kind: 'LOSS',
        money: { amount: '0.00', currency: 'BRL' },
      }),
    );

    expect(body.status).toBe(WagerTransactionStatus.Processed);

    const orm = ctx.app.get(MikroORM);
    const ledgerCount = await orm.em.getConnection().execute(
      `SELECT COUNT(*)::int AS count FROM wallet_ledger_entry WHERE wallet_id = '${wallet.id}' AND transaction_id = '${body.transactionId}'`,
    );

    expect((ledgerCount as { count: number }[])[0].count).toBe(0);

    const walletRes = await request(ctx.app.getHttpServer())
      .get(`/wallets/${wallet.id}`)
      .expect(200);

    expect(walletRes.body.balance.amount).toBe('100.00');
    await assertBalanceMatchesLedger(ctx.app, wallet.id);
  });

  it('does not change balance for REJECTED BET', async () => {
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '10.00');

    const { status, body } = await submitWager(
      ctx.app,
      'provider-a:bet-reject',
      defaultWagerBody({
        walletId: wallet.id,
        playerId,
        externalTransactionId: 'bet-reject',
        kind: 'BET',
        money: { amount: '80.00', currency: 'BRL' },
      }),
    );

    expect(status).toBe(422);
    expect(body.status).toBe(WagerTransactionStatus.Rejected);

    const orm = ctx.app.get(MikroORM);
    const ledgerCount = await orm.em.getConnection().execute(
      `SELECT COUNT(*)::int AS count FROM wallet_ledger_entry WHERE wallet_id = '${wallet.id}'`,
    );
    expect((ledgerCount as { count: number }[])[0].count).toBe(1);

    await assertBalanceMatchesLedger(ctx.app, wallet.id);
  });
});
