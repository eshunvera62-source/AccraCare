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
        slot_id = f"slot-acc-{str(uuid.uuid4())[:8]}"

        item = {
            "id": slot_id,
            "hospitalName": body["hospitalName"],
            "area": body["area"],
            "department": body["department"],
            "doctorName": body["doctorName"],
            "doctorTitle": body.get("doctorTitle", "Specialist Consultant"),
            "dateTime": body["dateTime"],
            "availableSeats": total_seats,
            "totalSeats": total_seats,
            "status": "available" if total_seats > 0 else "full",
            "consultationFee": body.get("consultationFee", "GHS 150"),
            "createdAt": str(int(time.time() * 1000))
        }

        slots_table.put_item(Item=item)

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
