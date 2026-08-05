import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';
import { z } from 'zod';

const querySchema = z.object({
  slotId: z.string().regex(/^[\w\-]{1,64}$/).optional()
});

export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const bookingsTable = process.env.BOOKINGS_TABLE;
  if (!bookingsTable) {
    return errorResponse(500, 'Missing BOOKINGS_TABLE configuration');
  }

  try {
    const queryParams = querySchema.parse({ slotId: event.queryStringParameters?.slotId });
    let items: Array<Record<string, unknown>> = [];

    if (queryParams.slotId && queryParams.slotId !== 'all') {
      const response = await dynamoClient.send(
        new QueryCommand({
          TableName: bookingsTable,
          IndexName: 'slotId-index',
          KeyConditionExpression: 'slotId = :slotId',
          ExpressionAttributeValues: { ':slotId': queryParams.slotId }
        })
      );
      items = response.Items ?? [];
    } else {
      let exclusiveStartKey: Record<string, unknown> | undefined;
      do {
        const response = await dynamoClient.send(
          new ScanCommand({ TableName: bookingsTable, ExclusiveStartKey: exclusiveStartKey })
        );
        items.push(...(response.Items ?? []));
        exclusiveStartKey = response.LastEvaluatedKey;
      } while (exclusiveStartKey);
    }

    items.sort((a, b) => {
      const aBooked = Number(a.bookedAt ?? 0);
      const bBooked = Number(b.bookedAt ?? 0);
      return bBooked - aBooked;
    });

    return jsonResponse(200, items);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(400, 'Invalid query parameters', { issues: error.issues });
    }
    return errorResponse(500, 'Failed to fetch bookings', { message: (error as Error).message });
  }
}
