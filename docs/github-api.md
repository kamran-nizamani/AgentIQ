# GitHub API Collector

AgentIQ now includes a concrete, provider-bound GitHub REST collector.

## Design

`GitHubApiCollector` implements the provider-neutral `GitHubCollector` interface. It converts GitHub REST responses into the existing canonical snapshot types; the evidence layer remains responsible for turning those snapshots into AgentIQ evidence.

```
GitHub REST API
      │
      ▼
GitHubApiCollector
      │
      ▼
GitHub snapshots
      │
      ▼
collectGitHubEvidence()
      │
      ▼
Canonical EvidenceBundle
```

## Authentication

A token is optional for public repositories:

```ts
const collector = new GitHubApiCollector("owner/repo", {
  token: process.env.GITHUB_TOKEN,
});

const bundle = await collectGitHubEvidence(collector);
```

The token is only sent in the HTTP Authorization header. It is never placed in evidence.

## Supported resources

- Repository metadata
- Commit history
- Pull requests
- Pagination through GitHub's `Link` header
- Structured HTTP/API errors

The collector intentionally does not score data and does not contain LLM logic.

## Limits

The GitHub API collector is read-only. It does not create branches, commits, comments, reviews, or merges.

## Testing

The test suite injects a fake `fetch` implementation, so API behavior can be tested without network access or real credentials.
