import { WalletLedgerEntry } from '../../../domain/ledger/wallet-ledger-entry.js';
import { LedgerRepositoryPort } from '../../ports/repositories/ledger-repository.port.js';
import {
  GetWalletLedgerQuery,
  WalletLedgerPageDto,
} from '../shared/use-case.types.js';
import { toLedgerEntryDto } from './wallet.mapper.js';

/**
 * Cursor format: base64( createdAt.toISOString() + ":" + id )
 *
 * The cursor encodes the exact position in the ordered result set.
 * Entries are ordered by (createdAt ASC, id ASC) for stable pagination
 * even when multiple entries share the same millisecond timestamp.
 *
 * NOTE: The current LedgerRepositoryPort.findByWalletId loads all entries
 * for the wallet. In-memory slicing is applied here. For production-scale
 * wallets a server-side paged query would be preferred, but that would
 * require extending the port.
 */
export class GetWalletLedgerUseCase {
  constructor(private readonly ledgerRepo: LedgerRepositoryPort) {}

  async execute(query: GetWalletLedgerQuery): Promise<WalletLedgerPageDto> {
    const all = await this.ledgerRepo.findByWalletId(query.walletId);

    // Sort ascending by (createdAt, id) — the repository contract says ASC,
    // but we re-sort here to be explicit and guard against adapter variance.
    all.sort((a, b) => {
      const timeDiff = a.createdAt.getTime() - b.createdAt.getTime();
      return timeDiff !== 0 ? timeDiff : a.id.localeCompare(b.id);
    });

    let startIndex = 0;
    if (query.cursor) {
      const decoded = decodeCursor(query.cursor);
      if (decoded) {
        const idx = all.findIndex(
          (e) =>
            e.createdAt.toISOString() === decoded.createdAt &&
            e.id === decoded.id,
        );
        startIndex = idx === -1 ? all.length : idx + 1;
      }
    }

    const page = all.slice(startIndex, startIndex + query.limit);
    const lastEntry = page.at(-1);
    const nextCursor =
      lastEntry && startIndex + query.limit < all.length
        ? encodeCursor(lastEntry)
        : null;

    return {
      entries: page.map(toLedgerEntryDto),
      nextCursor,
    };
  }
}

function encodeCursor(entry: WalletLedgerEntry): string {
  return Buffer.from(`${entry.createdAt.toISOString()}:${entry.id}`).toString(
    'base64url',
  );
}

function decodeCursor(
  cursor: string,
): { createdAt: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const colonIdx = raw.indexOf(':');
    if (colonIdx === -1) return null;
    return {
      createdAt: raw.slice(0, colonIdx),
      id: raw.slice(colonIdx + 1),
    };
  } catch {
    return null;
  }
}
