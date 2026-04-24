# Technical Requirement Document (TRD)

## 1. Objective

Build a Time-Off microservice that:

- Manages time-off request lifecycle
- Preserves local balance integrity per `employeeId + locationId`
- Synchronizes balances with an external HCM
- Handles concurrent and out-of-sync scenarios defensively

## 2. Context and Constraints

- ReadyOn is not the source of truth for employment data
- HCM can update balances independently (anniversary, yearly refresh)
- HCM offers:
  - Realtime API for single balance validation/sync
  - Batch endpoint for full balance corpus updates
- HCM may return validation errors, but microservice must also self-defend
- Stack requirement: NestJS + SQLite

## 3. Functional Requirements

### 3.1 Time-Off Requests

- Create request with employee, location, period, and requested days
- Enforce basic validation and idempotent creation support
- Approve request by manager
- Reject request by manager
- Retrieve single request and list requests by filters

### 3.2 Balances

- Store local balance projection per employee/location
- Return current balance by employee/location
- Return balances for an employee
- Keep balance audit events for every mutation

### 3.3 HCM Synchronization

- Inbound realtime balance upsert endpoint
- Inbound batch balance upsert endpoint
- Reconciliation endpoint that fetches balance from HCM API and upserts locally

### 3.4 Defensive Approval Flow

On approval:

1. Check local balance first (fast feedback)
2. Call HCM `validate-and-deduct`
3. If HCM accepts, commit local deduction and mark request approved in a transaction
4. If HCM rejects, mark request rejected and keep local balance unchanged
5. If HCM unavailable, return temporary failure without corrupting local state

## 4. Non-Functional Requirements

- Data consistency over raw throughput
- Clear failure semantics (409 for business conflict, 503 for upstream outage)
- Auditability of balance mutations
- Regression-safe test suite with mock HCM behavior

## 5. Data Model

### 5.1 `balances`

- `id` (uuid)
- `employeeId` (string)
- `locationId` (string)
- `availableDays` (float)
- `lastSyncedAt` (datetime)
- `createdAt`, `updatedAt`
- Unique constraint: (`employeeId`, `locationId`)

### 5.2 `time_off_requests`

- `id` (uuid)
- `employeeId`, `locationId`
- `startDate`, `endDate`
- `daysRequested` (float)
- `status` (`SUBMITTED`, `APPROVED`, `REJECTED`)
- `reason`, `managerId`, `rejectionReason`, `hcmReference`
- `idempotencyKey` (nullable unique)
- `decidedAt`, `createdAt`, `updatedAt`

### 5.3 `balance_audits`

- `id` (uuid)
- `employeeId`, `locationId`
- `source` (`HCM_REALTIME`, `HCM_BATCH`, `HCM_RECONCILIATION`, `TIME_OFF_APPROVED`)
- `delta`, `resultingBalance`, `requestId`
- `metadata` (json)
- `createdAt`

## 6. API Design

Base URL: `/api/v1`

- `POST /time-off/requests`
- `GET /time-off/requests`
- `GET /time-off/requests/:id`
- `POST /time-off/requests/:id/approve`
- `POST /time-off/requests/:id/reject`
- `GET /balances/:employeeId/:locationId`
- `GET /balances/employee/:employeeId`
- `POST /hcm/sync/realtime`
- `POST /hcm/sync/batch`
- `POST /hcm/sync/reconcile/:employeeId/:locationId`
- `GET /health`

## 7. Consistency Strategy

- Local DB transaction is used for approved request state mutation and local balance deduction
- Approval depends on both local and HCM validation
- HCM validation errors are treated as business conflicts
- Upstream unavailability is surfaced as temporary service failure

Tradeoff:
- This design is strongly defensive for correctness and simplicity in a take-home context
- Full distributed transaction guarantees are not possible with this architecture
- In production, an outbox/event-driven reconciliation strategy should be added for stronger eventual consistency guarantees

## 8. Security Considerations

- DTO validation with whitelist and forbidden unknown fields
- Strict input constraints on IDs, days, and strings
- No trust on client-side balance; server-side checks only
- Upstream timeout control for HCM client
- Internal audit trail for traceability and incident analysis

Recommended production hardening (not fully implemented here):

- Service-to-service authentication (mTLS or signed tokens)
- Rate limiting on sync endpoints
- Structured audit logs to SIEM
- Secret management via vault or cloud secret store

## 9. Alternatives Considered

### Alternative A: Approve only with local balance, sync asynchronously later

Pros:
- Fast approvals

Cons:
- High drift risk between ReadyOn and HCM
- Manager approvals may be wrong in real time

Decision: Rejected.

### Alternative B: Reserve in local DB first, then confirm with HCM later

Pros:
- Better local throughput

Cons:
- Requires robust compensation/orchestration
- More complex state machine for reservations and rollbacks

Decision: Rejected for this scope.

### Alternative C (Implemented): Validate with HCM during approval and commit local transaction after success

Pros:
- Strong correctness for approval decision
- Simple and auditable

Cons:
- Approval path depends on HCM availability

Decision: Accepted as best fit for this assignment.

## 10. Test Strategy

### Unit

- Controller and service-level behavior checks
- Validation and branch coverage for lifecycle logic

### E2E

- Full request lifecycle with real Nest app and SQLite in-memory DB
- In-process mock HCM server with business logic:
  - Accept/deduct
  - Insufficient balance
  - Invalid dimensions
  - Reconciliation lookup

### Coverage Evidence

- E2E-instrumented coverage measured at:
  - Statements: `85.71%`
  - Branches: `68.84%`
  - Functions: `81.13%`
  - Lines: `84.8%`

## 11. Future Improvements

- Add asynchronous outbox + worker for resilient HCM retry
- Add optimistic locking versioning for balances
- Add pagination and cursor-based queries for large request history
- Add OpenAPI docs and contract tests
- Add role-based access control for manager actions
