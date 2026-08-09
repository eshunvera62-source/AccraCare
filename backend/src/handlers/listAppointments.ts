/**
 * listAppointments.ts
 * ---------------------------------------------------------------------------
 * GET /appointments
 * Returns all appointment records.
 *
 * SECURITY: This endpoint returns patient PII and is therefore admin-only.
 * It requires a valid `x-api-key` header matching the `ADMIN_API_KEY`
 * environment variable.
 * ---------------------------------------------------------------------------
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';
import { isAuthorized } from '../utils/auth.js';

/**
 * Lambda handler for listing all appointments.
 *
 * @param event - API Gateway proxy event.
 * @returns 200 with a list of appointments, 401 if unauthenticated,
 *          or 500 on unexpected error.
 */
export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // --- Authorization gate: admin-only endpoint (returns PII) ---------------
  if (!isAuthorized(event)) {
    return errorResponse(401, 'Unauthorized', undefined, event);
  }

  try {
    const result = await dynamoClient.send(
      new ScanCommand({ TableName: process.env.APPOINTMENTS_TABLE ?? '' }),
    );

    return jsonResponse(200, { appointments: result.Items ?? [] }, event);
  } catch {
    // Do NOT leak internal error details to the client.
    return errorResponse(500, 'Failed to list appointments', undefined, event);
  }
}
