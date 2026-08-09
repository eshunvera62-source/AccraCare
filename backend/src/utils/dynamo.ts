/**
 * dynamo.ts
 * ---------------------------------------------------------------------------
 * Centralized DynamoDB client configuration for all AccraCare Lambda handlers.
 *
 * Using a single shared client instance avoids re-initializing the AWS SDK
 * connection on every Lambda invocation (cold-start optimization) and keeps
 * marshalling options consistent across the codebase.
 * ---------------------------------------------------------------------------
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * Low-level DynamoDB client.
 *
 * The SDK automatically reads credentials and region from the Lambda
 * execution environment (IAM role), so no explicit configuration is needed.
 */
const client = new DynamoDBClient({});

/**
 * High-level document client with sensible marshalling defaults:
 *  - `removeUndefinedValues: true`  — drops `undefined` fields before write.
 *  - `convertEmptyValues: false`    — preserves empty strings (safer for PII).
 *  - `wrapNumbers: false`           — returns numbers as JS numbers, not strings.
 */
export const dynamoClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});