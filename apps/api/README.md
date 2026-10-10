# AgentIQ API

A run-history API backed by persistent SQLite storage, with optional authenticated GitHub Actions collection.

## Run locally

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`; API: `http://127.0.0.1:8787`.

SQLite data defaults to `./data/agentiq.sqlite`. Set `AGENTIQ_DB_PATH` to change the path. The API creates the parent directory if needed.

## Endpoints

- `GET /api/health` — status and storage mode.
- `GET /api/runs?limit=20&offset=0` — paginated history.
- `GET /api/runs?repository=owner/repo` — repository filter.
- `GET /api/runs/:id` — stored run, evidence, and evaluation.
- `POST /api/ingest/github` — collect recent workflow runs and jobs from the configured GitHub repository.

## Live GitHub collection

Set these environment variables before starting the API:

- `AGENTIQ_GITHUB_REPOSITORY=owner/repo`
- `GITHUB_TOKEN=...` — token with read-only repository metadata and Actions permissions.
- `AGENTIQ_INGEST_TOKEN=...` — long random secret required as a Bearer token for ingestion.
- `AGENTIQ_DB_PATH=./data/agentiq.sqlite` (optional)
- `AGENTIQ_DEMO=false` (optional; prevents demo rows being seeded into an empty database)

Then run:

```bash
curl -X POST http://127.0.0.1:8787/api/ingest/github \
  -H "Authorization: Bearer $AGENTIQ_INGEST_TOKEN"
```

The collector stores workflow-run and job evidence, normalizes each run, and computes deterministic evaluations. GitHub does not provide universal test counts or code-diff details for every workflow; these remain unknown/zero unless corresponding evidence is provided separately. Agent identity is not guessed.

## Persistence and safety

SQLite survives API restarts. Repeated collection is idempotent for a run with unchanged evidence; conflicting evidence for an existing run ID is rejected. The API binds to loopback by default, and ingestion requires a separate secret. Do not expose it publicly without TLS, read-endpoint authentication, rate limits, and backups. Never commit tokens to source control.
