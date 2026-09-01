import { beforeAll } from 'bun:test';

import {
  runMigrations,
  ensureTestDatabase,
  waitForServices,
} from './helpers/database.helper.js';
import { applyTestEnv } from './helpers/test-env.js';

let initialized = false;

beforeAll(async () => {
  if (initialized) {
    return;
  }

  applyTestEnv();
  await waitForServices();
  await ensureTestDatabase();
  await runMigrations();
  initialized = true;
}, 120_000);
