/**
 * listDoctors.ts
 * ---------------------------------------------------------------------------
 * GET /doctors
 * Returns all doctor records. Public read endpoint — no PII is exposed.
 * ---------------------------------------------------------------------------
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { dynamoClient } from '../utils/dynamo.js';

/**
 * Lambda handler for listing all doctors.
 *
 * @param event - API Gateway proxy event.
 * @returns 200 with a list of doctors, or 500 on unexpected error.
 */
export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const result = await dynamoClient.send(
      new ScanCommand({ TableName: process.env.DOCTORS_TABLE ?? '' }),
    );

    return jsonResponse(200, { doctors: result.Items ?? [] }, event);
  } catch {
    // Do NOT leak internal error details to the client.
    return errorResponse(500, 'Failed to list doctors', undefined, event);
  }
}
