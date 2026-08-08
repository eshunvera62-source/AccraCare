"""
DELETE /bookings/{id}
Cancels a booking by its ID.
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
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "DELETE,OPTIONS"
}


def lambda_handler(event, context):
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
