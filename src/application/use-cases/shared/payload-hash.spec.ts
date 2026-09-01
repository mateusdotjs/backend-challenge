import { describe, expect, it } from 'bun:test';

import { WagerTransactionKind } from '../../../domain/wagering/wager-transaction.enums.js';
import { computePayloadHash } from './payload-hash.js';

describe('computePayloadHash', () => {
  const base = {
    providerId: 'provider-a',
    externalTransactionId: 'tx-1',
    playerId: 'player-1',
    walletId: 'wallet-1',
    roundId: 'round-1',
    gameId: 'game-1',
    kind: WagerTransactionKind.Bet,
    money: { amount: '25.00', currency: 'BRL' },
  };

  it('is deterministic for the same payload', () => {
    const h1 = computePayloadHash(base);
    const h2 = computePayloadHash({ ...base });
    expect(h1).toBe(h2);
  });

  it('changes when a business field changes', () => {
    const h1 = computePayloadHash(base);
    const h2 = computePayloadHash({
      ...base,
      money: { amount: '26.00', currency: 'BRL' },
    });
    expect(h1).not.toBe(h2);
  });

  it('ignores field order differences via canonical JSON', () => {
    const ordered = computePayloadHash(base);
    const reordered = computePayloadHash({
      money: base.money,
      gameId: base.gameId,
      roundId: base.roundId,
      walletId: base.walletId,
      playerId: base.playerId,
      externalTransactionId: base.externalTransactionId,
      providerId: base.providerId,
      kind: base.kind,
    });
    expect(ordered).toBe(reordered);
  });

  it('omits undefined optional fields', () => {
    const withoutRef = computePayloadHash(base);
    const withUndefinedRef = computePayloadHash({
      ...base,
      referenceExternalTransactionId: undefined,
    });
    expect(withoutRef).toBe(withUndefinedRef);
  });
});
