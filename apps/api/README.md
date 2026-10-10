# AgentIQ API

A small, read-only HTTP API over the canonical AgentIQ run-history store.

## Run locally

From the repository root:

```bash
npm install
npm run api:dev
```

The API listens on `http://127.0.0.1:8787` by default. Override `PORT` or `HOST` with environment variables.

## Endpoints

- `GET /api/health` — service status.
- `GET /api/runs?limit=20&offset=0` — paginated run history.
- `GET /api/runs?repository=owner/repo` — filter by repository.
- `GET /api/runs/:id` — full run, evidence bundle, evaluation report, and history row.

Pagination limits are validated: `limit` must be 1–100 and `offset` must be a non-negative integer. Errors use a consistent `{ error: { code, message } }` shape.

## Current limitation

The API seeds three **demo records** so the frontend works immediately. It uses `InMemoryAgentRunStore`, so records disappear when the process restarts. The list response explicitly marks its mode as `demo`. This is not production persistence and does not yet ingest live GitHub events. The existing `AgentRunStore` interface is the seam for adding SQLite/PostgreSQL and real ingestion without changing the API contract.

The API is read-only, accepts GET requests only, and binds to loopback by default. Do not expose it publicly without adding authentication, rate limits, and a production storage adapter.
