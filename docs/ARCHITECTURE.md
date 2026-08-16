# AccraCare — File & Folder Reference

This document provides a detailed per-file breakdown of the repository. It is referenced from the main `README.md` so the top-level documentation stays scannable.

---

## Root-level configuration

| Path                | Purpose                                                                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `template.yaml`     | **The heart of the infrastructure.** SAM/CloudFormation template defining all AWS resources: API Gateway, 5 DynamoDB tables, 17 Lambda functions, SNS topics, S3 bucket, CloudFront distribution, CloudWatch alarms/dashboard, and AWS Budgets. `sam deploy` reads this. |
| `samconfig.toml`    | Saved defaults for `sam deploy` so you don't need the `--guided` interactive prompts after the first run. Stores stack name, region, and parameter overrides.                                                                                                            |
| `package.json`      | Root Node.js project manifest. Defines scripts (`build`, `lint`, `format`, `test`, `sam:build`, `sam:validate`) and shared dev dependencies (TypeScript, ESLint, Prettier, Jest, esbuild).                                                                               |
| `package-lock.json` | Locks the exact versions of all npm dependencies for reproducible installs.                                                                                                                                                                                              |
| `tsconfig.json`     | Root TypeScript compiler config. Compiles `backend/src/**` to the `dist/` folder using `module: ES2022` and `moduleResolution: Bundler`.                                                                                                                                 |
| `.gitignore`        | Files/folders Git should ignore: `node_modules`, `.venv`, `dist/`, `.aws-sam/`, `__pycache__/`, and the accidental nested `AccraCare/` repo.                                                                                                                             |
| `.eslintrc.json`    | ESLint configuration for the TypeScript handlers (using `@typescript-eslint`). Enforces no unused imports and warns on `console` usage.                                                                                                                                  |
| `.eslintignore`     | Files ESLint should skip: `node_modules`, `dist`, `.venv`, `.aws-sam`, `coverage`.                                                                                                                                                                                       |
| `.prettierrc.json`  | Prettier code-formatter settings (100-char width, single quotes, trailing commas, 2-space tabs).                                                                                                                                                                         |
| `.prettierignore`   | Files Prettier should skip: `node_modules`, `dist`, `.venv`, `.aws-sam`, `coverage`.                                                                                                                                                                                     |
| `setup.cfg`         | Flake8 and Pylint (Python linters) configuration. Tells them to ignore virtual envs and build folders.                                                                                                                                                                   |
| `README.md`         | Main project documentation.                                                                                                                                                                                                                                              |

---

## `.github/workflows/`

| Path                           | Purpose                                                                                                                                                                                                                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/deploy.yml` | **CI/CD pipeline** triggered on every push to `main`. Runs 4 jobs in sequence: (1) Python unit tests, (2) `sam validate --lint` + `sam build` + `sam deploy` and captures stack outputs, (3) seeds DynamoDB with demo slots, (4) injects the real API URL into the frontend, syncs it to S3, and invalidates the CloudFront cache. |

---

## `frontend/` — static website (S3 + CloudFront)

| Path                                     | Purpose                                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/index.html`                    | **Patient portal** — the public-facing page. Lets patients browse, search, and filter available appointment slots, and book them via a modal.                                                                                                                                                   |
| `frontend/admin.html`                    | **Staff/admin portal** — reachable at `/admin.html`. Has a mock login, a form to publish new slots, slot capacity toggles, and a patient bookings registry table.                                                                                                                               |
| `frontend/scripts/api.js`                | **Data-access layer.** All frontend-to-backend API calls live here (`fetchSlots`, `createSlot`, `bookSlot`, `fetchBookings`, `updateSlotStatus`). Contains the `API_BASE_URL` logic — CI injects the real URL at deploy time; otherwise it falls back to `http://127.0.0.1:3001` for local dev. |
| `frontend/scripts/app.js`                | Entry point for `index.html`. Wires up the slot catalog and booking modal.                                                                                                                                                                                                                      |
| `frontend/scripts/slots.js`              | Renders the slot cards, handles search/filtering by hospital, department, and availability.                                                                                                                                                                                                     |
| `frontend/scripts/booking.js`            | Manages the booking modal: form validation, Ghana phone-number checks, success receipts, and genuine slot-capacity errors. Also generates `.ics` calendar downloads.                                                                                                                            |
| `frontend/scripts/admin.js`              | Powers the admin portal: mock staff login, create-slot form, slot status toggles, and the bookings table.                                                                                                                                                                                       |
| `frontend/styles/base.css`               | Design tokens (colors, fonts), CSS reset, and typography. Uses a terracotta accent on a warm off-white palette.                                                                                                                                                                                 |
| `frontend/styles/layout.css`             | Page layout styles (header, hero, catalog sections, footer).                                                                                                                                                                                                                                    |
| `frontend/styles/components.css`         | Reusable component styles (buttons, badges, cards, modal, forms, tables).                                                                                                                                                                                                                       |
| `frontend/assets/accra_patient_hero.jpg` | Hero image displayed on the patient portal.                                                                                                                                                                                                                                                     |

---

## `backend/src/` — TypeScript Lambda handlers (deployed)

> These Node.js 22 handlers are built with **esbuild** and deployed via SAM. Each file maps to one Lambda function.

| Path                                             | HTTP Endpoint                  | Purpose                                                                                                                                                                                |
| ------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/handlers/health.ts`                 | `GET /health`                  | Simple health check returning `{ status: "ok" }`.                                                                                                                                      |
| `backend/src/handlers/status.ts`                 | `GET /status`                  | Returns service metadata (name, version, uptime).                                                                                                                                      |
| `backend/src/handlers/getSlots.ts`               | `GET /slots`                   | Lists all appointment slots (paginated scan, newest first).                                                                                                                            |
| `backend/src/handlers/createSlot.ts`             | `POST /slots`                  | Creates a new slot. Zod-validates input, generates a `slot-acc-*` ID.                                                                                                                  |
| `backend/src/handlers/bookSlot.ts`               | `POST /slots/{slotId}/book`    | **Core booking logic.** Atomically decrements `availableSeats` using a DynamoDB conditional write to prevent double-booking, then creates a booking and publishes an SNS confirmation. |
| `backend/src/handlers/updateSlotStatus.ts`       | `PATCH /slots/{slotId}/status` | Opens/closes a slot (sets `status` to `available`/`full`). Used by the admin portal.                                                                                                   |
| `backend/src/handlers/getBookings.ts`            | `GET /bookings`                | Lists bookings, optionally filtered by `?slotId=` (uses the `slotId-index` GSI).                                                                                                       |
| `backend/src/handlers/listDoctors.ts`            | `GET /doctors`                 | Lists all doctors.                                                                                                                                                                     |
| `backend/src/handlers/createDoctor.ts`           | `POST /doctors`                | Creates a doctor record.                                                                                                                                                               |
| `backend/src/handlers/listAppointments.ts`       | `GET /appointments`            | Lists all appointments.                                                                                                                                                                |
| `backend/src/handlers/createAppointment.ts`      | `POST /appointments`           | Creates an appointment (30-day TTL).                                                                                                                                                   |
| `backend/src/handlers/getAppointmentsByEmail.ts` | `GET /appointments/{id}`       | Queries appointments by patient email via the `patientEmail-index` GSI.                                                                                                                |
| `backend/src/handlers/deleteAppointment.ts`      | `DELETE /appointments/{id}`    | Deletes an appointment.                                                                                                                                                                |
| `backend/src/utils/dynamo.ts`                    | —                              | Shared DynamoDB client (with options to ignore undefined values).                                                                                                                      |
| `backend/src/utils/response.ts`                  | —                              | Shared response helpers (`jsonResponse`, `errorResponse`) that add CORS + security headers to every response.                                                                          |
| `backend/src/package.json`                       | —                              | Dependencies for the Lambda runtime (AWS SDK, zod, uuid, esbuild).                                                                                                                     |
| `backend/src/tsconfig.json`                      | —                              | TypeScript config for the Lambda build (CommonJS, outputs to `dist/`).                                                                                                                 |

---

## `backend/lambdas/` — Python 3.12 Lambda handlers (deployed)

| Path                                       | HTTP Endpoint                    | Purpose                                                                                                  |
| ------------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `backend/lambdas/get_bookings_by_email.py` | `GET /bookings/by-email/{email}` | Returns all bookings for a patient email using the `patientEmail-index` GSI. Validates the email format. |
| `backend/lambdas/delete_booking.py`        | `DELETE /bookings/{id}`          | Cancels a booking. Validates the ID, checks it exists, then deletes with a conditional write.            |
| `backend/lambdas/get_my_bookings.py`       | `POST /bookings/lookup`          | Patient self-service: looks up bookings by email (no admin key required).                                |
| `backend/lambdas/cancel_my_booking.py`     | `POST /bookings/cancel`          | Patient self-service: cancels a booking (no admin key required).                                         |

---

## `backend/local_handlers/` — Python handlers for local dev only

> These are **not deployed** to AWS. They exist so the local dev server (`local_api.py`) can simulate the API without needing the TypeScript build. They mirror the slots/bookings TypeScript handlers.

| Path                                           | Simulated Endpoint             | Purpose                                              |
| ---------------------------------------------- | ------------------------------ | ---------------------------------------------------- |
| `backend/local_handlers/get_slots.py`          | `GET /slots`                   | Lists slots (mirrors `getSlots.ts`).                 |
| `backend/local_handlers/create_slot.py`        | `POST /slots`                  | Creates a slot (mirrors `createSlot.ts`).            |
| `backend/local_handlers/book_slot.py`          | `POST /slots/{slotId}/book`    | Books a slot (mirrors `bookSlot.ts`).                |
| `backend/local_handlers/get_bookings.py`       | `GET /bookings`                | Lists bookings (mirrors `getBookings.ts`).           |
| `backend/local_handlers/update_slot_status.py` | `PATCH /slots/{slotId}/status` | Toggles slot status (mirrors `updateSlotStatus.ts`). |

---

## `backend/local_api.py`

A lightweight local HTTP server (runs on `http://127.0.0.1:3001`) that loads the `local_handlers` directly. It lets you develop and test the frontend end-to-end without deploying to AWS. Start it with:

```bash
python backend/local_api.py --port 3001
```

The patient bookings registry is an admin-only view. Start the local API with
an admin key, then enter that same value as the staff dashboard password:

```bash
python backend/local_api.py --port 3001 --admin-api-key "your-local-admin-key"
```

Alternatively, set `ADMIN_API_KEY` in your shell before starting the server.
Do not commit an API key to `backend/env.json` or the frontend.

---

## `backend/env.json`

Local environment variables for `sam local invoke` and `sam local start-api`. It maps each function to its DynamoDB table names and region so handlers can run locally without deploying.

---

## `backend/seed/` — seed data and tests

| Path                                   | Purpose                                                                                                               |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `backend/seed/seed_slots.json`         | Demo data: 6 realistic appointment slots across Accra hospitals (Korle Bu, 37 Military, Ridge, Trust, Nyaho, Lister). |
| `backend/seed/load_seed_data.py`       | Script that loads `seed_slots.json` into the deployed `SlotsTable`. Run after deploy.                                 |
| `backend/seed/test_load_seed_data.py`  | Unit tests for the seed loader.                                                                                       |
| `backend/seed/test_config_defaults.py` | Unit tests for config defaults (region, template).                                                                    |

---

## `backend/events/` — sample Lambda events for local testing

Used with `sam local invoke <FunctionName> --event backend/events/<file>.json` to test a single handler without a live API call.

| Path                                     | Target function       |
| ---------------------------------------- | --------------------- |
| `backend/events/get_slots_event.json`    | `GetSlotsFunction`    |
| `backend/events/create_slot_event.json`  | `CreateSlotFunction`  |
| `backend/events/book_slot_event.json`    | `BookSlotFunction`    |
| `backend/events/get_bookings_event.json` | `GetBookingsFunction` |