import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import {
  createTestApp,
  resetDatabase,
  type TestAppContext,
} from '../helpers/app.factory.js';
import { purgeAllTestQueues, receiveMessages, wagerDlqUrl } from '../helpers/sqs.helper.js';
import { invokeInvalidConsumerMessage } from '../helpers/worker.helper.js';

describe('integration: SQS DLQ', () => {
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

  it('routes permanently invalid messages to DLQ', async () => {
    try {
      await invokeInvalidConsumerMessage(
        ctx.app,
        'not-valid-json{{{',
        'sqs-invalid-1',
      );
    } catch {
      // Synthetic receipt handles are invalid for DeleteMessage in LocalStack.
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
