import type { Evidence } from "./evidence.js";
import { EVIDENCE_SCHEMA_VERSION } from "./evidence-schema.js";

/**
 * Deterministic classification of the files a change touches.
 *
 * Everything here is derived from file paths and line counts alone. It never
 * reads file contents, so it can run on a GitHub "files" listing without
 * fetching blobs, and the same input always produces the same output.
 */

export interface ChangedFile {
  path: string;
  status?: string;
  additions?: number;
  deletions?: number;
}

export type FileCategory =
  | "test"
  | "config"
  | "generated"
  | "migration"
  | "infrastructure"
  | "dependency"
  | "auth"
  | "authorization"
  | "secrets-config"
  | "documentation";

export interface LanguageStat { files: number; additions: number; deletions: number; }
export interface SensitiveFile { path: string; severity: "critical" | "high"; }

export interface ChangeAnalysis {
  filesChanged: number;
  additions: number;
  deletions: number;
  languages: Record<string, LanguageStat>;
  testFiles: string[];
  configFiles: string[];
  generatedFiles: string[];
  migrationFiles: string[];
  infrastructureFiles: string[];
  dependencyFiles: string[];
  authFiles: string[];
  authorizationFiles: string[];
  secretsConfigFiles: string[];
  documentationFiles: string[];
  sensitiveFiles: SensitiveFile[];
  /** Production source files changed (not tests, docs, generated or lock files). */
  sourceFilesChanged: number;
  /** True when production source changed but no test file did. */
  untestedSourceChange: boolean;
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", rb: "Ruby", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", kts: "Kotlin",
  swift: "Swift", cs: "C#", php: "PHP", scala: "Scala",
  c: "C", h: "C", cc: "C++", cpp: "C++", cxx: "C++", hpp: "C++",
  sh: "Shell", bash: "Shell", zsh: "Shell", ps1: "PowerShell",
  sql: "SQL", css: "CSS", scss: "CSS", sass: "CSS", less: "CSS",
  html: "HTML", htm: "HTML", vue: "Vue", svelte: "Svelte",
  md: "Markdown", mdx: "Markdown",
  json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", xml: "XML", tf: "Terraform", hcl: "Terraform",
};

const DEPENDENCY_FILE = /^(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|npm-shrinkwrap\.json|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|pipfile|pipfile\.lock|cargo\.toml|cargo\.lock|go\.mod|go\.sum|gemfile|gemfile\.lock|composer\.json|composer\.lock|pom\.xml|build\.gradle(\.kts)?)$/i;
const LOCK_FILE = /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|npm-shrinkwrap\.json|poetry\.lock|pipfile\.lock|cargo\.lock|go\.sum|gemfile\.lock|composer\.lock)$/i;

const TEST_PATH = /(^|\/)(__tests__|tests?|spec|specs|e2e|cypress)(\/|$)|\.(test|spec)\.[^./]+$|(^|\/)test_[^/]+\.py$|_test\.(go|py)$/i;
const GENERATED_PATH = /(^|\/)(dist|build|out|coverage|\.next|\.nuxt|node_modules|vendor|__generated__|generated)(\/|$)|\.min\.(js|css)$|\.(generated|gen)\.[^./]+$|\.pb\.go$|_pb2(_grpc)?\.py$|\.snap$/i;
const MIGRATION_PATH = /(^|\/)(migrations?|db\/migrate|alembic\/versions|prisma\/migrations|flyway|liquibase)(\/|$)|(^|\/)supabase\/migrations\//i;
const INFRA_PATH = /(^|\/)(terraform|k8s|kubernetes|helm|charts|ansible|pulumi|cloudformation|deploy|deployment|infra|infrastructure)(\/|$)|(^|\/)\.github\/workflows\/|\.tf$|\.tfvars$|(^|\/)(dockerfile[^/]*|docker-compose[^/]*\.ya?ml|vercel\.json|netlify\.toml|fly\.toml|render\.yaml|serverless\.ya?ml|procfile)$/i;
const AUTH_PATH = /(^|\/)(auth|authentication|login|logout|signin|signup|session|sessions|oauth|oidc|saml|sso|jwt|passport)(\/|\.|-|_|$)/i;
const AUTHZ_PATH = /(^|\/)(authorization|authz|permissions?|rbac|acl|policies|policy|roles?|access-control)(\/|\.|-|_|$)/i;
const CONFIG_FILE = /(^|\/)(\.[a-z0-9_-]+rc(\.[a-z]+)?|[a-z0-9_.-]*\.config\.[a-z]+|tsconfig[^/]*\.json|jest\.config\.[a-z]+|vitest\.config\.[a-z]+|eslint[^/]*|prettier[^/]*|babel[^/]*|webpack[^/]*|rollup[^/]*|vite[^/]*|\.editorconfig|\.gitignore|\.gitattributes|\.dockerignore|\.env\.(example|sample|template)|setup\.cfg|tox\.ini|pytest\.ini|mypy\.ini|\.npmrc|\.nvmrc)$|(^|\/)(config|configs|configuration|settings)(\/|$)/i;
const DOC_PATH = /\.(md|mdx|rst|txt|adoc)$|(^|\/)(docs?|documentation)(\/|$)|(^|\/)(license|licence|changelog|contributing|authors|codeowners)[^/]*$/i;

function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

function extension(path: string): string {
  const name = basename(path).toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
}

export function languageOf(path: string): string | null {
  const name = basename(path).toLowerCase();
  if (name === "dockerfile" || name.startsWith("dockerfile.")) return "Dockerfile";
  if (name === "makefile") return "Makefile";
  return LANGUAGE_BY_EXTENSION[extension(path)] ?? null;
}

/**
 * Paths that must never be committed or that guard secrets. A `.env.example`
 * template is not a secret; an `.env.production` file is.
 */
export function isSecretsConfigPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  const name = basename(normalized);
  if (name.startsWith(".env")) return !/\.(example|sample|template|dist)$/.test(name);
  if (["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"].includes(name)) return true;
  if (/\.(pem|key|p12|pfx|jks|keystore)$/.test(name)) return true;
  if (name.includes("private-key") || name.includes("private_key")) return true;
  if ((name.includes("secret") || name.includes("credential")) && /\.(json|ya?ml|toml|ini|env)$/.test(name)) return true;
  if (/(^|\/)(secrets?|credentials?)(\/|$)/.test(normalized)) return true;
  return false;
}

/** Mirrors the severity rules the live GitHub collector has used so far. */
export function classifySensitivePath(path: string): "critical" | "high" | null {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  if (isSecretsConfigPath(normalized)) {
    const name = basename(normalized);
    const critical = name.startsWith(".env") || /^id_/.test(name) || /\.(pem|key|p12|pfx|jks|keystore)$/.test(name) ||
      name.includes("private-key") || name.includes("private_key") ||
      ((name.includes("secret") || name.includes("credential")) && /\.(json|ya?ml|toml)$/.test(name));
    return critical ? "critical" : "high";
  }
  const segments = normalized.split("/");
  if (normalized.includes(".github/workflows/") ||
      ["auth", "authorization", "security", "crypto", "cryptography", "deploy", "terraform", "k8s", "kubernetes"].some((segment) => segments.includes(segment)) ||
      DEPENDENCY_FILE.test(basename(normalized))) return "high";
  return null;
}

/** Categories a single path belongs to. A path can belong to several. */
export function classifyPath(path: string): FileCategory[] {
  const normalized = path.replace(/\\/g, "/");
  const name = basename(normalized);
  const categories: FileCategory[] = [];
  if (TEST_PATH.test(normalized)) categories.push("test");
  if (GENERATED_PATH.test(normalized) || LOCK_FILE.test(name)) categories.push("generated");
  if (MIGRATION_PATH.test(normalized)) categories.push("migration");
  if (INFRA_PATH.test(normalized)) categories.push("infrastructure");
  if (DEPENDENCY_FILE.test(name)) categories.push("dependency");
  if (AUTH_PATH.test(normalized) && !TEST_PATH.test(normalized)) categories.push("auth");
  if (AUTHZ_PATH.test(normalized) && !TEST_PATH.test(normalized)) categories.push("authorization");
  if (isSecretsConfigPath(normalized)) categories.push("secrets-config");
  if (CONFIG_FILE.test(normalized) && !DEPENDENCY_FILE.test(name)) categories.push("config");
  if (DOC_PATH.test(normalized)) categories.push("documentation");
  return categories;
}

export function analyzeChangedFiles(files: ChangedFile[]): ChangeAnalysis {
  const analysis: ChangeAnalysis = {
    filesChanged: files.length,
    additions: 0,
    deletions: 0,
    languages: {},
    testFiles: [],
    configFiles: [],
    generatedFiles: [],
    migrationFiles: [],
    infrastructureFiles: [],
    dependencyFiles: [],
    authFiles: [],
    authorizationFiles: [],
    secretsConfigFiles: [],
    documentationFiles: [],
    sensitiveFiles: [],
    sourceFilesChanged: 0,
    untestedSourceChange: false,
  };

  const bucket: Record<FileCategory, string[]> = {
    test: analysis.testFiles,
    config: analysis.configFiles,
    generated: analysis.generatedFiles,
    migration: analysis.migrationFiles,
    infrastructure: analysis.infrastructureFiles,
    dependency: analysis.dependencyFiles,
    auth: analysis.authFiles,
    authorization: analysis.authorizationFiles,
    "secrets-config": analysis.secretsConfigFiles,
    documentation: analysis.documentationFiles,
  };

  for (const file of files) {
    const additions = Math.max(0, file.additions ?? 0);
    const deletions = Math.max(0, file.deletions ?? 0);
    analysis.additions += additions;
    analysis.deletions += deletions;

    const language = languageOf(file.path);
    if (language) {
      const stat = analysis.languages[language] ?? { files: 0, additions: 0, deletions: 0 };
      stat.files += 1;
      stat.additions += additions;
      stat.deletions += deletions;
      analysis.languages[language] = stat;
    }

    const categories = classifyPath(file.path);
    for (const category of categories) bucket[category].push(file.path);

    const severity = classifySensitivePath(file.path);
    if (severity) analysis.sensitiveFiles.push({ path: file.path, severity });

    const isSource = language !== null &&
      !["Markdown", "JSON", "YAML", "TOML", "XML"].includes(language) &&
      !categories.some((category) => ["test", "generated", "documentation", "config", "migration", "infrastructure"].includes(category));
    if (isSource) analysis.sourceFilesChanged += 1;
  }

  analysis.untestedSourceChange = analysis.sourceFilesChanged > 0 && analysis.testFiles.length === 0;
  return analysis;
}

/**
 * Package a change analysis as canonical diff evidence. The `sensitiveFiles`
 * and `dependencyFiles` fields are the ones the risk extractor already reads.
 */
export function changeAnalysisToDiffEvidence(
  analysis: ChangeAnalysis,
  input: { baseCommit: string; headCommit: string; sourceId: string; timestamp?: string; truncated?: boolean },
): Evidence {
  const now = new Date().toISOString();
  return {
    id: "git-diff:" + input.sourceId,
    kind: "diff",
    timestamp: input.timestamp ?? now,
    provenance: { source: "git-diff", sourceId: input.sourceId, collectedAt: now, schemaVersion: EVIDENCE_SCHEMA_VERSION },
    data: {
      baseCommit: input.baseCommit,
      headCommit: input.headCommit,
      filesChanged: analysis.filesChanged,
      linesAdded: analysis.additions,
      linesDeleted: analysis.deletions,
      languages: analysis.languages,
      testFiles: analysis.testFiles,
      configFiles: analysis.configFiles,
      generatedFiles: analysis.generatedFiles,
      migrationFiles: analysis.migrationFiles,
      infrastructureFiles: analysis.infrastructureFiles,
      dependencyFiles: analysis.dependencyFiles,
      authFiles: analysis.authFiles,
      authorizationFiles: analysis.authorizationFiles,
      secretsConfigFiles: analysis.secretsConfigFiles,
      sensitiveFiles: analysis.sensitiveFiles,
      sourceFilesChanged: analysis.sourceFilesChanged,
      untestedSourceChange: analysis.untestedSourceChange,
      fileListTruncated: input.truncated ?? false,
    },
  };
}
