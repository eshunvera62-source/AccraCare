import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';

export async function lambdaHandler(_: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const tableName = process.env.SLOTS_TABLE;
  if (!tableName) {
    return errorResponse(500, 'Missing SLOTS_TABLE configuration');
  }

  try {
    const items: Array<Record<string, unknown>> = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const result = await dynamoClient.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: exclusiveStartKey
        })
      );

      items.push(...(result.Items ?? []));
      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    items.sort((a, b) => {
      const aCreated = String(a.createdAt ?? '');
      const bCreated = String(b.createdAt ?? '');
      return bCreated.localeCompare(aCreated);
    });

    return jsonResponse(200, items);
  } catch (error) {
    return errorResponse(500, 'Failed to fetch slots', { message: (error as Error).message });
  }
}
