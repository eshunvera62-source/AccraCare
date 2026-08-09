/**
 * status.ts
 * ---------------------------------------------------------------------------
 * GET /status
 * Returns service metadata and uptime. Public endpoint — no sensitive data.
 * ---------------------------------------------------------------------------
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { jsonResponse } from '../utils/response.js';

/**
 * Lambda handler for the service status endpoint.
 *
 * @param event - API Gateway proxy event.
 * @returns 200 with service name, version, uptime, and timestamp.
 */
export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return jsonResponse(
    200,
    {
      service: 'AccraCare',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    event,
  );
}