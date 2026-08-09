/**
 * updateSlotStatus.ts
 * ---------------------------------------------------------------------------
 * PATCH /slots/{slotId}/status
 * Updates a slot's operational status (e.g. admin manually closing a slot).
 *
 * SECURITY: This endpoint is admin-only. It requires a valid `x-api-key`
 * header matching the `ADMIN_API_KEY` environment variable.
 * ---------------------------------------------------------------------------
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';
import { isAuthorized } from '../utils/auth.js';
import { z } from 'zod';

/** Zod schema validating the slot ID path parameter. */
const pathSchema = z.object({
  slotId: z.string().regex(/^[\w-]{1,64}$/),
});

/** Zod schema validating the status update body. */
const bodySchema = z.object({
  status: z.enum(['available', 'full']),
});

/**
 * Lambda handler for updating a slot's availability status.
 *
 * @param event - API Gateway proxy event.
 * @returns 200 with the updated slot, 400 on validation failure,
 *          401 if unauthenticated, 404 if slot not found, or 500 on error.
 */
export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // --- Authorization gate: admin-only endpoint ---------------------------
  if (!isAuthorized(event)) {
    return errorResponse(401, 'Unauthorized', undefined, event);
  }

  const tableName = process.env.SLOTS_TABLE;
  if (!tableName) {
    return errorResponse(500, 'Missing SLOTS_TABLE configuration', undefined, event);
  }

  try {
    const pathParameters = pathSchema.parse({ slotId: event.pathParameters?.slotId });
    const body = bodySchema.parse(JSON.parse(event.body ?? '{}'));
    const slotId = pathParameters.slotId;

    const currentItem = await dynamoClient.send(
      new GetCommand({ TableName: tableName, Key: { id: slotId } }),
    );

    if (!currentItem.Item) {
      return jsonResponse(404, { error: 'Slot not found' }, event);
    }

    const totalSeatsValue = currentItem.Item.totalSeats;
    const totalSeats =
      typeof totalSeatsValue === 'number'
        ? totalSeatsValue
        : parseInt(String(totalSeatsValue ?? ''), 10) || 1;

    const newAvailableSeats = body.status === 'full' ? 0 : totalSeats || 1;

    const updated = await dynamoClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: slotId },
        UpdateExpression: 'SET availableSeats = :seats, #s = :status',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':seats': newAvailableSeats, ':status': body.status },
        ReturnValues: 'ALL_NEW',
      }),
    );

    return jsonResponse(200, updated.Attributes ?? {}, event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(400, 'Invalid slot status payload', { issues: error.issues }, event);
    }
    // Do NOT leak internal error details to the client.
    return errorResponse(500, 'Failed to update slot status', undefined, event);
  }
}