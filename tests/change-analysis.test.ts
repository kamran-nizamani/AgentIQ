import { describe, expect, it } from "vitest";
import { analyzeChangedFiles, changeAnalysisToDiffEvidence, classifyPath, classifySensitivePath, languageOf } from "../src/change-analysis.js";
import { extractRiskSignals } from "../src/risk.js";

describe("path classification", () => {
  it("detects languages", () => {
    expect(languageOf("src/a.ts")).toBe("TypeScript");
    expect(languageOf("pkg/x.py")).toBe("Python");
    expect(languageOf("Dockerfile")).toBe("Dockerfile");
    expect(languageOf("LICENSE")).toBeNull();
  });

  it("classifies test, config, generated, migration and infrastructure paths", () => {
    expect(classifyPath("tests/a.test.ts")).toContain("test");
    expect(classifyPath("src/foo.spec.js")).toContain("test");
    expect(classifyPath("pkg/test_users.py")).toContain("test");
    expect(classifyPath("vite.config.ts")).toContain("config");
    expect(classifyPath("tsconfig.json")).toContain("config");
    expect(classifyPath("dist/app.min.js")).toContain("generated");
    expect(classifyPath("package-lock.json")).toEqual(expect.arrayContaining(["generated", "dependency"]));
    expect(classifyPath("supabase/migrations/001_init.sql")).toContain("migration");
    expect(classifyPath("infra/main.tf")).toContain("infrastructure");
    expect(classifyPath(".github/workflows/ci.yml")).toContain("infrastructure");
    expect(classifyPath("Dockerfile")).toContain("infrastructure");
  });

  it("separates auth from authorization and ignores lookalikes", () => {
    expect(classifyPath("src/auth/login.ts")).toContain("auth");
    expect(classifyPath("src/permissions/rbac.ts")).toContain("authorization");
    expect(classifyPath("src/author.ts")).not.toContain("auth");
    expect(classifyPath("tests/auth/login.test.ts")).not.toContain("auth");
  });

  it("treats real secrets as secrets but not templates", () => {
    expect(classifyPath(".env.production")).toContain("secrets-config");
    expect(classifyPath("deploy/id_rsa")).toContain("secrets-config");
    expect(classifyPath("certs/server.pem")).toContain("secrets-config");
    expect(classifyPath(".env.example")).not.toContain("secrets-config");
    expect(classifySensitivePath(".env.production")).toBe("critical");
    expect(classifySensitivePath("certs/server.pem")).toBe("critical");
    expect(classifySensitivePath("src/auth/session.ts")).toBe("high");
    expect(classifySensitivePath("src/index.ts")).toBeNull();
  });
});

describe("analyzeChangedFiles", () => {
  const files = [
    { path: "src/auth/login.ts", additions: 40, deletions: 5 },
    { path: "src/billing.ts", additions: 30, deletions: 0 },
    { path: "README.md", additions: 2, deletions: 1 },
    { path: "package-lock.json", additions: 500, deletions: 400 },
    { path: ".env.production", additions: 1, deletions: 0 },
  ];

  it("summarizes languages, totals and categories", () => {
    const analysis = analyzeChangedFiles(files);
    expect(analysis.filesChanged).toBe(5);
    expect(analysis.additions).toBe(573);
    expect(analysis.deletions).toBe(406);
    expect(analysis.languages.TypeScript).toEqual({ files: 2, additions: 70, deletions: 5 });
    expect(analysis.authFiles).toEqual(["src/auth/login.ts"]);
    expect(analysis.secretsConfigFiles).toEqual([".env.production"]);
    expect(analysis.dependencyFiles).toEqual(["package-lock.json"]);
    expect(analysis.documentationFiles).toEqual(["README.md"]);
    expect(analysis.sourceFilesChanged).toBe(2);
    expect(analysis.untestedSourceChange).toBe(true);
  });

  it("is not untested when a test file changes alongside source", () => {
    const analysis = analyzeChangedFiles([{ path: "src/a.ts", additions: 60 }, { path: "tests/a.test.ts", additions: 20 }]);
    expect(analysis.testFiles).toEqual(["tests/a.test.ts"]);
    expect(analysis.untestedSourceChange).toBe(false);
  });

  it("does not call a docs-only or empty change untested", () => {
    expect(analyzeChangedFiles([{ path: "README.md", additions: 100 }]).untestedSourceChange).toBe(false);
    expect(analyzeChangedFiles([]).untestedSourceChange).toBe(false);
  });
});

describe("diff evidence feeds risk signals", () => {
  it("produces risk signals for auth, secrets and untested source changes", () => {
    const analysis = analyzeChangedFiles([
      { path: "src/auth/login.ts", additions: 40, deletions: 15 },
      { path: ".env.production", additions: 1 },
      { path: "infra/main.tf", additions: 3 },
      { path: "db/migrations/002.sql", additions: 8 },
    ]);
    const evidence = changeAnalysisToDiffEvidence(analysis, { baseCommit: "a", headCommit: "b", sourceId: "x" });
    expect(evidence.kind).toBe("diff");
    const categories = extractRiskSignals({ schemaVersion: "1.0", evidence: [evidence] }).map((signal) => signal.category);
    expect(categories).toEqual(expect.arrayContaining([
      "sensitive-file", "auth-change", "secrets-config", "infrastructure", "migration", "untested-change",
    ]));
  });

  it("raises no extra signals for a small tested change", () => {
    const analysis = analyzeChangedFiles([{ path: "src/a.ts", additions: 5 }, { path: "tests/a.test.ts", additions: 5 }]);
    const evidence = changeAnalysisToDiffEvidence(analysis, { baseCommit: "a", headCommit: "b", sourceId: "y" });
    expect(extractRiskSignals({ schemaVersion: "1.0", evidence: [evidence] })).toEqual([]);
  });
});
