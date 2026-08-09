/**
 * createSlot.ts
 * ---------------------------------------------------------------------------
 * POST /slots
 * Creates a new appointment slot. Used by the admin/staff portal.
 *
 * SECURITY: This endpoint is admin-only. It requires a valid `x-api-key`
 * header matching the `ADMIN_API_KEY` environment variable. Requests without
 * a valid key receive a generic 401 response.
 * ---------------------------------------------------------------------------
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';
import { isAuthorized } from '../utils/auth.js';

/** Zod schema validating the slot creation payload. */
const schema = z.object({
  hospitalName: z.string().min(1).max(200),
  area: z.string().min(1).max(200),
  department: z.string().min(1).max(200),
  doctorName: z.string().min(1).max(200),
  doctorTitle: z.string().max(200).optional(),
  dateTime: z.string().min(1).max(100),
  totalSeats: z.number().int().min(1).max(100),
  consultationFee: z.string().max(100).optional(),
});

/**
 * Lambda handler for creating a new appointment slot.
 *
 * @param event - API Gateway proxy event.
 * @returns 201 with the created slot, 400 on validation failure,
 *          401 if unauthenticated, or 500 on unexpected error.
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
    const body = schema.parse(JSON.parse(event.body ?? '{}'));
    const slotId = `slot-acc-${randomUUID().slice(0, 8)}`;
    const now = Date.now();

    const item = {
      id: slotId,
      hospitalName: body.hospitalName,
      area: body.area,
      department: body.department,
      doctorName: body.doctorName,
      doctorTitle: body.doctorTitle ?? 'Specialist Consultant',
      dateTime: body.dateTime,
      availableSeats: body.totalSeats,
      totalSeats: body.totalSeats,
      status: body.totalSeats > 0 ? 'available' : 'full',
      consultationFee: body.consultationFee ?? 'GHS 150',
      createdAt: now,
    };

    await dynamoClient.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(id)',
      }),
    );

    return jsonResponse(201, item, event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(400, 'Invalid slot payload', { issues: error.issues }, event);
    }
    // Do NOT leak internal error details to the client.
    return errorResponse(500, 'Failed to create slot', undefined, event);
  }
}