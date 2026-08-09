"""
update_slot_status.py
---------------------------------------------------------------------------
PATCH /slots/{slotId}/status
Updates a slot's operational status (e.g. admin manually closing a slot).

SECURITY: This endpoint is admin-only. It requires a valid `x-api-key`
header matching the `ADMIN_API_KEY` environment variable.

Expected JSON body:
{ "status": "available" | "full" }
---------------------------------------------------------------------------
"""
import hmac
import json
import os
import re
import boto3
from decimal import Decimal
from botocore.exceptions import ClientError

dynamodb = boto3.resource("dynamodb")
slots_table = dynamodb.Table(os.environ["SLOTS_TABLE"])

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,x-api-key",
    "Access-Control-Allow-Methods": "PATCH,OPTIONS"
}


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
    # --- Authorization gate: admin-only endpoint ---------------------------
    if not is_authorized(event):
        return {
            "statusCode": 401,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Unauthorized"})
        }

    try:
        slot_id = event["pathParameters"]["slotId"]
        if not re.match(r'^[\w\-]{1,64}$', slot_id):
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Invalid slot ID."})
            }

        body = json.loads(event.get("body") or "{}")
        new_status = body.get("status")

        if new_status not in ("available", "full"):
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "status must be 'available' or 'full'"})
            }

        current = slots_table.get_item(Key={"id": str(slot_id)}).get("Item")
        if not current:
            return {
                "statusCode": 404,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Slot not found"})
            }

        if new_status == "full":
            seats_expr = "SET availableSeats = :zero, #s = :status"
            values = {":zero": 0, ":status": new_status}
        else:
            # Reopening a slot with 0 seats needs a usable seat count again
            restored_seats = int(current.get("availableSeats", 0)) or int(current.get("totalSeats", 1))
            seats_expr = "SET availableSeats = :seats, #s = :status"
            values = {":seats": restored_seats, ":status": new_status}

        updated = slots_table.update_item(
            Key={"id": str(slot_id)},
            UpdateExpression=seats_expr,
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues=values,
            ReturnValues="ALL_NEW"
        )["Attributes"]

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps(updated, default=decimal_default)
        }
    except ClientError:
        # Do NOT leak internal error details to the client.
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Failed to update slot status"})
        }
    except Exception:
        # Do NOT leak internal error details to the client.
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Failed to update slot status"})
        }