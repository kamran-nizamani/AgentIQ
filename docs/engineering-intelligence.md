# AgentIQ Engineering Intelligence

The Repositories page is the repository inspector. The **Intelligence** page adds multi-repository health comparison, recent CI failure context, pull-request review prompts, Dependabot alert visibility, and human-reviewed remediation plans.

## API

`GET /api/intelligence?repo=owner/repository&repo=https%3A%2F%2Fgithub.com%2Fowner%2Fother`

- Accepts up to five repository identifiers per request.
- Accepts `owner/repository` and HTTPS GitHub repository URLs only.
- Uses public GitHub API data by default. A server-side `GITHUB_TOKEN` can raise rate limits and allow data the token is permitted to access.
- Per-repository failures are returned individually so one inaccessible repository does not discard the other results.
- Optional GitHub endpoints are marked unavailable rather than being interpreted as zero findings.

## Repository health score

The score is a **heuristic triage aid**, not a certification. It renormalizes the weights across components for which evidence is available:

| Component | Weight | Evidence |
| --- | ---: | --- |
| CI reliability | 30% | Success rate among completed runs in the recent Actions sample |
| Dependency security | 25% | Open Dependabot alerts exposed by GitHub |
| Maintenance | 20% | Last push age and archived status |
| Project hygiene | 15% | README, license, and root test-folder signals |
| PR hygiene | 10% | Open PR sample and age of last update |

The API returns both the score and coverage. A score with low coverage should not be compared as if it had complete evidence. The current test-folder signal checks the root contents only and can miss tests in nested folders.

## CI failure intelligence

The API returns recent failed workflow runs and attempts to load job summaries for a small subset. Job and failed-step names are shown when GitHub exposes them. This is not full log-based root-cause analysis; unavailable logs or job details remain unknown.

## Pull-request review assistant

Every sampled open PR is reviewed with conservative prompts based on changed paths, available diff metadata, dependency files, workflow edits, and change size. If model access is configured, an optional OpenAI-compatible chat-completions request reviews a bounded diff and supplements the heuristics.

Optional server-side environment variables:

- `AGENTIQ_AI_API_KEY`: API key for an OpenAI-compatible endpoint. If absent, the feature uses deterministic heuristics only.
- `AGENTIQ_AI_BASE_URL`: optional API base URL; defaults to `https://api.openai.com/v1`.
- `AGENTIQ_AI_MODEL`: optional model identifier; defaults to `gpt-4.1-mini`.

The API key is used only on the server and is never sent to the browser. Model output is treated as advisory, schema-checked, bounded, and falls back to heuristics on errors. Repository diffs are untrusted input; findings must be verified by a developer. No tests are claimed to have run by the review assistant.

## Security and remediation boundary

Dependabot alerts are shown only if GitHub returns them to the current connection. An unavailable alerts endpoint is **not** proof that a repository has no vulnerabilities. The feature does not execute repository code, change files, push branches, create pull requests, or merge changes. “Build fix plan” creates a checklist for a developer to follow and approve.

Before expanding to automated patch application, AgentIQ needs an isolated execution environment, strict network and credential controls, test-result ingestion, patch validation, and explicit human approval before any write operation.
