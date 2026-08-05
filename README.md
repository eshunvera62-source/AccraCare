# AccraCare — Serverless Hospital Appointment Booking System

Capstone project for the Generation Ghana / Azubi Africa AWS Cloud Computing Programme.

AccraCare replaces manual appointment booking (paper forms / spreadsheets) with a
scalable serverless REST API backed entirely by AWS managed services, deployed
with AWS SAM (CloudFormation).

---

## Problem Statement

Outpatient clinics in Accra manage appointment bookings manually — patients queue,
staff use spreadsheets, and there is no real-time seat availability. AccraCare
replaces this with a self-service web portal and a REST API that enforces seat
limits, prevents double-booking via atomic DynamoDB conditional writes, and sends
confirmation emails automatically via SNS.

---

## Architecture

```
Browser (S3 + CloudFront)
      │
      ▼
API Gateway (REST API)
      │
      ▼
AWS Lambda (Python 3.12 — one function per endpoint)
      │
      ▼
DynamoDB (BookingsTable + SlotsTable, GSIs, TTL, PITR, SSE-KMS)
      │
      ├──> SNS  (booking confirmation + ops alerts)
      └──> CloudWatch Logs + Alarms (error rate > 5%, 5xx)

AWS Budgets  — monthly spend alert at 80% / 100% of $5 limit
Everything above is one CloudFormation stack defined in template.yaml
```

---

## REST API Endpoints

| Method   | Path                          | Description                              |
|----------|-------------------------------|------------------------------------------|
| POST     | /slots                        | Create an appointment slot (admin)       |
| GET      | /slots                        | List all available slots                 |
| POST     | /slots/{slotId}/book          | Book a slot — register for an event      |
| PATCH    | /slots/{slotId}/status        | Open / close a slot (admin)              |
| GET      | /bookings                     | List all bookings                        |
| GET      | /bookings/by-email/{email}    | View registrations by patient email      |
| DELETE   | /bookings/{id}                | Cancel a registration                    |

---

## Project Layout

```
accra-hospital-capstone/
├── template.yaml                        # SAM/CloudFormation — all AWS resources
├── samconfig.toml                       # sam deploy defaults
├── .github/workflows/deploy.yml         # CI/CD: test → build → deploy → seed → sync
├── frontend/                            # Static website (index.html, admin.html)
│   └── scripts/api.js                   # Calls the real API Gateway URL
├── backend/
│   ├── lambdas/                         # Python 3.12 Lambda handlers
│   │   ├── get_slots/
│   │   ├── create_slot/
│   │   ├── book_slot/
│   │   ├── get_bookings/
│   │   ├── get_bookings_by_email/       # GET /bookings/by-email/{email}
│   │   ├── delete_booking/             # DELETE /bookings/{id}
│   │   └── update_slot_status/
│   └── seed/                            # Seed data + unit tests
│       ├── seed_slots.json
│       ├── load_seed_data.py
│       ├── test_load_seed_data.py
│       └── test_config_defaults.py
└── events/                              # Sample events for sam local invoke
```

---

## Phase Deliverables Checklist

### Phase 1 — Infrastructure Foundation
- [x] S3 + CloudFront for static frontend hosting
- [x] AWS Lambda (Python 3.12) for serverless compute
- [x] API Gateway REST API with CORS, throttling, access logging
- [x] IAM least-privilege roles via SAM managed policies
- [x] All resources defined in `template.yaml` (SAM/CloudFormation)

### Phase 2 — API Development
- [x] `POST /slots` — create slot (register event)
- [x] `GET /slots` — list all slots (list events)
- [x] `GET /bookings/by-email/{email}` — view registrations by email
- [x] `DELETE /bookings/{id}` — cancel registration
- [x] DynamoDB table design: SlotsTable + BookingsTable with GSIs
- [x] Input validation and sanitisation in every handler
- [x] CORS headers on all responses
- [x] SNS email confirmation on successful booking

### Phase 3 — Automation & CI/CD
- [x] GitHub repository with `main` and `fix/code-review` branches
- [x] GitHub Actions workflow: test → build → deploy → seed → frontend sync
- [x] Automated Python unit tests run on every push (must pass before deploy)
- [x] `sam validate --lint` runs in CI before every deploy
- [x] Deployment fully automated — no manual steps after merge to main

### Phase 4 — Monitoring & Security
- [x] CloudWatch Logs on all Lambda functions (14-day retention)
- [x] CloudWatch Alarm: Lambda error rate > 5% → SNS ops alert
- [x] CloudWatch Alarm: API Gateway 5xx errors → SNS ops alert
- [x] CloudWatch Dashboard: invocations, errors, duration, API request count
- [x] API Gateway access logging (JSON format)
- [x] Input validation + regex sanitisation on all path/query/body params
- [x] IAM least-privilege (DynamoDBReadPolicy / DynamoDBCrudPolicy per function)
- [x] DynamoDB SSE-KMS, PITR, TTL on both tables
- [x] S3 SSE-KMS encryption + versioning + lifecycle
- [x] SNS topics encrypted with `alias/aws/sns`
- [x] HTTPS-only bucket policy (DenyNonHttps)
- [x] AWS Budgets: alert at 80% actual and 100% forecasted of $5/month

### Phase 5 — Deployment & Optimisation
- [x] `sam build && sam deploy` — single command deploy
- [x] `samconfig.toml` — saved deploy defaults (no `--guided` needed after first run)
- [x] DynamoDB TTL — automatic expiry of old records (cost optimisation)
- [x] CloudFront CDN — reduced S3 egress cost, HTTPS enforced
- [x] PAY_PER_REQUEST billing on all DynamoDB tables (Free Tier friendly)
- [x] Lambda 128 MB memory, 10s timeout (right-sized for capstone workload)

---

## Quick Start

```bash
# 1. Build
sam build

# 2. First deploy (interactive — enter your emails when prompted)
sam deploy --guided

# 3. Every deploy after that
sam deploy

# 4. Seed demo slots
cd backend/seed
python load_seed_data.py <SlotsTableName_from_output>

# 5. Upload frontend
aws s3 sync ../../frontend s3://<FrontendBucketName_from_output> --delete

# 6. Get the live URL
sam list stack-outputs --stack-name accra-hospital-capstone
```

## Local Development

```bash
# Install Node dependencies (TypeScript utils)
npm install

# Run Python unit tests
cd backend/seed && python -m unittest discover -v

# Local API simulation
sam local start-api --env-vars env.json
# curl http://localhost:3000/slots

# Test a single function
sam local invoke GetSlotsFunction --event events/get_slots_event.json
```

## GitHub Actions Secrets Required

| Secret                  | Description                                      |
|-------------------------|--------------------------------------------------|
| `AWS_ACCESS_KEY_ID`     | IAM user access key (or use OIDC role instead)   |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key                              |
| `AWS_ROLE_TO_ASSUME`    | IAM role ARN for OIDC (replaces key/secret)      |
| `BUDGET_ALERT_EMAIL`    | Email for AWS Budget and ops alarm notifications |
| `NOTIFICATION_EMAIL`    | Email for booking confirmation SNS topic         |
