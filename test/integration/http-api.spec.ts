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

describe('integration: HTTP API', () => {
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

  it('creates wallet with OPENING ledger when balance > 0', async () => {
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '1000.00');

    expect(wallet.balance.amount).toBe('1000.00');
    expect(wallet.version).toBe(1);

    const ledger = await request(ctx.app.getHttpServer())
      .get(`/wallets/${wallet.id}/ledger`)
      .expect(200);

    expect(ledger.body.entries.length).toBeGreaterThanOrEqual(1);
    await assertBalanceMatchesLedger(ctx.app, wallet.id);
  });

  it('requires Idempotency-Key header for wagering', async () => {
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId);

    const res = await request(ctx.app.getHttpServer())
      .post('/wagering/transactions')
      .send(
        defaultWagerBody({
          walletId: wallet.id,
          playerId,
        }),
      );

    expect(res.status).toBe(400);
  });

  it('maps process statuses to HTTP codes', async () => {
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '100.00');
    const body = defaultWagerBody({
      walletId: wallet.id,
      playerId,
      externalTransactionId: 'status-test',
    });

    const created = await submitWager(ctx.app, 'provider-a:status-test', body);
    expect(created.status).toBe(201);

    const replay = await submitWager(ctx.app, 'provider-a:status-test', body);
    expect(replay.status).toBe(200);
    expect(replay.body.idempotentReplay).toBe(true);

    const rejected = await submitWager(
      ctx.app,
      'provider-a:status-reject',
      defaultWagerBody({
        walletId: wallet.id,
        playerId,
        externalTransactionId: 'status-reject',
        money: { amount: '500.00', currency: 'BRL' },
      }),
    );
    expect(rejected.status).toBe(422);
    expect(rejected.body.failureCode).toBe('INSUFFICIENT_BALANCE');
  });

  it('returns pending reference as 202', async () => {
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '100.00');

    const pending = await submitWager(
      ctx.app,
      'provider-a:refund-pending',
      defaultWagerBody({
        walletId: wallet.id,
        playerId,
        externalTransactionId: 'refund-pending',
        kind: 'REFUND',
        money: { amount: '10.00', currency: 'BRL' },
        referenceExternalTransactionId: 'missing-bet',
      }),
    );

    expect(pending.status).toBe(202);
    expect(pending.body.status).toBe(WagerTransactionStatus.PendingReference);
  });

  it('reconciles wallet after operations', async () => {
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '100.00');

    await submitWager(
      ctx.app,
      'provider-a:reconcile-bet',
      defaultWagerBody({
        walletId: wallet.id,
        playerId,
        externalTransactionId: 'reconcile-bet',
        money: { amount: '25.00', currency: 'BRL' },
      }),
    );

    const reconciliation = await request(ctx.app.getHttpServer())
      .post(`/wallets/${wallet.id}/reconciliation`)
      .expect(200);

    expect(reconciliation.body.consistent).toBe(true);
    expect(reconciliation.body.difference.amount).toBe('0.00');
  });

  it('exposes health endpoints', async () => {
    await request(ctx.app.getHttpServer()).get('/health/live').expect(200);
    await request(ctx.app.getHttpServer()).get('/health/ready').expect(200);
  });

  it('looks up transaction by id and provider', async () => {
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '100.00');

    const processed = await submitWager(
      ctx.app,
      'provider-a:lookup',
      defaultWagerBody({
        walletId: wallet.id,
        playerId,
        externalTransactionId: 'lookup-tx',
      }),
    );

    const byId = await request(ctx.app.getHttpServer())
      .get(`/wagering/transactions/${processed.body.transactionId}`)
      .expect(200);

    expect(byId.body.externalTransactionId).toBe('lookup-tx');

    const byProvider = await request(ctx.app.getHttpServer())
      .get('/providers/provider-a/wagering/transactions/lookup-tx')
      .expect(200);

    expect(byProvider.body.id).toBe(processed.body.transactionId);
  });
});
