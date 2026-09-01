import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { MikroORM } from '@mikro-orm/core';
import request from 'supertest';
import { randomUUID } from 'crypto';

import {
  createIntegrationTestContext,
  resetDatabase,
  type TestAppContext,
} from '../helpers/app.factory.js';
import { createWallet } from '../helpers/invariants.helper.js';

describe('integration: migrations and constraints', () => {
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

  it('enforces unique wallet per player and currency', async () => {
    const playerId = randomUUID();

    await createWallet(ctx.app, playerId, '100.00');

    const duplicate = await request(ctx.app.getHttpServer())
      .post('/wallets')
      .send({
        playerId,
        initialBalance: { amount: '50.00', currency: 'BRL' },
      });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('WALLET_CONFLICT');
  });

  it('enforces unique idempotency key per provider', async () => {
    const orm = ctx.app.get(MikroORM);
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '100.00');

    await request(ctx.app.getHttpServer())
      .post('/wagering/transactions')
      .set('Idempotency-Key', 'provider-a:dup-key')
      .send({
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        playerId,
        walletId: wallet.id,
        roundId: 'round-1',
        gameId: 'game-1',
        kind: 'BET',
        money: { amount: '10.00', currency: 'BRL' },
      })
      .expect(201);

    await expect(
      orm.em.getConnection().execute(`
        INSERT INTO wager_transaction (
          id, provider_id, external_transaction_id, idempotency_key, payload_hash,
          wallet_id, player_id, round_id, game_id, kind,
          money_amount, money_currency, status, reference_resolution_attempts, created_at
        ) VALUES (
          gen_random_uuid(), 'provider-a', 'ext-2', 'provider-a:dup-key', 'hash-2',
          '${wallet.id}', '${playerId}', 'round-2', 'game-1', 'BET',
          5.00, 'BRL', 'PENDING', 0, NOW()
        )
      `),
    ).rejects.toThrow();
  });

  it('enforces one ledger entry per wallet and transaction', async () => {
    const orm = ctx.app.get(MikroORM);
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '100.00');

    const bet = await request(ctx.app.getHttpServer())
      .post('/wagering/transactions')
      .set('Idempotency-Key', 'provider-a:bet-ledger')
      .send({
        providerId: 'provider-a',
        externalTransactionId: 'bet-ledger',
        playerId,
        walletId: wallet.id,
        roundId: 'round-1',
        gameId: 'game-1',
        kind: 'BET',
        money: { amount: '10.00', currency: 'BRL' },
      })
      .expect(201);

    await expect(
      orm.em.getConnection().execute(`
        INSERT INTO wallet_ledger_entry (
          id, wallet_id, transaction_id, direction,
          money_amount, money_currency,
          balance_before_amount, balance_before_currency,
          balance_after_amount, balance_after_currency,
          created_at
        ) VALUES (
          gen_random_uuid(), '${wallet.id}', '${bet.body.transactionId}', 'DEBIT',
          10.00, 'BRL', 100.00, 'BRL', 90.00, 'BRL', NOW()
        )
      `),
    ).rejects.toThrow();
  });
});
