# Run History and Storage

AgentIQ keeps persistence behind a small storage interface so evaluation stays independent of a database vendor.

A stored record contains the normalized AgentRun, canonical EvidenceBundle, derived EvaluationReport, and a storage timestamp.

AgentRunStore exposes save, get, list, and count. The initial InMemoryAgentRunStore is useful for local development and API prototyping.

Saving is idempotent by run ID. Re-saving identical evidence is a no-op; reusing a run ID with different evidence fails instead of silently overwriting history. This prevents duplicate GitHub workflow ingestion from inflating analytics.

A future PostgreSQL or SQLite adapter can implement the same interface without changing collectors, normalization, scoring, or the dashboard contract.
