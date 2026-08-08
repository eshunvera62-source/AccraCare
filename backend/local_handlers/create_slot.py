"""
POST /slots
Creates a new appointment slot. Used by the admin/staff portal.

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
"""
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
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS"
}


def decimal_default(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError


def lambda_handler(event, context):
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
    except Exception as exc:
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": str(exc)})
        }
