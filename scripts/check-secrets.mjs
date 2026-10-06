#!/usr/bin/env node
/**
 * Blocks commits/pushes that include likely secrets or personal finance dumps.
 * Used by: npm run check:secrets  and  .githooks/pre-push
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

const BLOCKED_PATH_PATTERNS = [
  /(^|\/)\.env$/i,
  /(^|\/)\.env\.(?!example$).+/i,
  /(^|\/)\.data\//i,
  /\.tfstate(\.|$)/i,
  /terraform\.tfvars$/i,
  /\.pem$/i,
  /\.p12$/i,
  /credentials\.json$/i,
  /service-account.*\.json$/i,
  /(^|\/)secrets\//i,
  /\.xlsx$/i,
  /\.xls$/i,
  /(^|\/)uploads\//i,
  /(^|\/)statements\//i,
  /Credit Card Transactions/i,
];

const ALLOWED_CSV = new Set(["fixtures/sample-statement.csv"]);

const CONTENT_PATTERNS = [
  { name: "AWS access key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "AWS secret assignment", re: /aws_secret_access_key\s*[:=]\s*['\"]?[A-Za-z0-9\/+=]{30,}/i },
  { name: "Private key block", re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "Plaid secret value", re: /PLAID_SECRET\s*=\s*['\"]?[^\s'\"#]{8,}/ },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { name: "Generic API secret assignment", re: /(api[_-]?secret|client_secret)\s*[:=]\s*['\"][^'\"]{12,}/i },
];

function stagedOrTrackedFiles() {
  const mode = process.argv.includes("--all") ? "all" : "staged";
  if (mode === "all") {
    const out = execSync("git ls-files", { encoding: "utf8", cwd: ROOT });
    return out.split(/\r?\n/).filter(Boolean);
  }
  // For pre-push: files that would be pushed (diff against upstream or all tracked)
  try {
    const upstream = execSync("git rev-parse --abbrev-ref @{upstream}", {
      encoding: "utf8",
      cwd: ROOT,
    }).trim();
    const out = execSync(`git diff --name-only ${upstream}...HEAD`, {
      encoding: "utf8",
      cwd: ROOT,
    });
    const files = out.split(/\r?\n/).filter(Boolean);
    if (files.length) return files;
  } catch {
    // no upstream yet
  }
  const out = execSync("git ls-files", { encoding: "utf8", cwd: ROOT });
  return out.split(/\r?\n/).filter(Boolean);
}

function isBlockedPath(file) {
  const norm = file.replace(/\\/g, "/");
  if (norm.endsWith(".csv") && !ALLOWED_CSV.has(norm)) return true;
  return BLOCKED_PATH_PATTERNS.some((re) => re.test(norm));
}

function checkContent(file) {
  const abs = join(ROOT, file);
  if (!existsSync(abs)) return [];
  // skip large / binary-ish
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return [];
  }
  if (text.length > 1_500_000) return [`${file}: file too large to scan (>1.5MB)`];
  const hits = [];
  for (const { name, re } of CONTENT_PATTERNS) {
    if (re.test(text)) hits.push(`${file}: possible ${name}`);
  }
  // Ignore empty placeholder assignments in .env.example
  return hits.filter((h) => !file.endsWith(".env.example") || !/PLAID_SECRET\s*=\s*$/m.test(text));
}

const files = stagedOrTrackedFiles();
const pathViolations = files.filter(isBlockedPath);
const contentViolations = files.flatMap(checkContent);

// .env.example may contain PLAID_SECRET= empty — refine content check for examples
const filteredContent = contentViolations.filter((v) => {
  if (v.includes(".env.example") && v.includes("Plaid secret")) return false;
  return true;
});

if (pathViolations.length || filteredContent.length) {
  console.error("Secret / sensitive-file check FAILED:\n");
  for (const v of pathViolations) console.error(`  blocked path: ${v}`);
  for (const v of filteredContent) console.error(`  ${v}`);
  console.error("\nRemove these files/values before pushing to a public remote.");
  process.exit(1);
}

console.log(`check:secrets OK (${files.length} files scanned)`);
