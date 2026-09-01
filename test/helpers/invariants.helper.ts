import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { ReconcileWalletUseCase } from '../../src/application/use-cases/wallet/reconcile-wallet.use-case.js';
import { expect } from 'bun:test';

export async function assertBalanceMatchesLedger(
  app: INestApplication,
  walletId: string,
): Promise<void> {
  const reconcile = app.get(ReconcileWalletUseCase);
  const result = await reconcile.execute({ walletId });

  expect(result.consistent).toBe(true);
  expect(result.difference.amount).toBe('0.00');
}

export async function createWallet(
  app: INestApplication,
  playerId: string,
  amount = '100.00',
): Promise<{ id: string; balance: { amount: string; currency: string } }> {
  const res = await request(app.getHttpServer())
    .post('/wallets')
    .send({
      playerId,
      initialBalance: { amount, currency: 'BRL' },
    })
    .expect(201);

  return res.body;
}

export interface WagerRequest {
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: string;
  money: { amount: string; currency: string };
  referenceExternalTransactionId?: string;
}

export async function submitWager(
  app: INestApplication,
  idempotencyKey: string,
  body: WagerRequest,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await request(app.getHttpServer())
    .post('/wagering/transactions')
    .set('Idempotency-Key', idempotencyKey)
    .send(body);

  return { status: res.status, body: res.body };
}

export function defaultWagerBody(
  overrides: Partial<WagerRequest> & {
    walletId: string;
    playerId: string;
  },
): WagerRequest {
  return {
    providerId: 'provider-a',
    externalTransactionId: `tx-${crypto.randomUUID()}`,
    roundId: 'round-1',
    gameId: 'game-1',
    kind: 'BET',
    money: { amount: '10.00', currency: 'BRL' },
    ...overrides,
  };
}
