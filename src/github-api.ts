import type { GitHubCollector } from "./github-collector.js";
import type { GitHubCommitSnapshot, GitHubPullRequestSnapshot, GitHubRepositorySnapshot } from "./github-intelligence.js";
import type { GitHubCommentSnapshot, GitHubReviewSnapshot, GitHubWorkflowJobSnapshot, GitHubWorkflowRunSnapshot } from "./github-ci.js";

export interface GitHubApiCollectorOptions {
  token?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  perPage?: number;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly requestUrl: string,
    public readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown, context: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`GitHub API returned invalid ${context}`);
  }
  return value as JsonRecord;
}

function asString(value: unknown, field: string, context: string): string {
  if (typeof value !== "string") throw new Error(`GitHub API returned invalid ${context}.${field}`);
  return value;
}

function asNumber(value: unknown, field: string, context: string): number {
  if (typeof value !== "number") throw new Error(`GitHub API returned invalid ${context}.${field}`);
  return value;
}

function parseNextLink(link: string | null): string | null {
  if (!link) return null;
  const match = link.split(",").map(part => part.trim()).find(part => /rel="next"/.test(part));
  if (!match) return null;
  const url = match.match(/^<([^>]+)>/);
  return url?.[1] ?? null;
}

function repositoryFromJson(value: unknown): GitHubRepositorySnapshot {
  const data = asRecord(value, "repository");
  const fullName = asString(data.full_name, "full_name", "repository");
  const defaultBranch = asString(data.default_branch, "default_branch", "repository");
  return {
    fullName,
    defaultBranch,
    visibility: typeof data.visibility === "string" ? data.visibility : undefined,
    archived: typeof data.archived === "boolean" ? data.archived : undefined,
    sizeKb: typeof data.size === "number" ? data.size : undefined,
  };
}

function commitFromJson(value: unknown): GitHubCommitSnapshot {
  const data = asRecord(value, "commit");
  const commit = asRecord(data.commit, "commit.commit");
  const author = commit.author && typeof commit.author === "object"
    ? (commit.author as JsonRecord).name
    : undefined;
  return {
    sha: asString(data.sha, "sha", "commit"),
    message: asString(commit.message, "message", "commit.commit"),
    author: typeof author === "string" ? author : null,
    authoredAt: typeof commit.author === "object" && commit.author
      ? ((commit.author as JsonRecord).date as string | undefined) ?? null
      : null,
  };
}

function pullRequestFromJson(value: unknown): GitHubPullRequestSnapshot {
  const data = asRecord(value, "pull request");
  const base = asRecord(data.base, "base");
  const head = asRecord(data.head, "head");
  return {
    number: asNumber(data.number, "number", "pull request"),
    title: asString(data.title, "title", "pull request"),
    state: data.state === "open" ? "open" : "closed",
    merged: data.merged_at !== null && data.merged_at !== undefined,
    baseSha: asString(base.sha, "sha", "pull request.base"),
    headSha: asString(head.sha, "sha", "pull request.head"),
    additions: typeof data.additions === "number" ? data.additions : 0,
    deletions: typeof data.deletions === "number" ? data.deletions : 0,
    changedFiles: typeof data.changed_files === "number" ? data.changed_files : 0,
    createdAt: asString(data.created_at, "created_at", "pull request"),
    updatedAt: typeof data.updated_at === "string" ? data.updated_at : null,
    mergedAt: typeof data.merged_at === "string" ? data.merged_at : null,
  };
}

export class GitHubApiCollector implements GitHubCollector {
  private readonly token?: string;
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly perPage: number;

  constructor(
    private readonly repositoryFullName: string,
    options: GitHubApiCollectorOptions = {},
  ) {
    if (!/^[^/]+\/[^/]+$/.test(repositoryFullName)) {
      throw new Error("repositoryFullName must use owner/name format");
    }
    this.token = options.token;
    this.apiBaseUrl = (options.apiBaseUrl ?? "https://api.github.com").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.perPage = Math.min(Math.max(options.perPage ?? 100, 1), 100);
  }

  private async get<T>(pathOrUrl: string): Promise<{ data: T; nextUrl: string | null }> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${this.apiBaseUrl}${pathOrUrl}`;
    const response = await this.fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
    });
    const bodyText = await response.text();
    let body: unknown = undefined;
    if (bodyText) {
      try { body = JSON.parse(bodyText); } catch { body = bodyText; }
    }
    if (!response.ok) {
      const message = typeof body === "object" && body && "message" in body
        ? String((body as JsonRecord).message)
        : `GitHub API request failed with HTTP ${response.status}`;
      throw new GitHubApiError(message, response.status, url, body);
    }
    return {
      data: body as T,
      nextUrl: parseNextLink(response.headers.get("link")),
    };
  }

  private async getAll<T>(path: string, map: (item: unknown) => T, limit: number): Promise<T[]> {
    if (limit <= 0) return [];
    const results: T[] = [];
    let url: string | null = `${path}${path.includes("?") ? "&" : "?"}per_page=${this.perPage}`;
    while (url && results.length < limit) {
      const page: { data: unknown; nextUrl: string | null } = await this.get<unknown>(url);
      if (!Array.isArray(page.data)) throw new Error("GitHub API returned an invalid list response");
      for (const item of page.data) {
        results.push(map(item));
        if (results.length >= limit) break;
      }
      url = results.length >= limit ? null : page.nextUrl;
    }
    return results;
  }

  private async getAllFromField<T>(path: string, field: string, map: (item: unknown) => T, limit: number): Promise<T[]> {
    if (limit <= 0) return [];
    const results: T[] = [];
    let url: string | null = `${path}${path.includes("?") ? "&" : "?"}per_page=${Math.min(limit, this.perPage)}`;
    while (url && results.length < limit) {
      const page: { data: unknown; nextUrl: string | null } = await this.get<unknown>(url);
      const payload = Array.isArray(page.data)
        ? page.data
        : asRecord(page.data, field + " response")[field];
      if (!Array.isArray(payload)) throw new Error(`GitHub API returned an invalid ${field} list response`);
      for (const item of payload) {
        results.push(map(item));
        if (results.length >= limit) break;
      }
      url = results.length >= limit ? null : page.nextUrl;
    }
    return results;
  }

  async workflowRuns(limit = 50): Promise<GitHubWorkflowRunSnapshot[]> {
    return this.getAllFromField(
      `/repos/${this.repositoryFullName}/actions/runs`,
      "workflow_runs",
      (value) => {
        const data = asRecord(value, "workflow run");
        return {
          id: asNumber(data.id, "id", "workflow run"),
          name: asString(data.name, "name", "workflow run"),
          status: asString(data.status, "status", "workflow run"),
          conclusion: typeof data.conclusion === "string" ? data.conclusion : null,
          headSha: asString(data.head_sha, "head_sha", "workflow run"),
          runNumber: asNumber(data.run_number, "run_number", "workflow run"),
          event: asString(data.event, "event", "workflow run"),
          branch: typeof data.head_branch === "string" ? data.head_branch : null,
          createdAt: asString(data.created_at, "created_at", "workflow run"),
          updatedAt: asString(data.updated_at, "updated_at", "workflow run"),
          runAttempt: typeof data.run_attempt === "number" ? data.run_attempt : undefined,
          workflowPath: typeof data.path === "string" ? data.path : null,
          htmlUrl: typeof data.html_url === "string" ? data.html_url : null,
        };
      },
      limit,
    );
  }

  async workflowJobs(runId: number, limit = 100): Promise<GitHubWorkflowJobSnapshot[]> {
    return this.getAllFromField(
      `/repos/${this.repositoryFullName}/actions/runs/${runId}/jobs`,
      "jobs",
      (value) => {
        const data = asRecord(value, "workflow job");
        const steps = Array.isArray(data.steps) ? data.steps.map((value) => {
          const step = asRecord(value, "workflow job step");
          return {
            name: asString(step.name, "name", "workflow job step"),
            status: asString(step.status, "status", "workflow job step"),
            conclusion: typeof step.conclusion === "string" ? step.conclusion : null,
            number: typeof step.number === "number" ? step.number : undefined,
          };
        }) : undefined;
        return {
          id: asNumber(data.id, "id", "workflow job"),
          name: asString(data.name, "name", "workflow job"),
          status: asString(data.status, "status", "workflow job"),
          conclusion: typeof data.conclusion === "string" ? data.conclusion : null,
          startedAt: typeof data.started_at === "string" ? data.started_at : null,
          completedAt: typeof data.completed_at === "string" ? data.completed_at : null,
          runnerName: typeof data.runner_name === "string" ? data.runner_name : null,
          steps,
          htmlUrl: typeof data.html_url === "string" ? data.html_url : null,
        };
      },
      limit,
    );
  }

  async reviews(pullRequestNumber: number, limit = 100): Promise<GitHubReviewSnapshot[]> {
    return this.getAll(
      `/repos/${this.repositoryFullName}/pulls/${pullRequestNumber}/reviews`,
      (value) => {
        const data = asRecord(value, "pull request review");
        const user = data.user && typeof data.user === "object" ? (data.user as JsonRecord).login : undefined;
        return {
          id: asNumber(data.id, "id", "pull request review"),
          pullRequestNumber,
          user: typeof user === "string" ? user : null,
          state: asString(data.state, "state", "pull request review"),
          submittedAt: typeof data.submitted_at === "string" ? data.submitted_at : null,
          body: typeof data.body === "string" ? data.body : null,
        };
      },
      limit,
    );
  }

  async comments(pullRequestNumber: number, limit = 100): Promise<GitHubCommentSnapshot[]> {
    return this.getAll(
      `/repos/${this.repositoryFullName}/pulls/${pullRequestNumber}/comments`,
      (value) => {
        const data = asRecord(value, "pull request comment");
        const user = data.user && typeof data.user === "object" ? (data.user as JsonRecord).login : undefined;
        return {
          id: asNumber(data.id, "id", "pull request comment"),
          pullRequestNumber,
          user: typeof user === "string" ? user : null,
          body: asString(data.body, "body", "pull request comment"),
          createdAt: asString(data.created_at, "created_at", "pull request comment"),
          updatedAt: typeof data.updated_at === "string" ? data.updated_at : null,
          path: typeof data.path === "string" ? data.path : null,
          line: typeof data.line === "number" ? data.line : null,
        };
      },
      limit,
    );
  }

  async repository(): Promise<GitHubRepositorySnapshot> {
    const page = await this.get<unknown>(`/repos/${this.repositoryFullName}`);
    return repositoryFromJson(page.data);
  }

  async commits(limit = 50): Promise<GitHubCommitSnapshot[]> {
    return this.getAll(
      `/repos/${this.repositoryFullName}/commits`,
      commitFromJson,
      limit,
    );
  }

  async pullRequests(limit = 50): Promise<GitHubPullRequestSnapshot[]> {
    return this.getAll(
      `/repos/${this.repositoryFullName}/pulls?state=all&sort=updated&direction=desc`,
      pullRequestFromJson,
      limit,
    );
  }
}

export function createGitHubApiCollector(
  repositoryFullName: string,
  options: GitHubApiCollectorOptions = {},
): GitHubApiCollector {
  return new GitHubApiCollector(repositoryFullName, options);
}
