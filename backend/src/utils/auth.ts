/**
 * auth.ts
 * ---------------------------------------------------------------------------
 * Lightweight request authorization helper for the AccraCare API.
 *
 * SECURITY NOTE (important for reviewers / future maintainers):
 * This is a *capstone-grade* authorization mechanism. It validates a shared
 * secret API key supplied via the `x-api-key` header against an environment
 * variable (`ADMIN_API_KEY`). It is intentionally simple so the project can be
 * deployed and demoed without standing up a full identity provider.
 *
 * For a production deployment you should replace this with a managed identity
 * solution such as:
 *   - AWS Cognito User Pools (for staff/patient sign-in + JWT verification)
 *   - AWS IAM authorization on API Gateway (SigV4 signed requests)
 *   - Amazon Verified Permissions / custom Lambda authorizers
 *
 * The key design goals here are:
 *   1. Admin/mutation endpoints MUST NOT be callable by anonymous users.
 *   2. The secret is never hard-coded in source — it comes from the Lambda
 *      environment (injected via SAM `template.yaml`).
 *   3. Failures return a generic 401 so we never leak whether the key was
 *      missing vs. invalid.
 * ---------------------------------------------------------------------------
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { timingSafeEqual } from 'node:crypto';

/** Header name used to carry the admin API key. */
const API_KEY_HEADER = 'x-api-key';

/**
 * Extracts the admin API key from the incoming request headers.
 *
 * @param event - The raw API Gateway proxy event.
 * @returns The raw API key value, or `null` if the header is absent.
 */
function extractApiKey(event: APIGatewayProxyEvent): string | null {
  const headers = event.headers ?? {};
  // Headers are lower-cased by API Gateway, but be defensive and check both.
  return headers[API_KEY_HEADER] ?? headers['X-Api-Key'] ?? null;
}

/**
 * Constant-time string comparison to mitigate timing attacks.
 *
 * A naive `===` comparison can leak information about the key length and
 * prefix through response timing. `crypto.timingSafeEqual` runs in constant
 * time regardless of where the strings diverge.
 *
 * @param a - First string to compare.
 * @param b - Second string to compare.
 * @returns `true` if both strings are equal, `false` otherwise.
 */
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Verifies that the request carries a valid admin API key.
 *
 * @param event - The incoming API Gateway proxy event.
 * @returns `true` if the request is authorized, `false` otherwise.
 */
export function isAuthorized(event: APIGatewayProxyEvent): boolean {
  const expectedKey = process.env.ADMIN_API_KEY;
  // If no key is configured, fail closed (deny by default) rather than
  // accidentally exposing admin endpoints.
  if (!expectedKey) return false;

  const providedKey = extractApiKey(event);
  if (!providedKey) return false;

  return safeEqual(providedKey, expectedKey);
}