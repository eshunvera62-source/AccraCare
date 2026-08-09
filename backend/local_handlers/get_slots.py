"""
get_slots.py
---------------------------------------------------------------------------
GET /slots
Returns every appointment slot in the SlotsTable.
Public read endpoint — no PII is exposed.
---------------------------------------------------------------------------
"""
import json
import os
import boto3
from decimal import Decimal

dynamodb = boto3.resource("dynamodb")
slots_table = dynamodb.Table(os.environ["SLOTS_TABLE"])

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
        response = slots_table.scan(
            ProjectionExpression="id, hospitalName, area, department, doctorName, "
                                 "doctorTitle, #dt, availableSeats, totalSeats, #s, consultationFee",
            ExpressionAttributeNames={"#dt": "dateTime", "#s": "status"}
        )
        items = response.get("Items", [])

        # Paginate through the full table (fine for capstone-scale data)
        while "LastEvaluatedKey" in response:
            response = slots_table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
            items.extend(response.get("Items", []))

        # Keep newest slots first, matching the mock frontend's unshift() behaviour
        items.sort(key=lambda s: s.get("createdAt", ""), reverse=True)

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps(items, default=decimal_default)
        }
    except Exception:
        # Do NOT leak internal error details to the client.
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Failed to fetch slots"})
        }