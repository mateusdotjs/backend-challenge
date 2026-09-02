import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';
import { Inject, Injectable } from '@nestjs/common';

import { SQS_CLIENT } from '../messaging/sqs/sqs.client.js';

@Injectable()
export class SqsHealthCheck {
  constructor(@Inject(SQS_CLIENT) private readonly sqsClient: SQSClient) {}

  async isHealthy(): Promise<boolean> {
    const queueUrl = process.env['SQS_WAGER_TRANSACTIONS_QUEUE_URL'];
    if (!queueUrl) {
      return false;
    }

    try {
      await this.sqsClient.send(
        new GetQueueAttributesCommand({
          QueueUrl: queueUrl,
          AttributeNames: ['QueueArn'],
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
