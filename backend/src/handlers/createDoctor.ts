/**
 * createDoctor.ts
 * ---------------------------------------------------------------------------
 * POST /doctors
 * Creates a new doctor record. Used by the admin/staff portal.
 *
 * SECURITY: This endpoint is admin-only. It requires a valid `x-api-key`
 * header matching the `ADMIN_API_KEY` environment variable.
 * ---------------------------------------------------------------------------
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';
import { isAuthorized } from '../utils/auth.js';
import { z } from 'zod';

/** Zod schema validating the doctor creation payload. */
const schema = z.object({
  name: z.string().min(3).max(200),
  specialty: z.string().min(3).max(200),
  hospital: z.string().min(3).max(200),
  email: z.string().email().max(200).optional(),
  description: z.string().max(500).optional(),
});

/**
 * Lambda handler for creating a new doctor.
 *
 * @param event - API Gateway proxy event.
 * @returns 201 with the created doctor, 400 on validation failure,
 *          401 if unauthenticated, or 500 on unexpected error.
 */
export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // --- Authorization gate: admin-only endpoint ---------------------------
  if (!isAuthorized(event)) {
    return errorResponse(401, 'Unauthorized', undefined, event);
  }

  try {
    const body = schema.parse(JSON.parse(event.body ?? '{}'));
    const doctorId = `doc-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const item = {
      doctorId,
      ...body,
      createdAt: now,
      updatedAt: now,
    };

    await dynamoClient.send(
      new PutCommand({
        TableName: process.env.DOCTORS_TABLE ?? '',
        Item: item,
        ConditionExpression: 'attribute_not_exists(doctorId)',
      }),
    );

    return jsonResponse(201, item, event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(400, 'Validation failed', { issues: error.issues }, event);
    }
    // Do NOT leak internal error details to the client.
    return errorResponse(500, 'Failed to create doctor', undefined, event);
  }
}