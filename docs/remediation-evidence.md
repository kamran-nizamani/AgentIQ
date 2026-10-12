# Remediation diff evidence and persistent review

AgentIQ's Engineering Intelligence view can open the actual changed-file patches for a pull request, identify test-like paths, display workflow runs tied to the reviewed head commit, generate deterministic evidence-derived review proposals, and record an approval/rejection audit entry as a GitHub pull-request comment.

## Server configuration

Set these environment variables on the server/Vercel project (never in VITE_* variables or browser code):

- **GITHUB_TOKEN**: a fine-grained GitHub token with repository Pull requests: read and Actions: read access for the repositories you inspect. To persist audit entries, it also needs Issues: write (pull requests use GitHub's issue-comment API).
- **AGENTIQ_REMEDIATION_AUDIT_TOKEN**: a separate high-entropy secret required to authorize review writes. Do not reuse the GitHub token. Keep it in the server environment and provide it only to authorized reviewers when recording a decision.

After changing environment variables, redeploy the Vercel project. If the audit token is not configured, diff evidence can still be read, but recording decisions returns an authorization error.

## What is recorded

The endpoint stores decisions as comments on the source pull request. Each comment includes the proposal ID, decision, repository/PR, exact reviewed head SHA, checklist state, timestamp, operator note, and a safety-boundary statement. The audit panel reads those comments back from GitHub so history survives page reloads and browsers.

The UI does not independently authenticate the operator's identity. The GitHub comment author is the account represented by GITHUB_TOKEN; the audit comment explicitly says the dashboard operator's identity was not independently verified. Use this only in a trusted internal workflow until AgentIQ has a proper authenticated identity layer.

## Safety boundaries

- Diffs and CI states are read from GitHub; unavailable patch text or missing matching workflow runs are shown as unknown.
- CI evidence is matched to the exact PR head SHA so results from a different commit are not presented as current.
- Approval requires all four safety checks. A rejection can be recorded with partial checks.
- The API rejects approvals if the PR head SHA changed after evidence was loaded.
- Recording a decision only adds an audit comment. It does not apply code, run commands, push commits, open another PR, or merge.
- Proposals are deterministic review guidance based on actual changed-file metadata. They are not model-generated patches and do not claim to prove a defect.
