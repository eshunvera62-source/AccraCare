/**
 * getSlots.ts
 * ---------------------------------------------------------------------------
 * GET /slots
 * Returns every appointment slot in the SlotsTable.
 * Public read endpoint — no PII is exposed.
 * ---------------------------------------------------------------------------
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';

/**
 * Lambda handler for listing all appointment slots.
 *
 * @param event - API Gateway proxy event.
 * @returns 200 with a list of slots, or 500 on unexpected error.
 */
export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const tableName = process.env.SLOTS_TABLE;
  if (!tableName) {
    return errorResponse(500, 'Missing SLOTS_TABLE configuration', undefined, event);
  }

  try {
    const items: Array<Record<string, unknown>> = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    // Paginate through the full table (fine for capstone-scale data).
    do {
      const result = await dynamoClient.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );

      items.push(...(result.Items ?? []));
      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    // Keep newest slots first, matching the frontend's unshift() behaviour.
    items.sort((a, b) => {
      const aCreated = String(a.createdAt ?? '');
      const bCreated = String(b.createdAt ?? '');
      return bCreated.localeCompare(aCreated);
    });

    return jsonResponse(200, items, event);
  } catch {
    // Do NOT leak internal error details to the client.
    return errorResponse(500, 'Failed to fetch slots', undefined, event);
  }
}