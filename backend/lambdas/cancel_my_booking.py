"""
cancel_my_booking.py
---------------------------------------------------------------------------
POST /bookings/cancel
Cancels a patient's own booking by ID, but ONLY if the provided email
matches the booking's patientEmail. This lets patients self-service
cancel without exposing the admin-only DELETE endpoint.

PUBLIC endpoint - no admin API key required. Ownership is verified by
matching the booking's patientEmail with the email in the request body.

Expected JSON body:
{ "email": "patient@example.com", "bookingId": "bk-xxxxxxxx" }
---------------------------------------------------------------------------
"""
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
    "Access-Control-Allow-Methods": "POST,OPTIONS"
}

EMAIL_RE = re.compile(r'^[^@\s]{1,64}@[^@\s]{1,255}$')
BOOKING_ID_RE = re.compile(r'^[\w\-]{1,64}$')


def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
        email = (body.get("email") or "").strip().lower()
        booking_id = (body.get("bookingId") or "").strip()

        if not EMAIL_RE.match(email):
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Invalid email address."})
            }
        if not BOOKING_ID_RE.match(booking_id):
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

        # Ownership check: only allow cancelling if the email matches.
        if (existing.get("patientEmail") or "").strip().lower() != email:
            return {
                "statusCode": 403,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "This booking does not belong to the provided email."})
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
            "body": json.dumps({"error": "Failed to cancel booking"})
        }
    except Exception:
        # Do NOT leak internal error details to the client.
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Failed to cancel booking"})
        }