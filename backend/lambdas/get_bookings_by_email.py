"""
get_bookings_by_email.py
---------------------------------------------------------------------------
GET /bookings/by-email/{email}
Returns all bookings for a given patient email using the email GSI.

SECURITY: This endpoint returns patient PII and is therefore admin-only.
It requires a valid `x-api-key` header matching the `ADMIN_API_KEY`
environment variable.
---------------------------------------------------------------------------
"""
import hmac
import json
import os
import re
import boto3
from boto3.dynamodb.conditions import Key
from decimal import Decimal

dynamodb = boto3.resource("dynamodb")
bookings_table = dynamodb.Table(os.environ["BOOKINGS_TABLE"])

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,x-api-key",
    "Access-Control-Allow-Methods": "GET,OPTIONS"
}

EMAIL_RE = re.compile(r'^[^@\s]{1,64}@[^@\s]{1,255}$')


def decimal_default(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError


def is_authorized(event):
    """Verify the request carries a valid admin API key.

    Uses hmac.compare_digest for constant-time comparison to mitigate
    timing attacks. Fails closed (denies) if ADMIN_API_KEY is not set.
    """
    expected = os.environ.get("ADMIN_API_KEY", "")
    if not expected:
        return False
    headers = event.get("headers") or {}
    provided = headers.get("x-api-key") or headers.get("X-Api-Key") or ""
    if not provided:
        return False
    return hmac.compare_digest(provided, expected)


def lambda_handler(event, context):
    # --- Authorization gate: admin-only endpoint (returns PII) ---------------
    if not is_authorized(event):
        return {
            "statusCode": 401,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Unauthorized"})
        }

    try:
        email = (event.get("pathParameters") or {}).get("email", "")
        if not EMAIL_RE.match(email):
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Invalid email address."})
            }

        response = bookings_table.query(
            IndexName="patientEmail-index",
            KeyConditionExpression=Key("patientEmail").eq(email)
        )
        items = response.get("Items", [])
        items.sort(key=lambda b: b.get("bookedAt", 0), reverse=True)

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps(items, default=decimal_default)
        }
    except Exception:
        # Do NOT leak internal error details to the client.
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Failed to retrieve bookings"})
        }