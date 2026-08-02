"""
PATCH /slots/{slotId}/status
Updates a slot's operational status (e.g. admin manually closing a slot).

Expected JSON body:
{ "status": "available" | "full" }
"""
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
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "PATCH,OPTIONS"
}


def decimal_default(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError


def lambda_handler(event, context):
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

        current = slots_table.get_item(Key={"id": slot_id}).get("Item")
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
            Key={"id": slot_id},
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
    except ClientError as ce:
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": str(ce)})
        }
    except Exception as exc:
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": str(exc)})
        }
