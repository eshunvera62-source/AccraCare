"""
local_api.py
---------------------------------------------------------------------------
Lightweight local API server for AccraCare Lambda handlers.

Mimics API Gateway's event shape so the same Lambda handler code runs
locally without deploying to AWS. Used for local development and demos.

SECURITY NOTE:
Admin endpoints fail closed unless the developer explicitly supplies an
ADMIN_API_KEY environment variable. Production deployments MUST set a strong
ADMIN_API_KEY via SAM parameter overrides (see template.yaml).
---------------------------------------------------------------------------
"""
import argparse
import importlib.util
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Dev-only fallback so local testing works without exporting env vars.
# NEVER use this value in production — template.yaml passes the real
# AdminApiKey parameter to the deployed Lambda functions.
os.environ.setdefault("FRONTEND_ORIGIN", "http://127.0.0.1:5500")


def load_handler(module_name, relative_path):
    """Dynamically loads a Python handler module from disk."""
    module_path = os.path.join(ROOT_DIR, relative_path)
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


GET_SLOTS_HANDLER = load_handler("get_slots_handler", "backend/local_handlers/get_slots.py")
CREATE_SLOT_HANDLER = load_handler("create_slot_handler", "backend/local_handlers/create_slot.py")
BOOK_SLOT_HANDLER = load_handler("book_slot_handler", "backend/local_handlers/book_slot.py")
GET_BOOKINGS_HANDLER = load_handler("get_bookings_handler", "backend/local_handlers/get_bookings.py")
UPDATE_SLOT_STATUS_HANDLER = load_handler("update_slot_status_handler", "backend/local_handlers/update_slot_status.py")


class LocalApiHandler(BaseHTTPRequestHandler):
    """HTTP request handler that forwards events to Lambda handlers."""

    server_version = "AccraCareLocal/1.0"

    def do_GET(self):
        self._handle_request("GET")

    def do_POST(self):
        self._handle_request("POST")

    def do_PATCH(self):
        self._handle_request("PATCH")

    def do_OPTIONS(self):
        self._handle_request("OPTIONS")

    def log_message(self, format, *args):
        # Suppress default HTTP request logging for a clean dev console.
        return

    def _handle_request(self, method):
        parsed = urlparse(self.path)
        path = parsed.path
        query_params = parse_qs(parsed.query)

        try:
            if path == "/" and method == "GET":
                response = {"statusCode": 200, "headers": self._cors_headers(), "body": json.dumps({"status": "ok"})}
            elif path == "/slots" and method == "GET":
                event = self._build_event(method, path, query_params, None)
                response = GET_SLOTS_HANDLER.lambda_handler(event, None)
            elif path == "/slots" and method == "POST":
                body = self._read_body()
                event = self._build_event(method, path, query_params, body)
                response = CREATE_SLOT_HANDLER.lambda_handler(event, None)
            elif path.startswith("/slots/") and path.endswith("/book") and method == "POST":
                slot_id = path.split("/")[2]
                body = self._read_body()
                event = self._build_event(method, path, query_params, body, path_parameters={"slotId": slot_id})
                response = BOOK_SLOT_HANDLER.lambda_handler(event, None)
            elif path == "/slots" and method == "OPTIONS":
                response = {"statusCode": 204, "headers": self._cors_headers(), "body": ""}
            elif path.startswith("/slots/") and path.endswith("/status") and method == "PATCH":
                slot_id = path.split("/")[2]
                body = self._read_body()
                event = self._build_event(method, path, query_params, body, path_parameters={"slotId": slot_id})
                response = UPDATE_SLOT_STATUS_HANDLER.lambda_handler(event, None)
            elif path == "/bookings" and method == "GET":
                event = self._build_event(method, path, query_params, None)
                response = GET_BOOKINGS_HANDLER.lambda_handler(event, None)
            elif path == "/bookings" and method == "OPTIONS":
                response = {"statusCode": 204, "headers": self._cors_headers(), "body": ""}
            elif path.startswith("/slots/") and method == "OPTIONS":
                response = {"statusCode": 204, "headers": self._cors_headers(), "body": ""}
            else:
                response = {"statusCode": 404, "headers": self._cors_headers(), "body": json.dumps({"error": "Not found"})}
        except Exception as exc:
            print(f"Handler error for {method} {path}: {exc}", flush=True)
            response = {"statusCode": 500, "headers": self._cors_headers(), "body": json.dumps({"error": "Internal server error"})}

        self._write_response(response)

    def _build_event(self, method, path, query_params, body, path_parameters=None):
        """Builds an API Gateway-compatible event object."""
        event = {
            "httpMethod": method,
            "path": path,
            "pathParameters": path_parameters or {},
            "queryStringParameters": {k: v[0] if len(v) == 1 else v for k, v in query_params.items()},
            "headers": {k.lower(): v for k, v in self.headers.items()},
            "body": body,
            "isBase64Encoded": False,
        }
        return event

    def _read_body(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            return None
        body_bytes = self.rfile.read(content_length)
        return body_bytes.decode("utf-8")

    def _write_response(self, response):
        status_code = int(response.get("statusCode", 200))
        headers = response.get("headers", {})
        body = response.get("body", "")
        body_bytes = body.encode("utf-8") if isinstance(body, str) else body

        self.send_response(status_code)
        for key, value in headers.items():
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(body_bytes)))
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        if body_bytes:
            self.wfile.write(body_bytes)

    def _cors_headers(self):
        return {
            "Access-Control-Allow-Origin": os.environ.get("FRONTEND_ORIGIN", "http://127.0.0.1:5500"),
            "Access-Control-Allow-Headers": "Content-Type,Authorization,x-api-key",
            "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS"
        }


def main():
    """Entry point for the local dev server."""
    parser = argparse.ArgumentParser(description="Run a lightweight local API server for the AccraCare Lambda handlers")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=3001)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), LocalApiHandler)
    print(f"Serving AccraCare local API on http://{args.host}:{args.port}")
    print(
        "Admin API key is configured for local development."
        if os.environ.get("ADMIN_API_KEY")
        else "Admin endpoints are disabled until ADMIN_API_KEY is set."
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
