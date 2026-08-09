/**
 * response.ts
 * ---------------------------------------------------------------------------
 * Centralized HTTP response factory for all AccraCare Lambda handlers.
 *
 * Provides a single, consistent place to configure security headers and the
 * JSON response envelope so every endpoint behaves identically.
 * ---------------------------------------------------------------------------
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * Security hardening notes:
 *
 * 1. `Access-Control-Allow-Origin` is intentionally *not* a wildcard `*`.
 *    A wildcard would let *any* website call our API from the browser
 *    (CSRF-style abuse on a stateless JSON API). Instead we validate the
 *    request's `Origin` header against an allow-list configured via
 *    `CORS_ORIGINS` / `FRONTEND_ORIGIN` environment variables.
 * 2. `Strict-Transport-Security` is set so browsers upgrade to HTTPS.
 * 3. `Cache-Control: no-store` prevents sensitive PII (patient name, phone,
 *    email) from being cached by the browser or any intermediary.
 * 4. `Content-Security-Policy` is included for defense-in-depth even though
 *    the JSON API doesn't render HTML directly.
 */

/** Origins that are allowed to call the API from a browser. */
function getAllowedOrigins(): Set<string> {
  const configured = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const frontend = process.env.FRONTEND_ORIGIN ?? '';

  const origins = new Set<string>([...configured, frontend].filter(Boolean));

  // Local development fallback (no env vars configured).
  if (origins.size === 0) {
    origins.add('http://127.0.0.1:5500');
    origins.add('http://localhost:5500');
  }
  return origins;
}

/**
 * Determines the correct `Access-Control-Allow-Origin` value for a request.
 *
 * If the request carries an `Origin` header that is in the allow-list, we
 * echo that exact origin back (required for credentialed requests and safer
 * than `*`). If the origin is not allowed (or absent), we omit the header so
 * the browser blocks the cross-origin read.
 *
 * @param event - The incoming API Gateway proxy event (optional).
 * @returns The ACAO header value, or `undefined` if the origin is not allowed.
 */
function resolveCorsOrigin(event?: APIGatewayProxyEvent): string | undefined {
  const allowed = getAllowedOrigins();
  const requestOrigin = event?.headers?.origin ?? event?.headers?.Origin;
  if (!requestOrigin) return undefined;
  return allowed.has(requestOrigin) ? requestOrigin : undefined;
}

/**
 * Builds the full set of security and CORS headers for a response.
 *
 * @param event - The incoming API Gateway proxy event (optional).
 * @returns A headers object safe to attach to an `APIGatewayProxyResult`.
 */
function buildHeaders(event?: APIGatewayProxyEvent): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Max-Age': '600',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  };

  const corsOrigin = resolveCorsOrigin(event);
  if (corsOrigin) headers['Access-Control-Allow-Origin'] = corsOrigin;

  return headers;
}

/**
 * Formats a unified JSON response envelope for every Lambda handler.
 *
 * @param statusCode - HTTP status code to return.
 * @param body - Serializable payload. If a string is passed, it is wrapped
 *               in an `{ message }` object.
 * @param event - Optional API Gateway event used for CORS origin validation.
 * @returns An `APIGatewayProxyResult` ready to return from a handler.
 */
export function jsonResponse(
  statusCode: number,
  body: unknown = {},
  event?: APIGatewayProxyEvent,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: buildHeaders(event),
    body: typeof body === 'string' ? JSON.stringify({ message: body }) : JSON.stringify(body),
  };
}

/**
 * Builds a standardized error response.
 *
 * IMPORTANT (security):
 * The `details` field must never contain raw exception messages, stack traces,
 * or DynamoDB internal errors. Those leak implementation details to an
 * attacker. Only safe, human-readable text should be passed here.
 *
 * @param statusCode - HTTP status code (4xx/5xx).
 * @param error - Short, human-readable error description.
 * @param details - Optional structured metadata; MUST be sanitized before use.
 * @param event - Optional API Gateway event used for CORS origin validation.
 * @returns An `APIGatewayProxyResult` ready to return from a handler.
 */
export function errorResponse(
  statusCode: number,
  error: string,
  details?: Record<string, unknown>,
  event?: APIGatewayProxyEvent,
): APIGatewayProxyResult {
  return jsonResponse(statusCode, { error, ...(details ?? {}) }, event);
}
