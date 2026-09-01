#!/usr/bin/env bash
set -euo pipefail

awslocal sqs create-queue \
  --queue-name wager-transactions-dlq.fifo \
  --attributes FifoQueue=true,ContentBasedDeduplication=false

DLQ_URL=$(awslocal sqs get-queue-url \
  --queue-name wager-transactions-dlq.fifo \
  --query QueueUrl --output text)

DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url "$DLQ_URL" \
  --attribute-names QueueArn \
  --query Attributes.QueueArn --output text)

awslocal sqs create-queue \
  --queue-name wager-transactions.fifo \
  --attributes '{
    "FifoQueue": "true",
    "ContentBasedDeduplication": "false",
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"'"$DLQ_ARN"'\",\"maxReceiveCount\":\"5\"}"
  }'

awslocal sqs create-queue \
  --queue-name outbox-events-dlq.fifo \
  --attributes FifoQueue=true,ContentBasedDeduplication=false

OUTBOX_DLQ_URL=$(awslocal sqs get-queue-url \
  --queue-name outbox-events-dlq.fifo \
  --query QueueUrl --output text)

OUTBOX_DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url "$OUTBOX_DLQ_URL" \
  --attribute-names QueueArn \
  --query Attributes.QueueArn --output text)

awslocal sqs create-queue \
  --queue-name outbox-events.fifo \
  --attributes '{
    "FifoQueue": "true",
    "ContentBasedDeduplication": "false",
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"'"$OUTBOX_DLQ_ARN"'\",\"maxReceiveCount\":\"5\"}"
  }'

echo "Queues created:"
awslocal sqs list-queues
