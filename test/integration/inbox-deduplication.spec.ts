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
import { invokeConsumerMessage } from '../helpers/worker.helper.js';
import {
  purgeAllTestQueues,
  receiveMessages,
  wagerDlqUrl,
} from '../helpers/sqs.helper.js';
import { ProcessWagerTransactionCommand } from '../../src/application/use-cases/shared/use-case.types.js';
import { WagerTransactionKind } from '../../src/domain/wagering/wager-transaction.enums.js';

describe('integration: inbox deduplication', () => {
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

  function wagerCommand(
    walletId: string,
    playerId: string,
  ): ProcessWagerTransactionCommand {
    return {
      idempotencyKey: 'provider-a:inbox-bet',
      providerId: 'provider-a',
      externalTransactionId: 'inbox-bet',
      playerId,
      walletId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.Bet,
      money: { amount: '10.00', currency: 'BRL' },
    };
  }

  it('deduplicates the same messageId and produces a single debit', async () => {
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '100.00');
    const data = wagerCommand(wallet.id, playerId);

    await Promise.all([
      invokeConsumerMessage(ctx.app, 'msg-dup-1', data, 'receipt-1'),
      invokeConsumerMessage(ctx.app, 'msg-dup-1', data, 'receipt-2'),
      invokeConsumerMessage(ctx.app, 'msg-dup-1', data, 'receipt-3'),
    ].map((p) => p.catch(() => undefined)));

    const orm = ctx.app.get(MikroORM);
    const txCount = await orm.em.getConnection().execute(
      `SELECT COUNT(*)::int AS count FROM wager_transaction WHERE idempotency_key = 'provider-a:inbox-bet'`,
    );
    const ledgerCount = await orm.em.getConnection().execute(
      `SELECT COUNT(*)::int AS count FROM wallet_ledger_entry WHERE wallet_id = '${wallet.id}' AND direction = 'DEBIT' AND money_amount = 10.00`,
    );
    const inboxCount = await orm.em.getConnection().execute(
      `SELECT COUNT(*)::int AS count FROM inbox_message WHERE message_id = 'msg-dup-1' AND processed_at IS NOT NULL`,
    );

    expect((txCount as { count: number }[])[0].count).toBe(1);
    expect((ledgerCount as { count: number }[])[0].count).toBe(1);
    expect((inboxCount as { count: number }[])[0].count).toBe(1);

    await assertBalanceMatchesLedger(ctx.app, wallet.id);
  });

  it('routes inbox payload conflict to DLQ', async () => {
    const playerId = randomUUID();
    const wallet = await createWallet(ctx.app, playerId, '100.00');

    const base = wagerCommand(wallet.id, playerId);
    await invokeConsumerMessage(ctx.app, 'msg-conflict', base, 'receipt-a');

    const conflicting: ProcessWagerTransactionCommand = {
      ...base,
      money: { amount: '20.00', currency: 'BRL' },
    };

    try {
      await invokeConsumerMessage(
        ctx.app,
        'msg-conflict',
        conflicting,
        'receipt-b',
      );
    } catch {
      // DeleteMessage fails with synthetic receipt handles after DLQ routing.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const dlqMessages = await receiveMessages(
      ctx.sqsClient,
      wagerDlqUrl(),
      10,
    );
    expect(dlqMessages).toBeGreaterThanOrEqual(1);
  });
});
