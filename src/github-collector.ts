import type { Evidence, EvidenceBundle } from "./evidence.js";
import { createEvidenceBundle } from "./ingestion.js";
import { ingestCommitSnapshot, ingestPullRequestSnapshot, ingestRepositorySnapshot, type GitHubCommitSnapshot, type GitHubPullRequestSnapshot, type GitHubRepositorySnapshot } from "./github-intelligence.js";

export interface GitHubCollector {
  repository(): Promise<GitHubRepositorySnapshot>;
  commits(limit?: number): Promise<GitHubCommitSnapshot[]>;
  pullRequests(limit?: number): Promise<GitHubPullRequestSnapshot[]>;
}

export interface GitHubCollectorOptions { maxCommits?: number; maxPullRequests?: number; }

export async function collectGitHubEvidence(collector: GitHubCollector, options: GitHubCollectorOptions = {}): Promise<EvidenceBundle> {
  const [repository, commits, pullRequests] = await Promise.all([
    collector.repository(),
    collector.commits(options.maxCommits ?? 50),
    collector.pullRequests(options.maxPullRequests ?? 50),
  ]);
  const evidence: Evidence[] = [
    ingestRepositorySnapshot(repository),
    ...commits.map(commit => ingestCommitSnapshot(repository.fullName, commit)),
    ...pullRequests.map(pr => ingestPullRequestSnapshot(repository.fullName, pr)),
  ];
  return createEvidenceBundle(evidence);
}
