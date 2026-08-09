"""
book_slot.py
---------------------------------------------------------------------------
POST /slots/{slotId}/book
Atomically books one seat on a slot and records the booking.

SECURITY NOTES:
1. The confirmation code is generated using `secrets.randbelow`
   (cryptographically secure) rather than `random.randint` which is
   predictable and forgeable.
2. The DynamoDB conditional update (`availableSeats > :zero`) prevents the
   race condition where two patients book the last seat simultaneously.
3. All user-supplied fields are stripped and length-capped.

Expected JSON body:
{
  "name": "...",
  "phone": "...",
  "email": "..."   (optional)
}

Returns the same success / SLOT_JUST_FILLED contract the frontend's
mock api.js already expects, so booking.js needs no changes.
---------------------------------------------------------------------------
"""
import json
import os
import re
import secrets
import time
import uuid
import boto3
from boto3.dynamodb.conditions import Key
from decimal import Decimal
from botocore.exceptions import ClientError

dynamodb = boto3.resource("dynamodb")
slots_table = dynamodb.Table(os.environ["SLOTS_TABLE"])
bookings_table = dynamodb.Table(os.environ["BOOKINGS_TABLE"])
sns = boto3.client("sns")
SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN", "")

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
        slot_id = event["pathParameters"]["slotId"]
        if not re.match(r'^[\w\-]{1,64}$', slot_id):
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"success": False, "error": "Invalid slot ID."})
            }

        body = json.loads(event.get("body") or "{}")

        name = (body.get("name") or "").strip()[:200]
        phone = (body.get("phone") or "").strip()[:50]
        email = (body.get("email") or "").strip()[:200]

        if not name or not phone:
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"success": False, "error": "Patient name and phone are required."})
            }

        try:
            # Conditional update: only decrement if a seat is actually available.
            # This is what prevents the race condition the frontend simulates.
            updated_slot = slots_table.update_item(
                Key={"id": str(slot_id)},
                UpdateExpression="SET availableSeats = availableSeats - :one, "
                                  "#s = if_not_exists(#s, :avail)",
                ConditionExpression="attribute_exists(id) AND availableSeats > :zero",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":one": 1, ":zero": 0, ":avail": "available"},
                ReturnValues="ALL_NEW"
            )["Attributes"]
        except ClientError as ce:
            if ce.response["Error"]["Code"] == "ConditionalCheckFailedException":
                current = slots_table.get_item(Key={"id": str(slot_id)}).get("Item")
                if current is None:
                    return {
                        "statusCode": 404,
                        "headers": CORS_HEADERS,
                        "body": json.dumps({"success": False, "error": "The requested appointment slot was not found."})
                    }
                return {
                    "statusCode": 409,
                    "headers": CORS_HEADERS,
                    "body": json.dumps(
                        {"success": False, "error": "SLOT_JUST_FILLED", "updatedSlot": current},
                        default=decimal_default
                    )
                }
            raise

        # If seats hit zero, flip status to full
        if int(updated_slot.get("availableSeats", 0)) <= 0 and updated_slot.get("status") != "full":
            updated_slot = slots_table.update_item(
                Key={"id": str(slot_id)},
                UpdateExpression="SET #s = :full",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":full": "full"},
                ReturnValues="ALL_NEW"
            )["Attributes"]

        confirmation_code = f"ACC-{secrets.randbelow(900000) + 100000}"

        # All fields are explicitly typed — no raw user input used as keys or operators.
        # slotId is the validated path param; patient fields are stripped + length-capped strings.
        booking = {
            "id": str(f"bk-{uuid.uuid4().hex[:8]}"),
            "confirmationCode": str(confirmation_code),
            "slotId": str(slot_id),
            "patientName": str(name),
            "patientPhone": str(phone),
            "patientEmail": str(email),
            "bookedAt": int(time.time() * 1000),
            "ttl": int(time.time()) + 365 * 24 * 3600,
            "status": "confirmed"
        }
        bookings_table.put_item(
            Item=booking,
            ConditionExpression="attribute_not_exists(id)"
        )

        if SNS_TOPIC_ARN:
            try:
                sns.publish(
                    TopicArn=SNS_TOPIC_ARN,
                    Subject="AccraCare booking confirmed",
                    Message=(
                        f"Booking confirmed for {name} at {updated_slot.get('hospitalName')} "
                        f"({updated_slot.get('department')}) on {updated_slot.get('dateTime')}. "
                        f"Confirmation code: {confirmation_code}. Phone on file: {phone}."
                    )
                )
            except ClientError:
                # Notification failure should never block a successful booking
                pass

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps(
                {"success": True, "booking": booking, "updatedSlot": updated_slot},
                default=decimal_default
            )
        }
    except Exception:
        # Do NOT leak internal error details to the client.
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"success": False, "error": "Failed to book slot"})
        }