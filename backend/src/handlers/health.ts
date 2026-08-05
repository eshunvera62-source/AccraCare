import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { jsonResponse } from '../utils/response.js';

export async function lambdaHandler(_: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return jsonResponse(200, { status: 'ok', timestamp: new Date().toISOString() });
}
