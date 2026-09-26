# SuretySeven — Document Processing Service

A simplified document-processing pipeline: upload a document, process it
asynchronously, validate the extracted data, retry transient failures, detect
duplicates, and inspect status/history through a REST API and a web UI.

> The document-processing (OCR/AI) step is **mocked**, as allowed by the brief.
> Everything around it — async processing, validation, retry, dedup, history,
> observability, the API and the UI — is real.

---

## Quick start

### Option A — Docker (one command)

```bash
docker compose up --build
```

- Web UI:  http://localhost:8080
- API:     http://localhost:4000  (health: `GET /health`)
- Postgres: localhost:5432 (`postgres` / `postgres`, db `docpipeline`)

### Option B — run locally without Docker

Backend (defaults to zero-setup **SQLite**, no DB server needed):

```bash
cd backend
npm install
npm run build && npm start        # http://localhost:4000
# or: npm run dev                 # hot reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173 (proxies /api -> :4000)
```

### Run the tests

```bash
cd backend
npm test
```

12 tests cover every required scenario (valid upload, invalid extracted data,
successful processing, processor failure, failure-then-successful-retry,
duplicate upload) plus API-contract checks. They run on SQLite with scripted
processor outcomes, so they are fully deterministic.

---

## Demoing outcomes on purpose

The mock processor picks a random outcome by default (`FAILURE_RATE`, default
0.35). To **force** an outcome for a demo, put a keyword in the filename:

| Filename contains | Outcome |
|---|---|
| `success` | always PROCESSED |
| `timeout` | TIMEOUT (retried, then FAILED if it keeps timing out) |
| `error`   | ERROR (retried) |
| `invalid` | extraction returns invalid data → FAILED with validation errors |

---

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/documents` | Upload (multipart: `file`, `documentType`, optional `metadata` JSON). 201 new, 200 duplicate. |
| GET  | `/api/documents` | List. Filters: `status`, `documentType`, `search`; paginate `page`, `pageSize`. |
| GET  | `/api/documents/:id` | Single document + extracted result + validation errors. |
| GET  | `/api/documents/:id/history` | Processing lifecycle (status, attempt, reason, timestamp). |
| GET  | `/api/documents/stats` | Dashboard counts by status. |
| GET  | `/health` | Liveness. |

Status lifecycle: `UPLOADED → PROCESSING → PROCESSED` or `→ FAILED` (with retry
re-queueing back through `UPLOADED`).

---

## Project layout

```
backend/    Express + TypeScript API, worker, services, tests
frontend/   React + Vite + TypeScript UI
docs/       architecture.dot / architecture.png
docker-compose.yml
```

---

## Engineering questions

**Why this architecture?**
A single monolithic backend with an in-process background worker. The brief
explicitly allows a monolith, and for this scope it is the simplest thing that
is correct: no network hop between "API" and "processor", one deployable, easy
to run and reason about. The worker is decoupled from the request path (uploads
return immediately) but shares the process, which is the right trade-off until
throughput forces a split (see the 1M/day answer).

**Why this database?**
A relational store fits the domain: a `documents` row and an append-only
`document_history` table with a foreign key, queried by status/type with
pagination — all natural in SQL, and status transitions want transactional
integrity. I use **Postgres** for the graded/Docker run and **SQLite** for
local dev and tests, behind one **Knex** query-builder layer so the same code
path serves both. That keeps setup to zero locally while the real target is a
production-grade RDBMS.

**How does asynchronous processing work?**
`POST /documents` writes the row as `UPLOADED` and returns immediately. A worker
polls for the oldest `UPLOADED` row and **atomically claims it** — inside a DB
transaction it flips the row to `PROCESSING` conditional on it still being
`UPLOADED`, so two workers can never grab the same document. It then runs the
mock processor, validates, and writes the terminal state. Each transition is
recorded in `document_history`.

**How do retries work?**
Outcomes are classified: `TIMEOUT`/`ERROR` are **transient** and retried up to
`MAX_ATTEMPTS` (default 3) by re-queueing the row to `UPLOADED` (recording the
FAILED attempt in history first). `INVALID_RESULT` and validation failures are
**not** retried — they are data problems, not flakiness, so retrying would just
burn attempts. After the last transient failure the document is terminal
`FAILED` with the reason.

**How do you prevent duplicate processing?**
Two layers. (1) Upload dedup: a **SHA-256 content hash** of the bytes is unique-
indexed; an identical re-upload returns the existing document instead of a copy.
I chose a content hash over filename+size (too weak) or a client idempotency key
(relies on client behaviour). (2) Processing dedup: the atomic claim transaction
guarantees a document is processed by exactly one worker at a time.

**What if the app crashes during processing?**
A crash mid-processing leaves a row stuck in `PROCESSING`. Nothing is lost — the
document and its history are already persisted. The honest limitation today is
that such a row is not auto-recovered; a production version adds a **reaper**
that sweeps `PROCESSING` rows older than a visibility timeout back to `UPLOADED`
(exactly what SQS visibility timeouts give you for free). I note this in
Limitations rather than pretending it's handled.

**What would you change for 1M documents/day?**
~12 docs/sec average, with peaks. I would: (1) replace the in-process poller with
a real queue (**SQS**), producers on the API, a horizontally-scaled pool of
worker consumers; visibility timeout + DLQ replace my hand-rolled claim/retry.
(2) Stop storing files in the DB — put bytes in **S3**, keep only metadata in
Postgres. (3) Add read replicas / partition `document_history` by time. (4) Make
the processor idempotent keyed on document id so redeliveries are safe. The API
and data model stay largely the same; the worker and transport change.

**Biggest limitations of this implementation**
- Uploaded bytes are hashed but not persisted/stored (no S3); only metadata is kept.
- No crash-recovery reaper for rows stuck in `PROCESSING` (described above).
- In-process single-node worker — fine for this scope, not for high throughput.
- Auth is out of scope; the API is open.
- The processor is mocked; no real extraction.
