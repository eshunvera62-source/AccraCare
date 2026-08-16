# AccraCare — Serverless Hospital Appointment Booking System

Capstone project for the Generation Ghana / Azubi Africa AWS Cloud Computing Programme.

AccraCare replaces manual appointment booking (paper forms / spreadsheets) with a
scalable serverless REST API backed entirely by AWS managed services, deployed
with AWS SAM (CloudFormation).

**🔗 Live Demo:** https://dvm40sl310hkp.cloudfront.net

---

## Table of Contents

- [AccraCare — Serverless Hospital Appointment Booking System](#accracare--serverless-hospital-appointment-booking-system)
  - [Table of Contents](#table-of-contents)
  - [Tech Stack](#tech-stack)
  - [Quick Start](#quick-start)
  - [Problem Statement](#problem-statement)
  - [Architecture](#architecture)
  - [Screenshots](#screenshots)
    - [Architecture diagram](#architecture-diagram)
    - [Cloudformation stack](#cloudformation-stack)
    - [SNS](#sns)
    - [Homepage or frontend ui](#homepage-or-frontend-ui)
    - [Book Appointment](#book-appointment)
    - [Dynamo db slots](#dynamo-db-slots)
    - [Lambda delete booking](#lambda-delete-booking)
    - [Cloudwatch lambda logs](#cloudwatch-lambda-logs)

---

## Tech Stack

- **Node.js 22** — TypeScript Lambda handlers (deployed)
- **Python 3.12** — Python Lambda handlers (deployed)
- **AWS Lambda** — serverless compute
- **API Gateway** — REST API with CORS, throttling, access logging
- **DynamoDB** — NoSQL database with GSIs, TTL, PITR, SSE-KMS
- **S3** — static frontend hosting (SSE-S3 encrypted, versioned)
- **CloudFront** — CDN with HTTPS enforcement
- **SNS** — email confirmations and operational alerts
- **CloudWatch** — logs, alarms, dashboard
- **AWS SAM / CloudFormation** — infrastructure as code
- **GitHub Actions** — CI/CD pipeline

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

---

## Problem Statement

Outpatient clinics in Accra manage appointment bookings manually — patients queue,
staff use spreadsheets, and there is no real-time seat availability. AccraCare
replaces this with a self-service web portal and a REST API that enforces seat
limits, prevents double-booking via atomic DynamoDB conditional writes, and sends
confirmation emails automatically via SNS.

---

## Architecture

![AccraCare architecture](docs/screenshots/AccraCare%20architecture.png)

The stack is a mix of **Node.js 22 (TypeScript)** and **Python 3.12** Lambda handlers — one function per endpoint — deployed as a single CloudFormation stack defined in `template.yaml`.

---

## Screenshots

### Architecture diagram

**AccraCare architecture**
![AccraCare architecture](docs/screenshots/AccraCare%20architecture.png)

### Cloudformation stack

**Cloudformation stack**
![Cloudformation stack](docs/screenshots/CloudFormation-stack%20.png)

### SNS

**SNS**
![SNS](docs/screenshots/SNS%202.png)

### Homepage or frontend ui

**Homepage or frontend ui**
![Homepage or frontend ui](docs/screenshots/Homepage/Frontend%20UI.png)

### Book Appointment

**Book Appointment**
![Book Appointment](docs/screenshots/Book%20Appointment%20UI.png)

### Dynamo db slots

**Dynamo db slots**
![Dynamo db slots](docs/screenshots/Dynamodb-slots%20table.png)

### Lambda delete booking

**Lambda delete booking**
![Lambda delete booking](docs/screenshots/Lambda-delete-booking.png)

### Cloudwatch lambda logs

**Cloudwatch lambda logs**
![Cloudwatch lambda logs](docs/screenshots/CloudWatch-logs%20.png)
