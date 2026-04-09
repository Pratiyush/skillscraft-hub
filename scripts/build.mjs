#!/usr/bin/env node

/**
 * build.mjs — SkillsCraft Hub build pipeline.
 *
 * Phase 1: Validate + lint each skill using @skillscraft/core
 * Phase 2: Apply .skillignore and copy clean packages to dist/skills/skill/<name>/
 * Phase 3: Generate dist/index.json + .well-known/agent-skills/index.json,
 *          validate against schemas/discovery-index.schema.json
 * Phase 4: Copy docs/ to dist/ (for GitHub Pages), generate dist/404.html
 * Phase 5: SEO — generate dist/sitemap.xml, dist/robots.txt, copy schema
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
const SCHEMAS_SRC = join(ROOT, "schemas");

// Public site URL — used for sitemap.xml, OG tags, and robots.txt
const SITE_URL = "https://pratiyush.github.io/skillscraft-hub";

const require = createRequire(import.meta.url);
const core = require("@skillscraft/core");
const { parseSkill, validateSkill, lintSkill } = core;

// CLI flags
const args = process.argv.slice(2);
const continueOnError = args.includes("--continue-on-error");
const excludeIdx = args.indexOf("--exclude");
const excludeNames = new Set();
if (excludeIdx !== -1) {
  // Collect all names after --exclude until next flag
  for (let i = excludeIdx + 1; i < args.length && !args[i].startsWith("--"); i++) {
    excludeNames.add(args[i]);
  }
}

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

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function detectLanguagesFromFiles(files) {
  const exts = new Set();
  for (const f of files) {
    const name = f.split("/").pop() || "";
    const idx = name.lastIndexOf(".");
    if (idx >= 0) exts.add(name.slice(idx + 1).toLowerCase());
  }
  const langs = new Set();
  if (exts.has("py")) langs.add("python");
  if (exts.has("java")) langs.add("java");
  if (exts.has("ts") || exts.has("tsx")) langs.add("typescript");
  if (exts.has("js") || exts.has("mjs") || exts.has("cjs")) langs.add("javascript");
  if (exts.has("sh") || exts.has("bash")) langs.add("bash");
  return [...langs];
}

function inferComplexity(files) {
  const dirs = new Set(files.map((f) => f.split("/")[0]));
  const special = ["scripts", "references", "assets", "tests"];
  const count = special.filter((d) => dirs.has(d)).length;
  if (count >= 4) return "beginner"; // hello-skill covers all
  if (count >= 3) return "intermediate";
  return "advanced";
}

function renderSkillPage({ name, description, metadata, license, compatibility, files, totalSize, digest, languages, complexity }) {
  const safeName = escapeHtml(name);
  const safeDesc = escapeHtml(description.replace(/\s+/g, " ").trim());
  const author = escapeHtml(metadata.author || "skillscraft");
  const version = escapeHtml(metadata.version || "1.0");
  const category = escapeHtml(metadata.category || "general");
  const tags = metadata.tags ? String(metadata.tags).split(/\s+/).filter(Boolean) : [];
  const safeLicense = escapeHtml(license || "—");
  const safeCompat = escapeHtml(compatibility || "—");
  const fileCount = files.length;
  const sizeStr = escapeHtml(formatSize(totalSize));
  const safeDigest = escapeHtml(digest);

  const languagesHtml = languages.length
    ? languages.map((l) => `<span class="tag tag-${escapeHtml(l)}">${escapeHtml(l)}</span>`).join("")
    : "";

  const tagsHtml = tags.map((t) => `<span class="tag tag-dir">${escapeHtml(t)}</span>`).join("");

  // File listing
  const fileListHtml = files
    .slice()
    .sort()
    .map((f) => `<li><code>${escapeHtml(f)}</code></li>`)
    .join("");

  // Build install commands per target
  const targets = ["claude", "copilot", "codex", "generic"];
  const installCommands = {};
  for (const t of targets) {
    installCommands[t] = `npm install -g @skillscraft/cli\nskill install ${name} --target ${t}`;
  }

  const installTabsHtml = targets
    .map(
      (t, i) =>
        `<button class="install-tab${i === 0 ? " active" : ""}" role="tab" aria-selected="${i === 0 ? "true" : "false"}" data-tab="${t}">${t === "claude" ? "Claude Code" : t === "copilot" ? "GitHub Copilot" : t === "codex" ? "OpenAI Codex" : "Generic"}</button>`
    )
    .join("\n          ");

  const installPanelsHtml = targets
    .map(
      (t, i) => `<div class="install-panel${i === 0 ? " active" : ""}" id="panel-${t}" role="tabpanel">
            <div class="code-block-wrap">
              <pre class="code-block" id="code-${t}"><span class="c-comment"># Install the CLI</span>
npm install -g @skillscraft/cli

<span class="c-comment"># Install ${safeName} for ${t}</span>
skill install ${safeName} --target ${t}</pre>
              <button class="copy-btn" data-target="${t}" aria-label="Copy to clipboard" title="Copy to clipboard">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
          </div>`
    )
    .join("\n          ");

  const copyTextsJson = JSON.stringify(installCommands);

  const githubUrl = `https://github.com/Pratiyush/skillscraft-hub/tree/master/skills/skill/${name}`;
  const ogUrl = `https://pratiyush.github.io/skillscraft-hub/skills/skill/${name}/`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeName} — SkillsCraft Hub</title>
  <meta name="description" content="${safeDesc}">
  <meta property="og:title" content="${safeName} — SkillsCraft Hub">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${ogUrl}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../../../style.css">
</head>
<body>
  <header class="nav">
    <div class="nav-inner">
      <a href="../../../" class="nav-brand">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        SkillsCraft Hub
      </a>
      <nav class="nav-links" aria-label="Main navigation">
        <a href="../../../">Home</a>
        <a href="../../../gallery.html">Gallery</a>
        <a href="../../../tutorial.html">Tutorial</a>
        <a href="https://github.com/Pratiyush/agentic-skills-framework" target="_blank" rel="noopener noreferrer">SDK</a>
        <a href="https://github.com/Pratiyush/skillscraft-hub" target="_blank" rel="noopener noreferrer" class="nav-github" aria-label="GitHub repository">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        </a>
        <button class="theme-toggle" id="theme-toggle" aria-label="Toggle dark mode">
          <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        </button>
      </nav>
    </div>
  </header>

  <main>
    <section class="hero hero-sm">
      <div class="container">
        <h1 data-skill-name="${safeName}"><code>${safeName}</code></h1>
        <p class="hero-sub" data-skill-description>${safeDesc}</p>
        <div class="skill-tags" data-skill-tags>
          ${languagesHtml}
          <span class="complexity-badge" data-complexity>${escapeHtml(complexity)}</span>
          ${tagsHtml}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <h2 class="section-title">Metadata</h2>
        <table class="skill-meta-table" data-skill-meta>
          <tbody>
            <tr><th>Author</th><td data-author>${author}</td></tr>
            <tr><th>Version</th><td data-version>${version}</td></tr>
            <tr><th>Category</th><td data-category>${category}</td></tr>
            <tr><th>License</th><td data-license>${safeLicense}</td></tr>
            <tr><th>Compatibility</th><td data-compatibility>${safeCompat}</td></tr>
            <tr><th>Files</th><td data-files>${fileCount}</td></tr>
            <tr><th>Size</th><td data-size>${sizeStr}</td></tr>
            <tr><th>Digest</th><td><code data-digest>${safeDigest}</code></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <h2 class="section-title">Install</h2>
        <p class="section-desc">Install <code>${safeName}</code> with one command. Pick your agent.</p>
        <div class="install-tabs" role="tablist" aria-label="Install commands by agent">
          ${installTabsHtml}
        </div>
        <div class="install-panels">
          ${installPanelsHtml}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <h2 class="section-title">Files</h2>
        <p class="section-desc">${fileCount} file${fileCount === 1 ? "" : "s"} in this skill package.</p>
        <ul class="skill-file-list" data-skill-files>
          ${fileListHtml}
        </ul>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <h2 class="section-title">Source</h2>
        <p><a class="btn btn-secondary" href="${githubUrl}" target="_blank" rel="noopener noreferrer" data-github-source>View source on GitHub</a></p>
        <p class="muted"><a href="SKILL.md">View SKILL.md</a></p>
      </div>
    </section>
  </main>

  <footer>
    <div class="container">
      <p><a href="https://github.com/Pratiyush/skillscraft-hub">SkillsCraft Hub</a> &middot; Apache-2.0</p>
    </div>
  </footer>

  <script>
    (function() {
      /* Theme toggle */
      var t = localStorage.getItem('theme');
      if (t) document.documentElement.setAttribute('data-theme', t);
      var btn = document.getElementById('theme-toggle');
      if (btn) btn.addEventListener('click', function() {
        var current = document.documentElement.getAttribute('data-theme');
        var isDark = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
        var next = isDark ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
      });

      /* Install tabs */
      var tabs = document.querySelectorAll('.install-tab');
      tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
          tabs.forEach(function(t) { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
          tab.classList.add('active');
          tab.setAttribute('aria-selected', 'true');
          document.querySelectorAll('.install-panel').forEach(function(p) { p.classList.remove('active'); });
          var panel = document.getElementById('panel-' + tab.getAttribute('data-tab'));
          if (panel) panel.classList.add('active');
        });
      });

      /* Copy to clipboard */
      var copyTexts = ${copyTextsJson};
      document.querySelectorAll('.copy-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var target = btn.getAttribute('data-target');
          var text = copyTexts[target] || '';
          navigator.clipboard.writeText(text).then(function() {
            btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            setTimeout(function() {
              btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            }, 2000);
          });
        });
      });
    })();
  </script>
</body>
</html>
`;
}

// ── Discovery index schema validator ──
// Zero-dependency JSON Schema subset validator. Supports the subset of
// Draft 2020-12 we use in schemas/discovery-index.schema.json (type, required,
// pattern, minLength, minimum, enum, items, properties, $defs/$ref).

function resolveRef(ref, root) {
  if (!ref.startsWith("#/")) {
    throw new Error(`Unsupported $ref: ${ref}`);
  }
  const parts = ref.slice(2).split("/");
  let cur = root;
  for (const p of parts) {
    cur = cur?.[p];
    if (cur === undefined) throw new Error(`$ref not found: ${ref}`);
  }
  return cur;
}

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  return typeof v;
}

function validateValue(value, schema, root, path, errors) {
  // $ref — resolve and recurse
  if (schema.$ref) {
    return validateValue(value, resolveRef(schema.$ref, root), root, path, errors);
  }

  // type — can be a string or an array of allowed types
  if (schema.type) {
    const actual = typeOf(value);
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const matched = allowed.some((t) =>
      t === "number" ? actual === "number" || actual === "integer" : actual === t
    );
    if (!matched) {
      errors.push(`${path}: expected type ${allowed.join("|")}, got ${actual}`);
      return; // downstream checks need the right type
    }
  }

  // enum
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path}: value ${JSON.stringify(value)} not in enum ${JSON.stringify(schema.enum)}`);
  }

  // string-specific
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path}: string shorter than minLength ${schema.minLength}`);
    }
    if (typeof schema.pattern === "string") {
      const re = new RegExp(schema.pattern);
      if (!re.test(value)) {
        errors.push(`${path}: string does not match pattern ${schema.pattern}`);
      }
    }
  }

  // number-specific
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${path}: number less than minimum ${schema.minimum}`);
    }
  }

  // object-specific
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value)) {
          errors.push(`${path}: missing required field '${key}'`);
        }
      }
    }
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in value) {
          validateValue(value[key], propSchema, root, `${path}.${key}`, errors);
        }
      }
    }
  }

  // array-specific
  if (Array.isArray(value) && schema.items) {
    for (let i = 0; i < value.length; i++) {
      validateValue(value[i], schema.items, root, `${path}[${i}]`, errors);
    }
  }
}

function validateAgainstSchema(data, schema) {
  const errors = [];
  validateValue(data, schema, schema, "$", errors);
  return errors;
}

// ── SEO helpers ──

function buildSitemapXml(skillNames, siteUrl, today) {
  const pages = [
    `${siteUrl}/`,
    `${siteUrl}/gallery`,
    `${siteUrl}/tutorial`,
    ...skillNames.map((n) => `${siteUrl}/skills/skill/${n}/`),
  ];

  const urlElements = pages
    .map(
      (url) =>
        `  <url>\n    <loc>${url}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlElements}
</urlset>
`;
}

function buildRobotsTxt(siteUrl) {
  return `User-agent: *
Allow: /
Sitemap: ${siteUrl}/sitemap.xml
`;
}

function buildNotFoundHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 — Skill Not Found — SkillsCraft Hub</title>
  <meta name="description" content="The page you're looking for doesn't exist. Browse the gallery or try a search.">
  <meta name="robots" content="noindex">
  <meta property="og:title" content="404 — Skill Not Found — SkillsCraft Hub">
  <meta property="og:description" content="The page you're looking for doesn't exist. Browse the gallery or try a search.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${SITE_URL}/404.html">
  <meta property="og:site_name" content="SkillsCraft Hub">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="404 — Skill Not Found — SkillsCraft Hub">
  <meta name="twitter:description" content="The page you're looking for doesn't exist.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/skillscraft-hub/style.css">
</head>
<body>
  <header class="nav">
    <div class="nav-inner">
      <a href="/skillscraft-hub/" class="nav-brand">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        SkillsCraft Hub
      </a>
      <nav class="nav-links" aria-label="Main navigation">
        <a href="/skillscraft-hub/">Home</a>
        <a href="/skillscraft-hub/gallery.html">Gallery</a>
        <a href="/skillscraft-hub/tutorial.html">Tutorial</a>
        <a href="https://github.com/Pratiyush/agentic-skills-framework" target="_blank" rel="noopener noreferrer">SDK</a>
        <a href="https://github.com/Pratiyush/skillscraft-hub" target="_blank" rel="noopener noreferrer" class="nav-github" aria-label="GitHub repository">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        </a>
        <button class="theme-toggle" id="theme-toggle" aria-label="Toggle dark mode">
          <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        </button>
      </nav>
    </div>
  </header>

  <main>
    <section class="hero">
      <div class="container">
        <div class="hero-badge">Error 404</div>
        <h1>404 &mdash; Skill Not Found</h1>
        <p class="hero-sub">The page or skill you&rsquo;re looking for doesn&rsquo;t exist. It may have been renamed, moved, or never existed at all.</p>

        <form class="hero-search" action="/skillscraft-hub/gallery.html" method="get" role="search" aria-label="Search skills">
          <svg class="hero-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="search" name="q" class="hero-search-input" placeholder="Search skills in the gallery..." aria-label="Search skills">
          <button type="submit" class="btn btn-primary btn-sm">Search</button>
        </form>

        <div class="hero-actions">
          <a href="/skillscraft-hub/" class="btn btn-primary">Home</a>
          <a href="/skillscraft-hub/gallery.html" class="btn btn-secondary">Browse Gallery</a>
          <a href="/skillscraft-hub/tutorial.html" class="btn btn-secondary">Tutorial</a>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="container">
      <p><a href="https://github.com/Pratiyush/skillscraft-hub">SkillsCraft Hub</a> &middot; Apache-2.0 &middot; Powered by <a href="https://github.com/Pratiyush/agentic-skills-framework">@skillscraft</a></p>
    </div>
  </footer>
  <script>
    (function() {
      var t = localStorage.getItem('theme');
      if (t) document.documentElement.setAttribute('data-theme', t);
      var btn = document.getElementById('theme-toggle');
      if (btn) btn.addEventListener('click', function() {
        var current = document.documentElement.getAttribute('data-theme');
        var isDark = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
        var next = isDark ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
      });
    })();
  </script>
</body>
</html>
`;
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

  const allSkillDirs = readdirSync(SKILLS_SRC, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const skillDirs = allSkillDirs.filter((name) => {
    if (excludeNames.has(name)) {
      console.log(`  ⊘ ${name} (excluded via --exclude)`);
      return false;
    }
    return true;
  });

  if (excludeNames.size > 0) {
    console.log(`  Excluded ${excludeNames.size} skill(s)\n`);
  }

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
    if (continueOnError) {
      console.warn(`\n⚠ ${failed} skill(s) failed validation — continuing (--continue-on-error)`);
    } else {
      console.error(`\n${failed} skill(s) failed validation. Build aborted.`);
      console.error("Use --continue-on-error to skip failed skills, or --exclude <name> to exclude specific skills.");
      process.exit(1);
    }
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

    // Generate per-skill detail HTML page
    const languages = detectLanguagesFromFiles(files);
    const complexity = inferComplexity(files);
    const detailHtml = renderSkillPage({
      name: entry.name,
      description: entry.description,
      metadata: entry.metadata,
      license: entry.license,
      compatibility: entry.compatibility,
      files,
      totalSize,
      digest,
      languages,
      complexity,
    });
    writeFileSync(join(destDir, "index.html"), detailHtml);

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

  // Validate the index against schemas/discovery-index.schema.json before writing
  const schemaPath = join(SCHEMAS_SRC, "discovery-index.schema.json");
  if (!existsSync(schemaPath)) {
    console.error(
      `\nSchema not found at ${schemaPath}. Cannot validate discovery index.`
    );
    process.exit(1);
  }
  const discoverySchema = JSON.parse(readFileSync(schemaPath, "utf-8"));
  const schemaErrors = validateAgainstSchema(index, discoverySchema);
  if (schemaErrors.length > 0) {
    console.error("\n  dist/index.json failed schema validation:");
    for (const err of schemaErrors) console.error(`    ${err}`);
    process.exit(1);
  }
  console.log(`  Validated against schemas/discovery-index.schema.json`);

  // Write to dist root
  writeFileSync(join(DIST, "index.json"), JSON.stringify(index, null, 2));

  // Write to .well-known path
  const wellKnown = join(DIST, ".well-known", "agent-skills");
  mkdirSync(wellKnown, { recursive: true });
  writeFileSync(join(wellKnown, "index.json"), JSON.stringify(index, null, 2));

  console.log(`  dist/index.json (${indexEntries.length} entries)`);
  console.log(`  dist/.well-known/agent-skills/index.json`);

  // Phase 4: Copy docs to dist, generate 404.html
  console.log("\nPhase 4: Copy docs");
  copyDir(DOCS_SRC, DIST);
  console.log(`  Copied docs/ to dist/`);
  writeFileSync(join(DIST, "404.html"), buildNotFoundHtml());
  console.log(`  dist/404.html`);

  // Phase 5: SEO — sitemap, robots, schema
  console.log("\nPhase 5: SEO");
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const skillNames = indexEntries.map((e) => e.name);
  writeFileSync(join(DIST, "sitemap.xml"), buildSitemapXml(skillNames, SITE_URL, today));
  console.log(`  dist/sitemap.xml (${3 + skillNames.length} URLs)`);
  writeFileSync(join(DIST, "robots.txt"), buildRobotsTxt(SITE_URL));
  console.log(`  dist/robots.txt`);
  // Copy schema to dist so the $id URL actually resolves
  const distSchemasDir = join(DIST, "schemas");
  mkdirSync(distSchemasDir, { recursive: true });
  copyFileSync(schemaPath, join(distSchemasDir, "discovery-index.schema.json"));
  console.log(`  dist/schemas/discovery-index.schema.json`);

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
