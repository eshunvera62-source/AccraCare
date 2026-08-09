/**
 * getAppointmentsByEmail.ts
 * ---------------------------------------------------------------------------
 * GET /appointments/{id}
 * Returns all appointments for a given patient email.
 *
 * SECURITY: This endpoint returns patient PII and is therefore admin-only.
 * It requires a valid `x-api-key` header matching the `ADMIN_API_KEY`
 * environment variable.
 * ---------------------------------------------------------------------------
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';
import { isAuthorized } from '../utils/auth.js';
import { z } from 'zod';

/** Zod schema validating the email path parameter. */
const paramsSchema = z.object({
  email: z.string().email().max(200),
});

/**
 * Lambda handler for retrieving appointments by patient email.
 *
 * @param event - API Gateway proxy event.
 * @returns 200 with a list of appointments, 400 on validation failure,
 *          401 if unauthenticated, or 500 on unexpected error.
 */
export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // --- Authorization gate: admin-only endpoint (returns PII) ---------------
  if (!isAuthorized(event)) {
    return errorResponse(401, 'Unauthorized', undefined, event);
  }

  try {
    const pathParameters = paramsSchema.parse({ email: event.pathParameters?.email });

    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: process.env.APPOINTMENTS_TABLE ?? '',
        IndexName: 'patientEmail-index',
        KeyConditionExpression: 'patientEmail = :email',
        ExpressionAttributeValues: { ':email': pathParameters.email },
      }),
    );

    return jsonResponse(200, { appointments: result.Items ?? [] }, event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(400, 'Validation failed', { issues: error.issues }, event);
    }
    // Do NOT leak internal error details to the client.
    return errorResponse(500, 'Could not retrieve appointments', undefined, event);
  }
}