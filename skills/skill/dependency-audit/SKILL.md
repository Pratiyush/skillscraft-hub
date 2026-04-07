---
name: dependency-audit
description: >
  Audit project dependencies for known vulnerabilities, outdated packages,
  and license compliance issues.
  Use when the user asks to check dependencies, audit packages, review
  licenses, or assess supply chain security.
license: Apache-2.0
compatibility: Requires Node.js 22+
metadata:
  author: skillscraft
  version: "1.0"
  category: security
allowed-tools: Bash Read
---

# Dependency Audit

## When to use this skill

Activate when the user wants to:
- Audit npm dependencies for vulnerabilities or outdated versions
- Check license compliance across the dependency tree
- Assess supply chain risk before adding a new dependency

## Instructions

1. For vulnerability and staleness checks, run:
   ```
   node scripts/audit-packages.mjs <project-directory>
   ```
2. For license compliance, run:
   ```
   node scripts/check-licenses.mjs <project-directory>
   ```
3. Parse the JSON output from each script
4. Present findings sorted by severity: critical > high > medium > low
5. Suggest specific remediation steps for each issue

## Output format

The audit script outputs:

```json
{
  "project": "./my-app",
  "packageManager": "npm",
  "totalDependencies": 42,
  "issues": [
    {
      "package": "lodash",
      "version": "4.17.15",
      "issue": "outdated",
      "severity": "medium",
      "message": "Current: 4.17.15, no repository field in package.json"
    }
  ],
  "summary": { "critical": 0, "high": 0, "medium": 1, "low": 2 }
}
```

## Gotchas

- Only supports npm, yarn, and pnpm (reads `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml`)
- Does not fetch live vulnerability data from remote APIs — analyzes lock file structure and package metadata locally
- License check walks `node_modules/` — run `npm install` first if modules are missing
- GPL-family licenses are flagged as warnings in MIT/Apache projects, not errors
