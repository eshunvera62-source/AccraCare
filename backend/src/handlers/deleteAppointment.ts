/**
 * deleteAppointment.ts
 * ---------------------------------------------------------------------------
 * DELETE /appointments/{id}
 * Deletes an appointment record by its ID.
 *
 * SECURITY: This endpoint is admin-only. It requires a valid `x-api-key`
 * header matching the `ADMIN_API_KEY` environment variable.
 * ---------------------------------------------------------------------------
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';
import { isAuthorized } from '../utils/auth.js';
import { z } from 'zod';

/** Zod schema validating the appointment ID path parameter. */
const paramsSchema = z.object({
  id: z.string().min(3).max(100),
});

/**
 * Lambda handler for deleting an appointment.
 *
 * @param event - API Gateway proxy event.
 * @returns 200 with deletion confirmation, 400 on validation failure,
 *          401 if unauthenticated, or 500 on unexpected error.
 */
export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // --- Authorization gate: admin-only endpoint ---------------------------
  if (!isAuthorized(event)) {
    return errorResponse(401, 'Unauthorized', undefined, event);
  }

  try {
    const pathParameters = paramsSchema.parse({ id: event.pathParameters?.id });

    await dynamoClient.send(
      new DeleteCommand({
        TableName: process.env.APPOINTMENTS_TABLE ?? '',
        Key: { appointmentId: pathParameters.id },
        ConditionExpression: 'attribute_exists(appointmentId)',
      }),
    );

    return jsonResponse(200, { deleted: true, appointmentId: pathParameters.id }, event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(400, 'Validation failed', { issues: error.issues }, event);
    }
    // Do NOT leak internal error details to the client.
    return errorResponse(500, 'Could not delete appointment', undefined, event);
  }
}