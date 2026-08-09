/**
 * getBookings.ts
 * ---------------------------------------------------------------------------
 * GET /bookings?slotId=<id>
 * Returns bookings, optionally filtered by slotId (queries the GSI when given).
 *
 * SECURITY: This endpoint returns patient PII (name, phone, email) and is
 * therefore admin-only. It requires a valid `x-api-key` header matching the
 * `ADMIN_API_KEY` environment variable.
 * ---------------------------------------------------------------------------
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';
import { isAuthorized } from '../utils/auth.js';
import { z } from 'zod';

/** Zod schema validating the optional `slotId` query parameter. */
const querySchema = z.object({
  slotId: z.string().regex(/^[\w-]{1,64}$/).optional(),
});

/**
 * Lambda handler for retrieving bookings.
 *
 * @param event - API Gateway proxy event.
 * @returns 200 with a list of bookings, 400 on invalid query params,
 *          401 if unauthenticated, or 500 on unexpected error.
 */
export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // --- Authorization gate: admin-only endpoint (returns PII) ---------------
  if (!isAuthorized(event)) {
    return errorResponse(401, 'Unauthorized', undefined, event);
  }

  const bookingsTable = process.env.BOOKINGS_TABLE;
  if (!bookingsTable) {
    return errorResponse(500, 'Missing BOOKINGS_TABLE configuration', undefined, event);
  }

  try {
    const queryParams = querySchema.parse({ slotId: event.queryStringParameters?.slotId });
    const items: Array<Record<string, unknown>> = [];

    if (queryParams.slotId && queryParams.slotId !== 'all') {
      // Query the GSI by slotId for a focused result set.
      const response = await dynamoClient.send(
        new QueryCommand({
          TableName: bookingsTable,
          IndexName: 'slotId-index',
          KeyConditionExpression: 'slotId = :slotId',
          ExpressionAttributeValues: { ':slotId': queryParams.slotId },
        }),
      );
      items.push(...(response.Items ?? []));
    } else {
      // Paginate through the full table (acceptable at capstone scale).
      let exclusiveStartKey: Record<string, unknown> | undefined;
      do {
        const response = await dynamoClient.send(
          new ScanCommand({ TableName: bookingsTable, ExclusiveStartKey: exclusiveStartKey }),
        );
        items.push(...(response.Items ?? []));
        exclusiveStartKey = response.LastEvaluatedKey;
      } while (exclusiveStartKey);
    }

    // Sort newest bookings first.
    items.sort((a, b) => {
      const aBooked = Number(a.bookedAt ?? 0);
      const bBooked = Number(b.bookedAt ?? 0);
      return bBooked - aBooked;
    });

    return jsonResponse(200, items, event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(400, 'Invalid query parameters', { issues: error.issues }, event);
    }
    // Do NOT leak internal error details to the client.
    return errorResponse(500, 'Failed to fetch bookings', undefined, event);
  }
}