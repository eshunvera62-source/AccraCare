"""
delete_booking.py
---------------------------------------------------------------------------
DELETE /bookings/{id}
Cancels a booking by its ID.

SECURITY: This endpoint is admin-only. It requires a valid `x-api-key`
header matching the `ADMIN_API_KEY` environment variable.
---------------------------------------------------------------------------
"""
import hmac
import json
import os
import re
import boto3
from botocore.exceptions import ClientError

dynamodb = boto3.resource("dynamodb")
bookings_table = dynamodb.Table(os.environ["BOOKINGS_TABLE"])

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,x-api-key",
    "Access-Control-Allow-Methods": "DELETE,OPTIONS"
}


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
    # --- Authorization gate: admin-only endpoint ---------------------------
    if not is_authorized(event):
        return {
            "statusCode": 401,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Unauthorized"})
        }

    try:
        booking_id = (event.get("pathParameters") or {}).get("id", "")
        if not re.match(r'^[\w\-]{1,64}$', booking_id):
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Invalid booking ID."})
            }

        existing = bookings_table.get_item(Key={"id": str(booking_id)}).get("Item")
        if not existing:
            return {
                "statusCode": 404,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Booking not found."})
            }

        bookings_table.delete_item(
            Key={"id": str(booking_id)},
            ConditionExpression="attribute_exists(id)"
        )

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({"success": True, "deletedId": booking_id})
        }
    except ClientError as ce:
        if ce.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return {
                "statusCode": 404,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Booking not found."})
            }
        # Do NOT leak internal error details to the client.
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Failed to delete booking"})
        }
    except Exception:
        # Do NOT leak internal error details to the client.
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Failed to delete booking"})
        }