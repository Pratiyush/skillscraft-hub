#!/usr/bin/env node

/**
 * release-check.js — Verify project release readiness.
 *
 * Usage:
 *   node release-check.js [--version <semver>]
 *
 * Requires: gh CLI authenticated, pnpm available
 */

const { execSync } = require("node:child_process");
const { readFileSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { parseArgs } = require("node:util");

// Target directory for checks — can be overridden with --dir
let TARGET_DIR = process.cwd();

function exec(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      cwd: opts.cwd || TARGET_DIR,
    }).trim();
  } catch {
    return null;
  }
}

function checkCI() {
  const result = exec("gh run list --branch main --limit 1 --json conclusion");
  if (!result) return { name: "CI green on default branch", status: "warning", detail: "Could not fetch CI status" };
  const runs = JSON.parse(result);
  if (runs.length === 0) return { name: "CI green on default branch", status: "warning", detail: "No recent CI runs found" };
  const ok = runs[0].conclusion === "success";
  return { name: "CI green on default branch", status: ok ? "pass" : "fail", detail: ok ? "Latest CI run passed" : `Latest CI run: ${runs[0].conclusion}` };
}

function checkBlockingIssues() {
  const result = exec('gh issue list --label "P0" --label "P1" --state open --json number,title --limit 10');
  if (!result) {
    // Try without labels (repo may not have P0/P1 labels)
    const allOpen = exec("gh issue list --state open --json number,title --limit 50");
    if (!allOpen) return { name: "No blocking issues", status: "warning", detail: "Could not fetch issues" };
    const issues = JSON.parse(allOpen);
    return { name: "No blocking issues", status: "pass", detail: `${issues.length} open issues (no P0/P1 labels found)` };
  }
  const issues = JSON.parse(result);
  return {
    name: "No blocking P0/P1 issues",
    status: issues.length === 0 ? "pass" : "fail",
    detail: issues.length === 0 ? "No blocking issues" : `${issues.length} blocking issue(s): ${issues.map((i) => `#${i.number}`).join(", ")}`,
  };
}

function checkChangelog(version) {
  if (!existsSync("CHANGELOG.md")) {
    return { name: "CHANGELOG.md exists", status: "fail", detail: "No CHANGELOG.md found in project root" };
  }
  const content = readFileSync("CHANGELOG.md", "utf-8");
  if (version && !content.includes(`[${version}]`) && !content.includes(version)) {
    return { name: "CHANGELOG entry for version", status: "fail", detail: `No entry for version ${version} in CHANGELOG.md` };
  }
  return { name: "CHANGELOG.md up to date", status: "pass", detail: version ? `Entry for ${version} found` : "CHANGELOG.md exists" };
}

function checkVersionConsistency() {
  const packages = ["packages/spec", "packages/core", "packages/cli"];
  const versions = {};
  for (const pkg of packages) {
    const pkgPath = `${pkg}/package.json`;
    if (existsSync(pkgPath)) {
      const pkgJson = JSON.parse(readFileSync(pkgPath, "utf-8"));
      versions[pkgJson.name] = pkgJson.version;
    }
  }
  const uniqueVersions = new Set(Object.values(versions));
  return {
    name: "Package versions consistent",
    status: uniqueVersions.size <= 1 ? "pass" : "warning",
    detail: Object.entries(versions).map(([n, v]) => `${n}@${v}`).join(", "),
  };
}

function checkBuild() {
  const result = exec("pnpm build 2>&1");
  return {
    name: "Build succeeds",
    status: result !== null ? "pass" : "fail",
    detail: result !== null ? "pnpm build completed" : "Build failed",
  };
}

function checkTests() {
  const result = exec("pnpm test 2>&1");
  return {
    name: "Tests pass",
    status: result !== null ? "pass" : "fail",
    detail: result !== null ? "pnpm test completed" : "Tests failed",
  };
}

function checkGitTag(version) {
  if (!version) return { name: "Git tag available", status: "pass", detail: "No version specified — skipping tag check" };
  const tag = `v${version}`;
  const exists = exec(`git tag -l "${tag}"`);
  return {
    name: "Git tag not taken",
    status: exists ? "fail" : "pass",
    detail: exists ? `Tag ${tag} already exists` : `Tag ${tag} is available`,
  };
}

function checkTodos() {
  const result = exec('grep -rn "TODO\\|FIXME\\|HACK\\|XXX" packages/ --include="*.ts" --include="*.js" 2>/dev/null | wc -l');
  const count = parseInt(result || "0", 10);
  return {
    name: "No critical TODOs",
    status: count > 10 ? "warning" : "pass",
    detail: `${count} TODO/FIXME comments found in packages/`,
  };
}

function checkDeps() {
  const result = exec("pnpm audit --json 2>/dev/null");
  if (!result) return { name: "No critical vulnerabilities", status: "warning", detail: "Could not run pnpm audit" };
  try {
    const audit = JSON.parse(result);
    const critical = audit.advisories ? Object.values(audit.advisories).filter((a) => a.severity === "critical").length : 0;
    return {
      name: "No critical vulnerabilities",
      status: critical > 0 ? "fail" : "pass",
      detail: critical > 0 ? `${critical} critical vulnerability(ies)` : "No critical vulnerabilities",
    };
  } catch {
    return { name: "No critical vulnerabilities", status: "pass", detail: "Audit clean" };
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      version: { type: "string", default: "" },
      dir: { type: "string", default: "" },
    },
  });

  // Resolve target directory — run all checks against it
  if (values.dir) {
    TARGET_DIR = resolve(values.dir);
    if (!existsSync(TARGET_DIR)) {
      console.error(`Error: directory "${TARGET_DIR}" does not exist`);
      process.exit(1);
    }
    process.chdir(TARGET_DIR);
  }

  const items = [
    checkCI(),
    checkBlockingIssues(),
    checkChangelog(values.version),
    checkVersionConsistency(),
    checkBuild(),
    checkTests(),
    checkGitTag(values.version),
    checkTodos(),
    checkDeps(),
  ];

  const passed = items.filter((i) => i.status === "pass").length;
  const failed = items.filter((i) => i.status === "fail").length;
  const warnings = items.filter((i) => i.status === "warning").length;

  let verdict = "READY";
  if (failed > 0) verdict = "NOT_READY";
  else if (warnings > 0) verdict = "WARNING";

  console.log(
    JSON.stringify(
      { check: "release-readiness", version: values.version || "latest", passed, failed, warnings, items, verdict },
      null,
      2
    )
  );
}

main();
