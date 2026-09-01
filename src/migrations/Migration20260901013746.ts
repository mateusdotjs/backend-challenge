import { Migration } from '@mikro-orm/migrations';

export class Migration20260901013746 extends Migration {

  override name = 'Migration20260901013746';

  override up(): void | Promise<void> {
    this.addSql(`alter table "inbox_message" drop constraint "inbox_message_pkey";`);
    this.addSql(`alter table "inbox_message" add primary key ("message_id", "consumer_name");`);

    this.addSql(`alter table "wager_transaction" add constraint "wager_transaction_provider_id_idempotency_key_unique" unique ("provider_id", "idempotency_key");`);
    this.addSql(`alter table "wager_transaction" add constraint "wager_transaction_provider_id_external_transaction_id_unique" unique ("provider_id", "external_transaction_id");`);
    this.addSql(`alter table "wager_transaction" add constraint "wager_transaction_money_amount_non_negative" check ("money_amount" >= 0);`);

    this.addSql(`alter table "wallet" add constraint "wallet_player_id_currency_unique" unique ("player_id", "currency");`);
    this.addSql(`alter table "wallet" add constraint "wallet_balance_amount_non_negative" check ("balance_amount" >= 0);`);

    this.addSql(`alter table "wallet_ledger_entry" add constraint "wallet_ledger_entry_wallet_id_transaction_id_unique" unique ("wallet_id", "transaction_id");`);
    this.addSql(`alter table "wallet_ledger_entry" add constraint "wallet_ledger_entry_money_amount_non_negative" check ("money_amount" >= 0);`);
    this.addSql(`alter table "wallet_ledger_entry" add constraint "wallet_ledger_entry_balance_before_amount_non_negative" check ("balance_before_amount" >= 0);`);
    this.addSql(`alter table "wallet_ledger_entry" add constraint "wallet_ledger_entry_balance_after_amount_non_negative" check ("balance_after_amount" >= 0);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "inbox_message" drop constraint "inbox_message_pkey";`);
    this.addSql(`alter table "inbox_message" add primary key ("message_id");`);

    this.addSql(`alter table "wager_transaction" drop constraint "wager_transaction_provider_id_idempotency_key_unique";`);
    this.addSql(`alter table "wager_transaction" drop constraint "wager_transaction_provider_id_external_transaction_id_unique";`);
    this.addSql(`alter table "wager_transaction" drop constraint "wager_transaction_money_amount_non_negative";`);

    this.addSql(`alter table "wallet" drop constraint "wallet_player_id_currency_unique";`);
    this.addSql(`alter table "wallet" drop constraint "wallet_balance_amount_non_negative";`);

    this.addSql(`alter table "wallet_ledger_entry" drop constraint "wallet_ledger_entry_wallet_id_transaction_id_unique";`);
    this.addSql(`alter table "wallet_ledger_entry" drop constraint "wallet_ledger_entry_money_amount_non_negative";`);
    this.addSql(`alter table "wallet_ledger_entry" drop constraint "wallet_ledger_entry_balance_before_amount_non_negative";`);
    this.addSql(`alter table "wallet_ledger_entry" drop constraint "wallet_ledger_entry_balance_after_amount_non_negative";`);
  }

}
