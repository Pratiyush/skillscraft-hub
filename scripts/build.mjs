#!/usr/bin/env node

/**
 * build.mjs — SkillsCraft Hub build pipeline.
 *
 * 1. Discovers all skills in skills/
 * 2. Validates + lints each skill using @skillscraft/core
 * 3. Applies .skillignore to filter deployable files
 * 4. Copies clean packages to dist/skills/skill/<name>/
 * 5. Generates dist/index.json (discovery endpoint)
 * 6. Copies docs/ to dist/ (for GitHub Pages)
 * 7. Generates dist/.well-known/agent-skills/index.json
 *
 * Exits with code 1 if any skill fails validation.
 */

import {
  readdirSync,
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  statSync,
  rmSync,
} from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const DIST = join(ROOT, "dist");
const SKILLS_SRC = join(ROOT, "skills", "skill");
const DOCS_SRC = join(ROOT, "docs");

const require = createRequire(import.meta.url);
const core = require("@skillscraft/core");
const { parseSkill, validateSkill, lintSkill } = core;

// skillignore — inline implementation (SDK exports these in >=0.10, not in 0.9.0)
const DEFAULT_IGNORE = [
  "CODEOWNERS", "CHANGELOG.md", "CHANGELOG", "RELEASE-NOTES.md",
  "CONTRIBUTING.md", "CONTRIBUTORS.md", "LICENSE-HEADER",
  ".github/", ".git/", ".gitignore", ".skillignore",
  "node_modules/", "coverage/", "*.log", "*.tsbuildinfo",
  ".DS_Store", ".turbo/", ".env", ".env.*",
  "examples/", "__tests__/", "*.test.*", "*.spec.*",
  "jest.config.*", "vitest.config.*",
];

function loadSkillIgnore(skillDir) {
  const ignorePath = join(skillDir, ".skillignore");
  if (existsSync(ignorePath)) {
    return readFileSync(ignorePath, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  }
  return [...DEFAULT_IGNORE];
}

function isIgnored(relPath, patterns) {
  const name = relPath.split("/").pop();
  if (name === "SKILL.md") return false; // never ignore
  for (const p of patterns) {
    if (p.endsWith("/")) {
      const dir = p.slice(0, -1);
      if (relPath === dir || relPath.startsWith(dir + "/") || relPath.includes("/" + dir + "/")) return true;
    } else if (p.startsWith("*")) {
      const suffix = p.slice(1);
      if (suffix.endsWith(".*")) {
        if (name.includes(suffix.slice(0, -2))) return true;
      } else if (name.endsWith(suffix)) return true;
    } else if (p.endsWith(".*")) {
      const prefix = p.slice(0, -2);
      if (name === prefix || name.startsWith(prefix + ".")) return true;
    } else if (name === p || relPath === p) return true;
  }
  return false;
}

// ── Helpers ──

function walkDir(dir, root) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    if (entry.isDirectory()) {
      results.push(...walkDir(full, root));
    } else {
      results.push(relative(root, full));
    }
  }
  return results;
}

function sha256(filePath) {
  const data = readFileSync(filePath);
  return "sha256:" + createHash("sha256").update(data).digest("hex");
}

function copyFileSafe(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

function copyDirFiltered(srcDir, destDir, ignorePatterns) {
  const allFiles = walkDir(srcDir, srcDir);
  const included = allFiles.filter((f) => !isIgnored(f, ignorePatterns));
  let totalSize = 0;

  for (const relPath of included) {
    const src = join(srcDir, relPath);
    const dest = join(destDir, relPath);
    copyFileSafe(src, dest);
    totalSize += statSync(src).size;
  }

  return { files: included, totalSize };
}

function copyDir(src, dest) {
  if (!existsSync(src)) return;
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      copyFileSafe(srcPath, destPath);
    }
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// ── Main ──

async function main() {
  console.log("SkillsCraft Hub — Build Pipeline\n");

  // Clean dist/
  if (existsSync(DIST)) {
    rmSync(DIST, { recursive: true });
  }
  mkdirSync(DIST, { recursive: true });

  // Discover skills
  if (!existsSync(SKILLS_SRC)) {
    console.error("No skills/skill/ directory found.");
    process.exit(1);
  }

  const skillDirs = readdirSync(SKILLS_SRC, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  console.log(`Found ${skillDirs.length} skill(s)\n`);

  // Phase 1: Validate all skills
  console.log("Phase 1: Validate");
  const validated = [];
  let failed = 0;

  for (const name of skillDirs) {
    const skillDir = join(SKILLS_SRC, name);
    const skillMdPath = join(skillDir, "SKILL.md");

    if (!existsSync(skillMdPath)) {
      console.log(`  \u2717 ${name} — missing SKILL.md`);
      failed++;
      continue;
    }

    try {
      const skill = await parseSkill(skillMdPath);
      const validation = validateSkill(skill);
      const lint = lintSkill(skill);

      if (!validation.valid) {
        console.log(`  \u2717 ${name}`);
        for (const err of validation.errors) {
          console.log(`    [${err.severity}] ${err.message}`);
        }
        failed++;
        continue;
      }

      const lintIssues = lint.diagnostics.length;
      console.log(
        `  \u2713 ${name}${lintIssues > 0 ? ` (${lintIssues} lint warning(s))` : ""}`
      );

      validated.push({
        name,
        skill,
        dir: skillDir,
        description: skill.frontmatter.description,
        license: skill.frontmatter.license || null,
        compatibility: skill.frontmatter.compatibility || null,
        metadata: skill.frontmatter.metadata || {},
        allowedTools: skill.frontmatter["allowed-tools"] || null,
      });
    } catch (err) {
      console.log(`  \u2717 ${name} — ${err.message}`);
      failed++;
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} skill(s) failed validation. Build aborted.`);
    process.exit(1);
  }

  console.log(`\n${validated.length} skill(s) validated\n`);

  // Phase 2: Build dist packages (apply .skillignore)
  console.log("Phase 2: Build distribution");
  const distSkillsDir = join(DIST, "skills", "skill");
  mkdirSync(distSkillsDir, { recursive: true });

  const indexEntries = [];

  for (const entry of validated) {
    const destDir = join(distSkillsDir, entry.name);
    const ignorePatterns = loadSkillIgnore(entry.dir);
    const { files, totalSize } = copyDirFiltered(
      entry.dir,
      destDir,
      ignorePatterns
    );

    // Cloudflare RFC v0.2.0: entries are either "skill-md" (single file)
    // or "archive" (multi-file). The URL points to the artifact, and digest
    // is SHA256 of that artifact's raw bytes.
    const isArchive = files.length > 1;
    const type = isArchive ? "archive" : "skill-md";
    const url = isArchive
      ? `skills/skill/${entry.name}/`
      : `skills/skill/${entry.name}/SKILL.md`;
    const digest = sha256(join(destDir, "SKILL.md"));

    console.log(
      `  ${entry.name}: ${files.length} files, ${formatSize(totalSize)}`
    );

    indexEntries.push({
      name: entry.name,
      type,
      description: entry.description.replace(/\n/g, " ").trim(),
      url,
      digest,
      version: entry.metadata.version || "1.0",
      author: entry.metadata.author || "skillscraft",
      category: entry.metadata.category || "general",
      license: entry.license,
      compatibility: entry.compatibility,
      files: files.length,
      size: totalSize,
    });
  }

  console.log(`\n${validated.length} package(s) built\n`);

  // Phase 3: Generate discovery index
  console.log("Phase 3: Generate index");

  // Cloudflare RFC v0.2.0-compliant discovery index
  const index = {
    $schema: "https://pratiyush.github.io/skillscraft-hub/schemas/discovery/v1/schema.json",
    name: "skillscraft-hub",
    description:
      "Official SkillsCraft marketplace — skills, prompts, agents, MCP",
    generated: new Date().toISOString(),
    stats: {
      skills: validated.length,
      categories: 1,
      languages: [
        ...new Set(
          validated.flatMap((e) => {
            const m = e.metadata;
            return m.tags ? m.tags.split(/\s+/) : [];
          })
        ),
      ],
    },
    skills: indexEntries,
  };

  // Write to dist root
  writeFileSync(join(DIST, "index.json"), JSON.stringify(index, null, 2));

  // Write to .well-known path
  const wellKnown = join(DIST, ".well-known", "agent-skills");
  mkdirSync(wellKnown, { recursive: true });
  writeFileSync(join(wellKnown, "index.json"), JSON.stringify(index, null, 2));

  console.log(`  dist/index.json (${indexEntries.length} entries)`);
  console.log(`  dist/.well-known/agent-skills/index.json`);

  // Phase 4: Copy docs to dist
  console.log("\nPhase 4: Copy docs");
  copyDir(DOCS_SRC, DIST);
  console.log(`  Copied docs/ to dist/`);

  // Summary
  console.log("\n════════════════════════════════════════");
  console.log(`  Build complete`);
  console.log(`  ${validated.length} skills packaged`);
  console.log(`  ${indexEntries.reduce((s, e) => s + e.files, 0)} total files`);
  console.log(
    `  ${formatSize(indexEntries.reduce((s, e) => s + e.size, 0))} total size`
  );
  console.log(`  Output: dist/`);
  console.log("════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Build error:", err);
  process.exit(1);
});
