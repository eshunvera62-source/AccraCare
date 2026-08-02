"""
Loads backend/seed/seed_slots.json into the deployed SlotsTable.

Usage:
    python load_seed_data.py <slots-table-name> [--region us-east-1]

The table name is printed as a Terraform output after `terraform apply`
(see: terraform output slots_table_name).
"""
import json
import os
import sys
import argparse
import boto3


def resolve_seed_file_path(file_name):
    return os.path.join(os.path.dirname(__file__), file_name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("table_name", help="Name of the deployed DynamoDB slots table")
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--file", default="seed_slots.json")
    args = parser.parse_args()

    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    table = dynamodb.Table(args.table_name)
    seed_file_path = resolve_seed_file_path(args.file)

    with open(seed_file_path) as f:
        slots = json.load(f)

    with table.batch_writer() as batch:
        for slot in slots:
            batch.put_item(Item=slot)

    print(f"Loaded {len(slots)} slots into {args.table_name}.")


if __name__ == "__main__":
    main()
