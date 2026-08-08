"""
GET /bookings/by-email/{email}
Returns all bookings for a given patient email using the email GSI.
"""
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
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS"
}

EMAIL_RE = re.compile(r'^[^@\s]{1,64}@[^@\s]{1,255}$')


def decimal_default(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError


def lambda_handler(event, context):
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
    except Exception as exc:
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": str(exc)})
        }
