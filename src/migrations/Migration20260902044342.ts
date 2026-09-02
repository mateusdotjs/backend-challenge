import { Migration } from '@mikro-orm/migrations';

export class Migration20260902044342 extends Migration {

  override name = 'Migration20260902044342';

  override up(): void | Promise<void> {
    this.addSql(`alter table "wager_transaction" drop constraint "wager_transaction_failure_code_check";`);
    this.addSql(`alter table "wager_transaction" add constraint "wager_transaction_failure_code_check" check ("failure_code" in ('INSUFFICIENT_BALANCE', 'CURRENCY_MISMATCH', 'REFERENCE_NOT_FOUND', 'INVALID_REFERENCE', 'REVERSAL_ALREADY_APPLIED', 'INVALID_TRANSACTION_STATE', 'PAYLOAD_CONFLICT', 'REVERSAL_WOULD_NEGATE_BALANCE', 'INFRASTRUCTURE_ERROR'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "wager_transaction" drop constraint "wager_transaction_failure_code_check";`);
    this.addSql(`alter table "wager_transaction" add constraint "wager_transaction_failure_code_check" check ("failure_code" in ('INSUFFICIENT_BALANCE', 'CURRENCY_MISMATCH', 'REFERENCE_NOT_FOUND', 'INVALID_REFERENCE', 'REVERSAL_ALREADY_APPLIED', 'INVALID_TRANSACTION_STATE', 'PAYLOAD_CONFLICT', 'REVERSAL_WOULD_NEGATE_BALANCE'));`);
  }

}
