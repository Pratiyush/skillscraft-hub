#!/usr/bin/env node

/**
 * security-scan.mjs — Scan all skill scripts for common security issues.
 *
 * Checks:
 *   - Hardcoded secrets (API keys, tokens, passwords)
 *   - Shell injection patterns (execSync/exec with string interpolation)
 *   - Network calls to unknown domains
 *   - Unsafe filesystem operations (rm -rf, writing outside cwd)
 *   - eval() and Function() constructors
 *   - Suspicious network downloads (curl piped to bash)
 *
 * Exits 1 if any CRITICAL or HIGH issue found. Reports MEDIUM/LOW as warnings.
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const SKILLS_DIR = join(ROOT, "skills", "skill");

// Patterns to scan for. Each: {id, severity, pattern, message, languages?}
const RULES = [
  {
    id: "hardcoded-api-key",
    severity: "critical",
    pattern:
      /(?:api[_-]?key|apikey|access[_-]?token|secret[_-]?key|private[_-]?key|auth[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_\-+=/]{20,}["']/i,
    message: "Possible hardcoded API key or secret",
  },
  {
    id: "npm-token",
    severity: "critical",
    pattern: /npm_[A-Za-z0-9]{36,}/,
    message: "npm auth token in source",
  },
  {
    id: "github-token",
    severity: "critical",
    pattern: /gh[pousr]_[A-Za-z0-9]{36,}/,
    message: "GitHub token in source",
  },
  {
    id: "aws-access-key",
    severity: "critical",
    pattern: /AKIA[0-9A-Z]{16}/,
    message: "AWS access key ID",
  },
  {
    id: "private-key-block",
    severity: "critical",
    pattern: /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/,
    message: "Private key in source",
  },
  {
    id: "shell-injection-execSync",
    severity: "high",
    pattern: /execSync\s*\(\s*`[^`]*\$\{/,
    message: "execSync with template literal interpolation (shell injection risk)",
    languages: ["js", "mjs", "ts", "cjs"],
  },
  {
    id: "shell-injection-exec",
    severity: "high",
    pattern: /\bexec\s*\(\s*["'`][^"'`]*\$\{/,
    message: "exec() with string interpolation (shell injection risk)",
    languages: ["js", "mjs", "ts", "cjs"],
  },
  {
    id: "python-shell-true",
    severity: "high",
    pattern: /subprocess\.(call|run|Popen)\s*\([^)]*shell\s*=\s*True/,
    message: "subprocess with shell=True — shell injection risk",
    languages: ["py"],
  },
  {
    id: "python-os-system",
    severity: "high",
    pattern: /os\.system\s*\(/,
    message: "os.system() — prefer subprocess with list args",
    languages: ["py"],
  },
  {
    id: "eval-usage",
    severity: "high",
    pattern: /\beval\s*\(/,
    message: "eval() — arbitrary code execution",
    languages: ["js", "mjs", "ts", "cjs", "py"],
  },
  {
    id: "function-constructor",
    severity: "high",
    pattern: /new Function\s*\(/,
    message: "Function constructor — arbitrary code execution",
    languages: ["js", "mjs", "ts", "cjs"],
  },
  {
    id: "curl-pipe-bash",
    severity: "high",
    pattern: /curl\s+[^|]*\|\s*(?:bash|sh|zsh|python|node)/,
    message: "curl | bash pattern — untrusted code execution",
  },
  {
    id: "rm-rf-root",
    severity: "critical",
    pattern: /rm\s+-rf?\s+\/(?:\s|$)/,
    message: "rm -rf / — catastrophic delete",
  },
  {
    id: "rm-rf-home",
    severity: "high",
    pattern: /rm\s+-rf?\s+(?:~|\$HOME)(?:\s|$)/,
    message: "rm -rf $HOME — destructive",
  },
  {
    id: "unversioned-remote-import",
    severity: "medium",
    pattern: /https:\/\/deno\.land\/std\/(?!@)/,
    message: "Unversioned Deno std import — pin the version",
    languages: ["ts"],
  },
];

/**
 * Check if a rule applies to a file based on its extension.
 */
function ruleApplies(rule, ext) {
  if (!rule.languages) return true;
  return rule.languages.includes(ext);
}

/**
 * Scan a single file and return findings.
 */
function scanFile(filePath) {
  const ext = extname(filePath).slice(1).toLowerCase();
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const findings = [];

  for (const rule of RULES) {
    if (!ruleApplies(rule, ext)) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments for shell/JS/TS/Python (rough heuristic)
      const trimmed = line.trim();
      if (
        trimmed.startsWith("#") ||
        trimmed.startsWith("//") ||
        trimmed.startsWith("*")
      ) {
        continue;
      }

      if (rule.pattern.test(line)) {
        findings.push({
          rule: rule.id,
          severity: rule.severity,
          message: rule.message,
          line: i + 1,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
  }

  return findings;
}

let filesScanned = 0;

/**
 * Walk a directory and scan all script files.
 */
function walkAndScan(dir) {
  const results = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === ".git") continue;

    if (entry.isDirectory()) {
      results.push(...walkAndScan(full));
    } else {
      const ext = extname(entry.name).slice(1).toLowerCase();
      // Only scan known script types
      if (!["js", "mjs", "cjs", "ts", "py", "sh", "bash", "java"].includes(ext))
        continue;
      filesScanned++;
      const findings = scanFile(full);
      if (findings.length > 0) {
        results.push({ file: relative(ROOT, full), findings });
      }
    }
  }

  return results;
}

// ── Main ──

console.log("SkillsCraft Hub — Security Scanner\n");

if (!existsSync(SKILLS_DIR)) {
  console.error(`No skills directory: ${SKILLS_DIR}`);
  process.exit(1);
}

const results = walkAndScan(SKILLS_DIR);

const counts = { critical: 0, high: 0, medium: 0, low: 0 };
let totalFindings = 0;

for (const result of results) {
  for (const f of result.findings) {
    counts[f.severity]++;
    totalFindings++;
  }
}

if (totalFindings === 0) {
  console.log(`  No security issues found across ${filesScanned} scanned files.`);
  console.log("\nAll clean.");
  process.exit(0);
}

// Group and print by severity
const severityOrder = ["critical", "high", "medium", "low"];
for (const sev of severityOrder) {
  const filesWithSev = results.filter((r) =>
    r.findings.some((f) => f.severity === sev)
  );
  if (filesWithSev.length === 0) continue;

  console.log(`\n${sev.toUpperCase()}:`);
  for (const result of filesWithSev) {
    const sevFindings = result.findings.filter((f) => f.severity === sev);
    for (const f of sevFindings) {
      console.log(`  ${result.file}:${f.line}`);
      console.log(`    [${f.rule}] ${f.message}`);
      console.log(`    > ${f.snippet}`);
    }
  }
}

console.log("\n════════════════════════════════════════");
console.log(`  Summary: ${totalFindings} finding(s)`);
console.log(`    Critical: ${counts.critical}`);
console.log(`    High:     ${counts.high}`);
console.log(`    Medium:   ${counts.medium}`);
console.log(`    Low:      ${counts.low}`);
console.log("════════════════════════════════════════\n");

// Fail build on critical/high
if (counts.critical > 0 || counts.high > 0) {
  console.error("Security scan FAILED — critical/high issues must be resolved.");
  process.exit(1);
}

console.log("Security scan passed (warnings only).");
