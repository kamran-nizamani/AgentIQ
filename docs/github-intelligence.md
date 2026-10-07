# Phase 2 — GitHub Intelligence
GitHub is an evidence provider, not the evaluator.
Collected signals: repository identity, default branch, commit SHA/message/author, PR state, merge status, base/head relationship, additions, deletions, changed-file count, and review decision.
Architecture: GitHub API -> normalized Evidence -> EvidenceBundle -> AgentRun -> deterministic evaluator.
Provider-specific fields remain inside Evidence.data. The evaluator never calls GitHub directly.
Security: tokens, installation credentials, and authorization headers must never enter persisted evidence.
