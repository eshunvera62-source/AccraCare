import type { APIGatewayProxyResult } from 'aws-lambda';

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer'
};

export function jsonResponse(
  statusCode: number,
  body: unknown = {}
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: DEFAULT_HEADERS,
    body: typeof body === 'string' ? JSON.stringify({ message: body }) : JSON.stringify(body)
  };
}

export function errorResponse(statusCode: number, error: string, details?: Record<string, unknown>) {
  return jsonResponse(statusCode, { error, details });
}
