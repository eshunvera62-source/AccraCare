/**
 * createAppointment.ts
 * ---------------------------------------------------------------------------
 * POST /appointments
 * Creates a new patient appointment record.
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

/** Zod schema validating the appointment creation payload. */
const payloadSchema = z.object({
  doctorId: z.string().min(3).max(100),
  patientEmail: z.string().email().max(200),
  patientName: z.string().min(3).max(200),
  appointmentTime: z.string().min(1).max(100),
  reason: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
});

/**
 * Lambda handler for creating a new appointment.
 *
 * @param event - API Gateway proxy event.
 * @returns 201 with the created appointment, 400 on validation failure,
 *          401 if unauthenticated, or 500 on unexpected error.
 */
export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // --- Authorization gate: admin-only endpoint ---------------------------
  if (!isAuthorized(event)) {
    return errorResponse(401, 'Unauthorized', undefined, event);
  }

  try {
    const body = payloadSchema.parse(JSON.parse(event.body ?? '{}'));
    const appointmentId = `appt-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const appointment = {
      appointmentId,
      ...body,
      status: 'scheduled',
      createdAt: now,
      updatedAt: now,
      ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    };

    await dynamoClient.send(
      new PutCommand({
        TableName: process.env.APPOINTMENTS_TABLE ?? '',
        Item: appointment,
        ConditionExpression: 'attribute_not_exists(appointmentId)',
      }),
    );

    return jsonResponse(201, appointment, event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(400, 'Validation failed', { issues: error.issues }, event);
    }
    // Do NOT leak internal error details to the client.
    return errorResponse(500, 'Could not create appointment', undefined, event);
  }
}