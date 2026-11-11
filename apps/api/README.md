# AgentIQ API

A run-history API backed by persistent SQLite storage, with optional authenticated GitHub Actions collection.

## Run locally

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`; API: `http://127.0.0.1:8787`.

SQLite data defaults to `./data/agentiq.sqlite`. Set `AGENTIQ_DB_PATH` to change the path.

## Endpoints

- `GET /api/health` — status and storage mode.
- `GET /api/runs?limit=20&offset=0` — paginated history.
- `GET /api/runs?repository=owner/repo` — repository filter.
- `GET /api/runs/:id` — stored run, evidence, and evaluation.
- `POST /api/ingest/github` — collect recent workflow runs and jobs from the configured GitHub repository.
- `POST /api/decisions` — submit a state and named questions to Hanzo Decisions using the server-side `HANZO_API_KEY`.

## Live GitHub collection

Set these environment variables before starting the API:

- `AGENTIQ_GITHUB_REPOSITORY=owner/repo`
- `GITHUB_TOKEN=...` — token with read-only repository metadata and Actions permissions.
- `AGENTIQ_INGEST_TOKEN=...` — long random secret required as a Bearer token for ingestion.
- `AGENTIQ_DB_PATH=./data/agentiq.sqlite` (optional)
- `AGENTIQ_DEMO=false` (optional; prevents demo rows being seeded into an empty database)

Then call:

```bash
curl -X POST http://127.0.0.1:8787/api/ingest/github \
  -H "Authorization: Bearer $AGENTIQ_INGEST_TOKEN"
```

The collector stores workflow-run and job evidence, normalizes each run, and computes deterministic evaluations. GitHub does not provide universal test counts or code-diff details for every workflow; these remain unknown/zero unless corresponding evidence is provided separately. Agent identity is not guessed.

## Hanzo Decisions

Set `HANZO_API_KEY` in the API server environment. The key is read only on the server and must never be exposed to the browser or committed to source control.

Send a decision request to `POST /api/decisions` with a JSON body containing `state` and `questions`. The optional `model` defaults to `kai`. For example:

```bash
curl -X POST http://127.0.0.1:8787/api/decisions \
  -H "Content-Type: application/json" \
  -d '{"model":"kai","state":{"customer":"Acme Corp","plan":"Enterprise","message":"502 errors since 14:00 UTC"},"questions":{"team":{"type":"choice","instructions":"Which team should be alerted?","criteria":{"infrastructure":"network, gateway, latency, outages, 502/504 errors","billing":"invoices, payment methods, credit card charges","developer_support":"SDK usage, documentation questions, sample code"}},"critical":{"type":"noul","instructions":"Is this issue critical enough to page on-call engineers?"}}}'
```

The API returns Hanzo's typed `answers` and `routing.checkpoint` unchanged. HTTP `402` and `429` refusal statuses are preserved, including `error.code` and `error.actions` when supplied. Requests are limited to 64 KB. The API key is never returned in responses.

## Persistence and safety

SQLite survives API restarts. Repeated collection is idempotent for a run with unchanged evidence; conflicting evidence for an existing run ID is rejected. The API binds to loopback by default, and ingestion requires a separate secret. Do not expose it publicly without TLS, read-endpoint authentication, rate limits, and backups. Never commit tokens to source control.
