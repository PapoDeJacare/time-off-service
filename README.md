# Time-Off Microservice

Time-Off microservice built with NestJS and SQLite for handling request lifecycle and keeping balances synchronized with an external HCM.

Repository: https://github.com/PapoDeJacare/time-off-service

The service is written in TypeScript and runs on Node.js (JavaScript runtime).

## Scope

- Manage employee time-off requests (`SUBMITTED`, `APPROVED`, `REJECTED`)
- Maintain local balance integrity per `employeeId + locationId`
- Sync balances from HCM via realtime and batch inbound endpoints
- Defensively validate approvals with outbound HCM call
- Keep audit trail for balance changes

## Architecture (High Level)

- `time-off` module
  - Creates requests
  - Approves/rejects requests
  - Calls HCM during approval
  - Deducts local balance in transaction when approval succeeds
- `balances` module
  - Stores canonical local projection of balances
  - Supports HCM upserts (realtime/batch)
  - Stores audit records for all balance mutations
- `hcm` module
  - Inbound sync endpoints from HCM
  - Outbound client for HCM validation and reconciliation

## API Endpoints

Base path: `/api/v1`

- `GET /health`
- `GET /balances/:employeeId/:locationId`
- `GET /balances/employee/:employeeId`
- `POST /hcm/sync/realtime`
- `POST /hcm/sync/batch`
- `POST /hcm/sync/reconcile/:employeeId/:locationId`
- `POST /time-off/requests`
- `GET /time-off/requests`
- `GET /time-off/requests/:id`
- `POST /time-off/requests/:id/approve`
- `POST /time-off/requests/:id/reject`

## Local Setup

1. Install dependencies

```bash
npm install
```

2. Configure environment

```bash
cp .env.example .env
```

3. Start in dev mode

```bash
npm run start:dev
```

## Environment Variables

- `PORT` (default: `3000`)
- `DB_PATH` (default: `data/timeoff.sqlite`)
- `DB_SYNCHRONIZE` (default: `true`)
- `HCM_BASE_URL` (default: `http://127.0.0.1:4001`)
- `HCM_TIMEOUT_MS` (default: `3000`)

## Test Suite

### Run tests

```bash
npm run test
npm run test:e2e
```

### Coverage (unit + e2e)

```bash
npm run test:cov
```

Coverage scripts:

- `test:cov:unit` -> unit coverage
- `test:cov:e2e` -> e2e-instrumented coverage over `src/**`

Latest measured e2e-instrumented coverage:

- Statements: `85.71%`
- Branches: `68.84%`
- Functions: `81.13%`
- Lines: `84.8%`

## Mock HCM in Tests

The e2e suite includes an in-process mock HCM server in `test/time-off.e2e-spec.ts` with basic business behavior:

- Validate and deduct endpoint
- Insufficient balance response
- Invalid dimension response
- Balance lookup used for reconciliation

This simulates independent HCM balance changes and validates defensive behavior in the microservice.

## Technical Document

See `TRD.md` for the detailed technical requirement and design analysis.
