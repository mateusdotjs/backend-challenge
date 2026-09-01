import { MikroORM } from '@mikro-orm/core';
import type { AbstractSqlConnection } from '@mikro-orm/sql';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { spawnSync } from 'node:child_process';

import baseConfig from '../../src/infrastructure/persistence/mikro-orm/mikro-orm.config.js';
import { applyTestEnv, TEST_DB_NAME } from './test-env.js';

const ADMIN_DB = 'postgres';

export type TestOrm = MikroORM<PostgreSqlDriver>;

function connection(orm: TestOrm): AbstractSqlConnection {
  return orm.em.getConnection();
}

async function closeOrm(orm: TestOrm): Promise<void> {
  await orm.close();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForPostgres(maxAttempts = 30): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const orm = await MikroORM.init<PostgreSqlDriver>({
        ...baseConfig,
        dbName: ADMIN_DB,
      });
      await connection(orm).execute('SELECT 1');
      await closeOrm(orm);
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error('PostgreSQL is not reachable');
}

export async function waitForLocalstack(maxAttempts = 30): Promise<void> {
  const endpoint =
    process.env['AWS_ENDPOINT_URL'] ?? 'http://localhost:4566';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${endpoint}/_localstack/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // retry
    }
    await sleep(1000);
  }
  throw new Error('LocalStack is not reachable');
}

export async function waitForServices(): Promise<void> {
  await waitForPostgres();
  await waitForLocalstack();
}

export async function ensureTestDatabase(): Promise<void> {
  const orm = await MikroORM.init<PostgreSqlDriver>({
    ...baseConfig,
    dbName: ADMIN_DB,
  });

  try {
    const rows = (await connection(orm).execute(
      `SELECT 1 FROM pg_database WHERE datname = '${TEST_DB_NAME}'`,
    )) as unknown[];

    if (rows.length === 0) {
      await connection(orm).execute(`CREATE DATABASE "${TEST_DB_NAME}"`);
    }
  } finally {
    await closeOrm(orm);
  }
}

export async function runMigrations(): Promise<void> {
  applyTestEnv();
  const result = spawnSync('bunx', ['mikro-orm', 'migration:up'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DB_NAME: TEST_DB_NAME,
    },
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? '';
    const stdout = result.stdout?.toString() ?? '';
    throw new Error(`Migration failed:\n${stdout}\n${stderr}`);
  }
}

export async function createTestOrm(): Promise<TestOrm> {
  applyTestEnv();
  return MikroORM.init<PostgreSqlDriver>({
    ...baseConfig,
    dbName: TEST_DB_NAME,
  });
}

export async function truncateAllTables(orm: TestOrm): Promise<void> {
  await connection(orm).execute(`
    TRUNCATE TABLE
      inbox_message,
      outbox_message,
      wallet_ledger_entry,
      wager_transaction,
      wallet
    RESTART IDENTITY CASCADE
  `);
}

export async function executeSql<T = unknown>(
  orm: TestOrm,
  sql: string,
): Promise<T> {
  return connection(orm).execute(sql) as Promise<T>;
}

export async function setupIntegrationDatabase(): Promise<TestOrm> {
  applyTestEnv();
  await waitForServices();
  await ensureTestDatabase();
  await runMigrations();
  const orm = await createTestOrm();
  await truncateAllTables(orm);
  return orm;
}
