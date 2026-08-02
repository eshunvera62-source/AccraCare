"""
GET /bookings?slotId=<id>
Returns bookings, optionally filtered by slotId (queries the GSI when given).
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


def decimal_default(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError


def lambda_handler(event, context):
    try:
        params = event.get("queryStringParameters") or {}
        slot_id = params.get("slotId")

        if slot_id and slot_id != "all":
            if not re.match(r'^[\w\-]{1,64}$', slot_id):
                return {
                    "statusCode": 400,
                    "headers": CORS_HEADERS,
                    "body": json.dumps({"error": "Invalid slotId parameter."})
                }
            response = bookings_table.query(
                IndexName="slotId-index",
                KeyConditionExpression=Key("slotId").eq(slot_id)
            )
            items = response.get("Items", [])
        else:
            response = bookings_table.scan()
            items = response.get("Items", [])
            while "LastEvaluatedKey" in response:
                response = bookings_table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
                items.extend(response.get("Items", []))

        items.sort(key=lambda b: b.get("bookedAt", ""), reverse=True)

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
