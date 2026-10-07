import type { GitHubCollector } from "./github-collector.js";
import type { GitHubCommitSnapshot, GitHubPullRequestSnapshot, GitHubRepositorySnapshot } from "./github-intelligence.js";

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
      const page = await this.get<unknown>(url);
      if (!Array.isArray(page.data)) throw new Error("GitHub API returned an invalid list response");
      for (const item of page.data) {
        results.push(map(item));
        if (results.length >= limit) break;
      }
      url = results.length >= limit ? null : page.nextUrl;
    }
    return results;
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
