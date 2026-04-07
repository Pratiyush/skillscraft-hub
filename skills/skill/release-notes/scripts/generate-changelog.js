#!/usr/bin/env node

/**
 * generate-changelog.js
 *
 * Generates structured changelog entries from git history.
 * Classifies commits by conventional commit prefixes and groups them
 * into Keep a Changelog sections.
 *
 * Usage:
 *   node generate-changelog.js --from <tag|sha> --to <tag|sha> [--format markdown|github|json]
 *
 * Examples:
 *   node generate-changelog.js --from v0.9.0 --to HEAD
 *   node generate-changelog.js --from v0.8.0 --to v0.9.0 --format github
 */

const { execSync } = require("node:child_process");
const { parseArgs } = require("node:util");

const PREFIXES = {
  "feat:": "added",
  "feat(": "added",
  "add:": "added",
  "fix:": "fixed",
  "fix(": "fixed",
  "refactor:": "changed",
  "refactor(": "changed",
  "perf:": "changed",
  "perf(": "changed",
  "docs:": "documentation",
  "docs(": "documentation",
  "chore:": "maintenance",
  "chore(": "maintenance",
  "ci:": "maintenance",
  "ci(": "maintenance",
  "build:": "maintenance",
  "build(": "maintenance",
  "test:": "maintenance",
  "test(": "maintenance",
};

const GITHUB_EMOJI = {
  added: "✨",
  fixed: "🐛",
  changed: "♻️",
  documentation: "📝",
  maintenance: "🔧",
  breaking: "💥",
  other: "📦",
};

function classifyCommit(message) {
  const lower = message.toLowerCase();
  if (lower.includes("breaking change") || lower.startsWith("!")) {
    return "breaking";
  }
  for (const [prefix, section] of Object.entries(PREFIXES)) {
    if (lower.startsWith(prefix)) return section;
  }
  return "other";
}

function stripPrefix(message) {
  // Remove conventional commit prefix: "feat: message" -> "message"
  // Also handles scoped: "feat(scope): message" -> "message"
  return message
    .replace(/^[a-z]+(\([^)]*\))?[!]?:\s*/i, "")
    .replace(/^BREAKING CHANGE[!]?:\s*/i, "");
}

function getCommits(from, to) {
  const range = from ? `${from}..${to}` : to;
  // Use NUL bytes (%x00) as field delimiter and record separator —
  // safe because NUL cannot appear in git subjects
  const format = "%H%x00%s%x00%an%x00%x1e";
  try {
    const raw = execSync(
      `git log --first-parent --pretty=format:"${format}" ${range}`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    return raw
      .split("\x1e")
      .map((r) => r.trim())
      .filter(Boolean)
      .map((line) => {
        const [hash, subject, author] = line.split("\x00");
        return { hash: (hash || "").slice(0, 8), subject, author };
      });
  } catch {
    console.error(`Error: Could not read git log for range ${range}`);
    process.exit(1);
  }
}

function getVersion() {
  try {
    const tag = execSync("git describe --tags --abbrev=0 2>/dev/null", {
      encoding: "utf-8",
    }).trim();
    return tag.replace(/^v/, "");
  } catch {
    return "unreleased";
  }
}

function formatMarkdown(sections, version, date) {
  const lines = [`## [${version}] - ${date}`, ""];
  const order = [
    "breaking",
    "added",
    "fixed",
    "changed",
    "documentation",
    "maintenance",
    "other",
  ];
  const titles = {
    breaking: "Breaking Changes",
    added: "Added",
    fixed: "Fixed",
    changed: "Changed",
    documentation: "Documentation",
    maintenance: "Maintenance",
    other: "Other",
  };

  for (const key of order) {
    const items = sections[key];
    if (!items || items.length === 0) continue;
    lines.push(`### ${titles[key]}`, "");
    for (const item of items) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function formatGitHub(sections, version, date, commits) {
  const lines = [`# ${version} (${date})`, ""];
  const order = [
    "breaking",
    "added",
    "fixed",
    "changed",
    "documentation",
    "maintenance",
    "other",
  ];
  const titles = {
    breaking: "Breaking Changes",
    added: "New Features",
    fixed: "Bug Fixes",
    changed: "Improvements",
    documentation: "Documentation",
    maintenance: "Maintenance",
    other: "Other",
  };

  for (const key of order) {
    const items = sections[key];
    if (!items || items.length === 0) continue;
    const emoji = GITHUB_EMOJI[key] || "";
    lines.push(`## ${emoji} ${titles[key]}`, "");
    for (const item of items) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  // Add contributors
  const authors = [...new Set(commits.map((c) => c.author))];
  if (authors.length > 0) {
    lines.push("## Contributors", "");
    for (const author of authors) {
      lines.push(`- ${author}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function main() {
  const { values } = parseArgs({
    options: {
      from: { type: "string", default: "" },
      to: { type: "string", default: "HEAD" },
      format: { type: "string", default: "markdown" },
    },
  });

  const commits = getCommits(values.from, values.to);

  if (commits.length === 0) {
    console.error("No commits found in the specified range.");
    process.exit(0);
  }

  // Group commits by section
  const sections = {};
  for (const commit of commits) {
    const section = classifyCommit(commit.subject);
    const cleaned = stripPrefix(commit.subject);
    const entry = `${cleaned} (\`${commit.hash}\`)`;
    if (!sections[section]) sections[section] = [];
    sections[section].push(entry);
  }

  const version = getVersion();
  const date = new Date().toISOString().split("T")[0];

  switch (values.format) {
    case "json":
      console.log(JSON.stringify({ version, date, sections }, null, 2));
      break;
    case "github":
      console.log(formatGitHub(sections, version, date, commits));
      break;
    default:
      console.log(formatMarkdown(sections, version, date));
  }
}

main();
