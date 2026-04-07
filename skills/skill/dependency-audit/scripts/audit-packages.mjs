#!/usr/bin/env node

/**
 * Audit project dependencies for staleness and structural issues.
 * Run with: node audit-packages.js <project-directory>
 * Uses only Node.js built-in modules (no dependencies).
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

function detectPackageManager(projectDir) {
  if (existsSync(join(projectDir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(projectDir, "yarn.lock"))) return "yarn";
  if (existsSync(join(projectDir, "package-lock.json"))) return "npm";
  return null;
}

function readPackageJson(projectDir) {
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) return null;
  return JSON.parse(readFileSync(pkgPath, "utf-8"));
}

function auditDependencies(projectDir) {
  const pkg = readPackageJson(projectDir);
  if (!pkg) {
    return {
      project: projectDir,
      packageManager: null,
      totalDependencies: 0,
      issues: [{ package: "", version: "", issue: "missing-package-json", severity: "critical", message: "No package.json found" }],
      summary: { critical: 1, high: 0, medium: 0, low: 0 },
    };
  }

  const pm = detectPackageManager(projectDir);
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const depNames = Object.keys(allDeps);
  const issues = [];

  for (const name of depNames) {
    const version = allDeps[name];

    // Check for wildcard versions
    if (version === "*" || version === "latest") {
      issues.push({
        package: name,
        version,
        issue: "wildcard-version",
        severity: "high",
        message: `Unpinned version "${version}" — pin to a specific range`,
      });
    }

    // Check for git dependencies
    if (version.startsWith("git") || version.startsWith("github:") || version.includes("://")) {
      issues.push({
        package: name,
        version,
        issue: "git-dependency",
        severity: "medium",
        message: "Git dependency — not reproducible, consider publishing to npm",
      });
    }

    // Check for file dependencies
    if (version.startsWith("file:")) {
      issues.push({
        package: name,
        version,
        issue: "file-dependency",
        severity: "low",
        message: "Local file dependency — will not resolve for other contributors",
      });
    }

    // Check installed package metadata
    const installedPkgPath = join(projectDir, "node_modules", name, "package.json");
    if (existsSync(installedPkgPath)) {
      try {
        const installedPkg = JSON.parse(readFileSync(installedPkgPath, "utf-8"));

        // No repository field
        if (!installedPkg.repository) {
          issues.push({
            package: name,
            version: installedPkg.version || version,
            issue: "no-repository",
            severity: "low",
            message: "No repository field in package.json — harder to audit source",
          });
        }

        // Deprecated
        if (installedPkg.deprecated) {
          issues.push({
            package: name,
            version: installedPkg.version || version,
            issue: "deprecated",
            severity: "high",
            message: `Deprecated: ${installedPkg.deprecated}`,
          });
        }
      } catch {
        // Skip unreadable packages
      }
    }
  }

  const summary = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const issue of issues) {
    summary[issue.severity]++;
  }

  return {
    project: projectDir,
    packageManager: pm || "unknown",
    totalDependencies: depNames.length,
    issues,
    summary,
  };
}

// Main
const projectDir = process.argv[2];

if (!projectDir || projectDir === "--help") {
  console.error("Usage: node audit-packages.js <project-directory>");
  process.exit(projectDir ? 0 : 1);
}

const result = auditDependencies(resolve(projectDir));
console.log(JSON.stringify(result, null, 2));
process.exit(result.summary.critical > 0 ? 1 : 0);
