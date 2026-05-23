#!/usr/bin/env bash
set -e

ENDPOINT="http://localhost:8000"
REGION="eu-north-1"

echo "Creating portfolio-items table..."
aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" \
  --region "$REGION" \
  --table-name portfolio-items \
  --attribute-definitions \
    AttributeName=userId,AttributeType=S \
    AttributeName=itemId,AttributeType=S \
  --key-schema \
    AttributeName=userId,KeyType=HASH \
    AttributeName=itemId,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --no-cli-pager

echo "Creating portfolio-users table..."
aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" \
  --region "$REGION" \
  --table-name portfolio-users \
  --attribute-definitions \
    AttributeName=userId,AttributeType=S \
  --key-schema \
    AttributeName=userId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --no-cli-pager

echo "Done. Tables ready."
