import { describe, expect, it } from "vitest";
import { GitHubApiCollector, GitHubApiError } from "../src/github-api.js";

function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("GitHub API collector", () => {
  it("collects repository metadata, commits, and pull requests", async () => {
    const requests: string[] = [];
    const fetchImpl = async (url: string | URL | Request) => {
      const value = String(url);
      requests.push(value);
      if (value.endsWith("/repos/o/r")) {
        return response({ full_name: "o/r", default_branch: "main", visibility: "public", archived: false, size: 42 });
      }
      if (value.includes("/commits?")) {
        return response([{ sha: "abc", commit: { message: "feat: ship", author: { name: "agent", date: "2026-10-08T00:00:00Z" } } }]);
      }
      if (value.includes("/pulls?")) {
        return response([{
          number: 7, title: "Ship feature", state: "closed",
          merged_at: "2026-10-08T00:05:00Z",
          base: { sha: "base" }, head: { sha: "head" },
          additions: 10, deletions: 2, changed_files: 3,
          created_at: "2026-10-08T00:00:00Z", updated_at: "2026-10-08T00:05:00Z"
        }]);
      }
      throw new Error(`unexpected request: ${value}`);
    };

    const collector = new GitHubApiCollector("o/r", { token: "secret", fetchImpl });
    expect(await collector.repository()).toMatchObject({ fullName: "o/r", defaultBranch: "main", sizeKb: 42 });
    expect(await collector.commits(1)).toMatchObject([{ sha: "abc", author: "agent" }]);
    expect(await collector.pullRequests(1)).toMatchObject([{ number: 7, merged: true, changedFiles: 3 }]);
    expect(requests.every(url => !url.includes("secret"))).toBe(true);
  });

  it("follows pagination links until the requested limit", async () => {
    let calls = 0;
    const fetchImpl = async (url: string | URL | Request) => {
      calls++;
      if (calls === 1) {
        return response([{ sha: "a", commit: { message: "one" } }], 200, {
          link: '<https://api.github.com/repos/o/r/commits?page=2>; rel="next"',
        });
      }
      return response([{ sha: "b", commit: { message: "two" } }]);
    };
    const collector = new GitHubApiCollector("o/r", { fetchImpl });
    const commits = await collector.commits(2);
    expect(commits.map(commit => commit.sha)).toEqual(["a", "b"]);
    expect(calls).toBe(2);
  });

  it("surfaces structured API failures", async () => {
    const fetchImpl = async () => response({ message: "Bad credentials" }, 401);
    const collector = new GitHubApiCollector("o/r", { token: "bad", fetchImpl });
    await expect(collector.repository()).rejects.toMatchObject({
      name: "GitHubApiError",
      status: 401,
    } satisfies Partial<GitHubApiError>);
  });

  it("rejects invalid repository names", () => {
    expect(() => new GitHubApiCollector("not-a-repo")).toThrow("owner/name");
  });
});
