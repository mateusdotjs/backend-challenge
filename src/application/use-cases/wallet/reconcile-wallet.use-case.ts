import { Money } from '../../../domain/shared/money/money.js';
import { LedgerDirection } from '../../../domain/ledger/ledger.enums.js';
import { WalletRepositoryPort } from '../../ports/repositories/wallet-repository.port.js';
import { LedgerRepositoryPort } from '../../ports/repositories/ledger-repository.port.js';
import {
  ReconcileWalletQuery,
  ReconciliationResultDto,
} from '../shared/use-case.types.js';
import { WalletNotFoundError } from './wallet.errors.js';

export class ReconcileWalletUseCase {
  constructor(
    private readonly walletRepo: WalletRepositoryPort,
    private readonly ledgerRepo: LedgerRepositoryPort,
  ) {}

  async execute(query: ReconcileWalletQuery): Promise<ReconciliationResultDto> {
    const wallet = await this.walletRepo.findById(query.walletId);
    if (!wallet) {
      throw new WalletNotFoundError(query.walletId);
    }

    const entries = await this.ledgerRepo.findByWalletId(query.walletId);

    let calculatedBalance = Money.zero(wallet.currency);
    for (const entry of entries) {
      if (entry.direction === LedgerDirection.Credit) {
        calculatedBalance = calculatedBalance.add(entry.money);
      } else {
        calculatedBalance = calculatedBalance.subtract(entry.money);
      }
    }

    const storedBalance = wallet.balance;
    // Signed difference: positive means ledger > stored, negative means ledger < stored.
    const difference = calculatedBalance.subtract(storedBalance);
    const consistent = difference.isZero();

    return {
      walletId: wallet.id,
      storedBalance: storedBalance.toJSON(),
      calculatedBalance: calculatedBalance.toJSON(),
      difference: difference.toJSON(),
      consistent,
      checkedEntries: entries.length,
    };
  }
}
