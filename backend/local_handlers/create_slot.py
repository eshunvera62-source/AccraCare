"""
create_slot.py
---------------------------------------------------------------------------
POST /slots
Creates a new appointment slot. Used by the admin/staff portal.

SECURITY: This endpoint is admin-only. It requires a valid `x-api-key`
header matching the `ADMIN_API_KEY` environment variable. Requests without
a valid key receive a generic 401 response.

Expected JSON body:
{
  "hospitalName": "...",
  "area": "...",
  "department": "...",
  "doctorName": "...",
  "doctorTitle": "...",       (optional)
  "dateTime": "2026-08-10T09:30:00",
  "totalSeats": 5,
  "consultationFee": "GHS 150" (optional)
}
---------------------------------------------------------------------------
"""
import hmac
import json
import os
import time
import uuid
import boto3
from decimal import Decimal

dynamodb = boto3.resource("dynamodb")
slots_table = dynamodb.Table(os.environ["SLOTS_TABLE"])

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,x-api-key",
    "Access-Control-Allow-Methods": "POST,OPTIONS"
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
        body = json.loads(event.get("body") or "{}")

        required = ["hospitalName", "area", "department", "doctorName", "dateTime", "totalSeats"]
        missing = [f for f in required if not body.get(f) and body.get(f) != 0]
        if missing:
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": f"Missing required field(s): {', '.join(missing)}"})
            }

        total_seats = int(body["totalSeats"])
        if not (1 <= total_seats <= 100):
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "totalSeats must be between 1 and 100."})
            }

        MAX_LEN = 200
        for field in ["hospitalName", "area", "department", "doctorName", "doctorTitle"]:
            val = str(body.get(field, ""))
            if len(val) > MAX_LEN:
                return {
                    "statusCode": 400,
                    "headers": CORS_HEADERS,
                    "body": json.dumps({"error": f"{field} exceeds maximum length of {MAX_LEN} characters."})
                }
        slot_id = str(f"slot-acc-{uuid.uuid4().hex[:8]}")

        # Explicitly type all fields — no raw user input used as keys or operators
        item = {
            "id": str(slot_id),
            "hospitalName": str(body["hospitalName"])[:200],
            "area": str(body["area"])[:200],
            "department": str(body["department"])[:200],
            "doctorName": str(body["doctorName"])[:200],
            "doctorTitle": str(body.get("doctorTitle", "Specialist Consultant"))[:200],
            "dateTime": str(body["dateTime"])[:50],
            "availableSeats": int(total_seats),
            "totalSeats": int(total_seats),
            "status": "available" if total_seats > 0 else "full",
            "consultationFee": str(body.get("consultationFee", "GHS 150"))[:50],
            "createdAt": str(int(time.time() * 1000))
        }

        slots_table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(id)"
        )

        return {
            "statusCode": 201,
            "headers": CORS_HEADERS,
            "body": json.dumps(item, default=decimal_default)
        }
    except Exception:
        # Do NOT leak internal error details to the client.
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Failed to create slot"})
        }