import { Migration } from '@mikro-orm/migrations';

export class Migration20260831212613 extends Migration {

  override name = 'Migration20260831212613';

  override up(): void | Promise<void> {
    this.addSql(`create table "inbox_message" ("message_id" varchar(255) not null, "consumer_name" varchar(255) not null, "payload_hash" varchar(255) not null, "received_at" timestamptz not null, "processed_at" timestamptz null, primary key ("message_id"));`);

    this.addSql(`create table "outbox_message" ("id" uuid not null, "aggregate_id" varchar(255) not null, "event_type" varchar(255) not null, "payload" jsonb not null, "occurred_at" timestamptz not null, "attempts" int not null, "next_attempt_at" timestamptz null, "published_at" timestamptz null, primary key ("id"));`);

    this.addSql(`create table "wager_transaction" ("id" uuid not null, "provider_id" varchar(255) not null, "external_transaction_id" varchar(255) not null, "idempotency_key" varchar(255) not null, "payload_hash" varchar(255) not null, "wallet_id" uuid not null, "player_id" varchar(255) not null, "round_id" varchar(255) not null, "game_id" varchar(255) not null, "kind" text not null, "money_amount" numeric(18,2) not null, "money_currency" varchar(255) not null, "reference_external_transaction_id" varchar(255) null, "status" text not null, "reference_transaction_id" uuid null, "failure_code" text null, "processed_at" timestamptz null, "observed_balance_amount" numeric(18,2) null, "observed_balance_currency" varchar(255) null, "reference_resolution_attempts" int not null, "next_reference_attempt_at" timestamptz null, "created_at" timestamptz not null, primary key ("id"));`);

    this.addSql(`create table "wallet" ("id" uuid not null, "player_id" varchar(255) not null, "currency" varchar(255) not null, "balance_amount" numeric(18,2) not null, "version" int not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);

    this.addSql(`create table "wallet_ledger_entry" ("id" uuid not null, "wallet_id" uuid not null, "transaction_id" uuid not null, "direction" text not null, "money_amount" numeric(18,2) not null, "money_currency" varchar(255) not null, "balance_before_amount" numeric(18,2) not null, "balance_before_currency" varchar(255) not null, "balance_after_amount" numeric(18,2) not null, "balance_after_currency" varchar(255) not null, "created_at" timestamptz not null, primary key ("id"));`);

    this.addSql(`alter table "wager_transaction" add constraint "wager_transaction_kind_check" check ("kind" in ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'));`);
    this.addSql(`alter table "wager_transaction" add constraint "wager_transaction_status_check" check ("status" in ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'));`);
    this.addSql(`alter table "wager_transaction" add constraint "wager_transaction_failure_code_check" check ("failure_code" in ('INSUFFICIENT_BALANCE', 'CURRENCY_MISMATCH', 'REFERENCE_NOT_FOUND', 'INVALID_REFERENCE', 'REVERSAL_ALREADY_APPLIED', 'INVALID_TRANSACTION_STATE', 'PAYLOAD_CONFLICT', 'REVERSAL_WOULD_NEGATE_BALANCE'));`);

    this.addSql(`alter table "wallet_ledger_entry" add constraint "wallet_ledger_entry_direction_check" check ("direction" in ('DEBIT', 'CREDIT'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "inbox_message" cascade;`);
    this.addSql(`drop table if exists "outbox_message" cascade;`);
    this.addSql(`drop table if exists "wager_transaction" cascade;`);
    this.addSql(`drop table if exists "wallet" cascade;`);
    this.addSql(`drop table if exists "wallet_ledger_entry" cascade;`);
  }

}
