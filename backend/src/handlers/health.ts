/**
 * health.ts
 * ---------------------------------------------------------------------------
 * GET /health
 * Lightweight health-check endpoint used by load balancers / monitoring.
 * Public endpoint — returns no sensitive data.
 * ---------------------------------------------------------------------------
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { jsonResponse } from '../utils/response.js';

/**
 * Lambda handler for the health-check endpoint.
 *
 * @param event - API Gateway proxy event.
 * @returns 200 with service status and timestamp.
 */
export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return jsonResponse(200, { status: 'ok', timestamp: new Date().toISOString() }, event);
}