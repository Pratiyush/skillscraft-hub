#!/usr/bin/env node

/**
 * Check license compliance across project dependencies.
 * Run with: node check-licenses.js <project-directory>
 * Uses only Node.js built-in modules (no dependencies).
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const COPYLEFT_LICENSES = new Set([
  "GPL-2.0", "GPL-2.0-only", "GPL-2.0-or-later",
  "GPL-3.0", "GPL-3.0-only", "GPL-3.0-or-later",
  "AGPL-3.0", "AGPL-3.0-only", "AGPL-3.0-or-later",
  "LGPL-2.1", "LGPL-2.1-only", "LGPL-2.1-or-later",
  "LGPL-3.0", "LGPL-3.0-only", "LGPL-3.0-or-later",
  "EUPL-1.1", "EUPL-1.2",
  "MPL-2.0",
]);

const PERMISSIVE_LICENSES = new Set([
  "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause",
  "ISC", "0BSD", "Unlicense", "CC0-1.0", "Zlib",
]);

function getProjectLicense(projectDir) {
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) return null;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  return pkg.license || null;
}

function scanLicenses(projectDir) {
  const nodeModules = join(projectDir, "node_modules");
  if (!existsSync(nodeModules)) {
    return {
      project: projectDir,
      projectLicense: getProjectLicense(projectDir),
      packages: [],
      issues: [{ package: "", license: "", severity: "critical", message: "node_modules/ not found — run npm install first" }],
      summary: { total: 0, permissive: 0, copyleft: 0, unknown: 0, missing: 0 },
    };
  }

  const projectLicense = getProjectLicense(projectDir);
  const packages = [];
  const issues = [];
  let permissive = 0, copyleft = 0, unknown = 0, missing = 0;

  const entries = readdirSync(nodeModules);
  for (const entry of entries) {
    // Handle scoped packages
    const entryPath = join(nodeModules, entry);
    if (!statSync(entryPath).isDirectory()) continue;

    if (entry.startsWith("@")) {
      const scopedEntries = readdirSync(entryPath);
      for (const scoped of scopedEntries) {
        const scopedPath = join(entryPath, scoped);
        if (statSync(scopedPath).isDirectory()) {
          processPackage(`${entry}/${scoped}`, scopedPath);
        }
      }
    } else if (!entry.startsWith(".")) {
      processPackage(entry, entryPath);
    }
  }

  function processPackage(name, pkgDir) {
    const pkgJsonPath = join(pkgDir, "package.json");
    if (!existsSync(pkgJsonPath)) return;

    let license = null;
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
      license = pkg.license || (pkg.licenses && pkg.licenses[0] && pkg.licenses[0].type) || null;
    } catch {
      return;
    }

    packages.push({ name, license: license || "MISSING" });

    if (!license) {
      missing++;
      issues.push({
        package: name,
        license: "MISSING",
        severity: "high",
        message: "No license field in package.json",
      });
    } else if (COPYLEFT_LICENSES.has(license)) {
      copyleft++;
      if (projectLicense && PERMISSIVE_LICENSES.has(projectLicense)) {
        issues.push({
          package: name,
          license,
          severity: "medium",
          message: `Copyleft license "${license}" in a ${projectLicense}-licensed project`,
        });
      }
    } else if (PERMISSIVE_LICENSES.has(license)) {
      permissive++;
    } else {
      unknown++;
      issues.push({
        package: name,
        license,
        severity: "low",
        message: `Unrecognized license "${license}" — review manually`,
      });
    }
  }

  return {
    project: projectDir,
    projectLicense,
    packages,
    issues,
    summary: { total: packages.length, permissive, copyleft, unknown, missing },
  };
}

// Main
const projectDir = process.argv[2];

if (!projectDir || projectDir === "--help") {
  console.error("Usage: node check-licenses.js <project-directory>");
  process.exit(projectDir ? 0 : 1);
}

const result = scanLicenses(resolve(projectDir));
console.log(JSON.stringify(result, null, 2));
process.exit(result.summary.missing > 0 ? 1 : 0);
