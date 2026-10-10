import type { IncomingMessage, ServerResponse } from "node:http";

type GitHubRepo = {
  id: number; name: string; full_name: string; html_url: string; description: string | null;
  private: boolean; fork: boolean; archived: boolean; disabled: boolean; visibility?: string;
  default_branch: string; language: string | null; stargazers_count: number; watchers_count: number;
  forks_count: number; open_issues_count: number; size: number; created_at: string; updated_at: string;
  pushed_at: string | null; license: { name: string; spdx_id: string | null } | null;
  topics?: string[]; owner: { login: string; avatar_url: string; html_url: string };
};
type ApiFailure = { status: number; message: string };

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

function parseRepository(input: string): { owner: string; repo: string; fullName: string } {
  const value = input.trim();
  let owner: string;
  let repo: string;
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    [owner, repo] = value.split("/");
  } else {
    let parsed: URL;
    try { parsed = new URL(value); } catch { throw { status: 400, message: "Paste a GitHub URL such as https://github.com/owner/repository or use owner/repository." } satisfies ApiFailure; }
    if (parsed.protocol !== "https:" || !["github.com", "www.github.com"].includes(parsed.hostname.toLowerCase()) || parsed.username || parsed.password) {
      throw { status: 400, message: "Only public GitHub repository URLs are supported." } satisfies ApiFailure;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) throw { status: 400, message: "The URL must point to a repository: https://github.com/owner/repository." } satisfies ApiFailure;
    owner = parts[0];
    repo = parts[1].replace(/\.git$/i, "");
  }
  if (!owner || !repo || owner.length > 100 || repo.length > 100 || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw { status: 400, message: "That repository URL or owner/repository value is not valid." } satisfies ApiFailure;
  }
  return { owner, repo, fullName: owner + "/" + repo };
}

async function githubGet<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "AgentIQ-Repository-Inspector",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
  const response = await fetch("https://api.github.com" + path, { headers, cache: "no-store" });
  if (!response.ok) {
    const status = response.status === 404 ? 404 : response.status === 403 || response.status === 429 ? 429 : 502;
    throw { status, message: status === 404
      ? "Repository not found, empty, or private. Public repositories work without login; configure a server-side GITHUB_TOKEN to inspect private repositories."
      : status === 429
        ? "GitHub API rate limit or permission limit reached. Try again later or configure a least-privilege server-side GITHUB_TOKEN."
        : "GitHub returned HTTP " + response.status + " while reading this repository." } satisfies ApiFailure;
  }
  return await response.json() as T;
}

async function optional<T>(path: string, fallback: T): Promise<T> {
  try { return await githubGet<T>(path); } catch { return fallback; }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    send(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Only GET is supported." } });
    return;
  }
  const url = new URL(req.url || "/api/repository", "https://agentiq.local");
  const input = url.searchParams.get("url") || url.searchParams.get("repo") || "";
  if (!input.trim()) {
    send(res, 400, { error: { code: "REPOSITORY_REQUIRED", message: "Add a GitHub repository URL to inspect." } });
    return;
  }
  try {
    const parsed = parseRepository(input);
    const base = "/repos/" + encodeURIComponent(parsed.owner) + "/" + encodeURIComponent(parsed.repo);
    const [repository, languages, readme, commits, issues, pulls, workflows, contents, branches] = await Promise.all([
      githubGet<GitHubRepo>(base),
      optional<Record<string, number>>(base + "/languages", {}),
      optional<{ name: string; content?: string; encoding?: string; html_url?: string }>(base + "/readme", { name: "README unavailable" }),
      optional<Array<{ sha: string; html_url: string; commit: { message: string; author?: { name?: string; date?: string } } }>>(base + "/commits?per_page=5", []),
      optional<Array<{ number: number; title: string; html_url: string; state: string; created_at: string; user?: { login: string } }>>(base + "/issues?state=open&per_page=8", []),
      optional<Array<{ number: number; title: string; html_url: string; state: string; draft?: boolean; updated_at: string; user?: { login: string } }>>(base + "/pulls?state=open&per_page=8", []),
      optional<{ total_count: number; workflow_runs: Array<{ id: number; name: string; html_url: string; status: string; conclusion: string | null; created_at: string; head_branch: string }> }>(base + "/actions/runs?per_page=5", { total_count: 0, workflow_runs: [] }),
      optional<Array<{ name: string; type: string; path: string; html_url: string }>>(base + "/contents", []),
      optional<Array<{ name: string; protected: boolean; commit: { sha: string } }>>(base + "/branches?per_page=100", []),
    ]);
    let readmeText = "";
    if (readme.content && readme.encoding === "base64") {
      try { readmeText = Buffer.from(readme.content.replace(/\n/g, ""), "base64").toString("utf8").slice(0, 12000); } catch { readmeText = ""; }
    }
    send(res, 200, {
      data: {
        repository: {
          id: repository.id, name: repository.name, fullName: repository.full_name, url: repository.html_url,
          description: repository.description, private: repository.private, visibility: repository.visibility || (repository.private ? "private" : "public"),
          fork: repository.fork, archived: repository.archived, disabled: repository.disabled, defaultBranch: repository.default_branch,
          primaryLanguage: repository.language, stars: repository.stargazers_count, watchers: repository.watchers_count,
          forks: repository.forks_count, openIssues: repository.open_issues_count, sizeKb: repository.size,
          createdAt: repository.created_at, updatedAt: repository.updated_at, pushedAt: repository.pushed_at,
          license: repository.license?.name || "No license detected", topics: repository.topics || [],
          owner: { login: repository.owner.login, avatarUrl: repository.owner.avatar_url, url: repository.owner.html_url },
        },
        languages: Object.entries(languages).sort((a, b) => b[1] - a[1]).map(([name, bytes]) => ({ name, bytes })),
        readme: { name: readme.name, url: readme.html_url || repository.html_url + "/blob/" + repository.default_branch + "/README.md", text: readmeText },
        rootFiles: contents.slice(0, 40).map((item) => ({ name: item.name, type: item.type, path: item.path, url: item.html_url })),
        branches: branches.slice(0, 20).map((item) => ({ name: item.name, protected: item.protected, sha: item.commit.sha })),
        commits: commits.map((item) => ({ sha: item.sha, shortSha: item.sha.slice(0, 7), url: item.html_url, message: item.commit.message.split("\n")[0], author: item.commit.author?.name || "Unknown", date: item.commit.author?.date || null })),
        issues: issues.filter((item) => !("pull_request" in item)).map((item) => ({ number: item.number, title: item.title, url: item.html_url, state: item.state, createdAt: item.created_at, author: item.user?.login || "Unknown" })).slice(0, 8),
        pullRequests: pulls.map((item) => ({ number: item.number, title: item.title, url: item.html_url, state: item.state, draft: Boolean(item.draft), updatedAt: item.updated_at, author: item.user?.login || "Unknown" })),
        actions: { totalRuns: workflows.total_count, runs: workflows.workflow_runs.map((item) => ({ id: item.id, name: item.name, url: item.html_url, status: item.status, conclusion: item.conclusion, createdAt: item.created_at, branch: item.head_branch })) },
        meta: { generatedAt: new Date().toISOString(), authenticated: Boolean(process.env.GITHUB_TOKEN), limitations: "Only public repository metadata is available without a token. Optional endpoints may be empty when disabled or unavailable; absence is not proof that no activity exists." },
      },
    });
  } catch (error) {
    const failure = error as Partial<ApiFailure>;
    const status = typeof failure.status === "number" ? failure.status : 502;
    send(res, status, { error: { code: status === 400 ? "INVALID_REPOSITORY" : status === 404 ? "REPOSITORY_NOT_FOUND" : status === 429 ? "GITHUB_RATE_LIMIT" : "REPOSITORY_INSPECTION_FAILED", message: typeof failure.message === "string" ? failure.message : "Unable to inspect this repository right now." } });
  }
}
