# Project Rules — SkillsCraft Hub

## Build & Tooling

- Use latest GPG for commit signing (`brew install gnupg` or system package manager)
- pnpm version is pinned via `packageManager` field — update it when upgrading pnpm
- Minimum Node version is 20.0.0 — do not raise without justification
- Run `pnpm build && pnpm test` before pushing

## Build Pipeline

- `build.mjs` runs 5 phases: validate → copy → generate index → copy docs → SEO
- Use `--continue-on-error` to skip failed skills during build
- Use `--exclude <name>` to exclude specific skills from the build
- Security scanner (`security-scan.mjs`) runs 13 rules — critical/high findings fail the build

## Code Quality

- ESLint 9+ flat config — run `pnpm lint` before committing
- Prettier formatting is enforced — run `pnpm format` before committing
- Skill scripts use their own language toolchains (Java, Python, etc.)

## Skills

- Skills live in `skills/skill/<name>/` with a `SKILL.md` frontmatter + markdown body
- `.skillignore` controls which files are excluded from distribution
- Validation output shows lint rule IDs for actionable debugging

## GitHub Pages

- Docs live in `docs/` and deploy via `.github/workflows/pages.yml`
- Static pages: index.html (landing), gallery.html (browser), tutorial.html (guide)
- Update docs when adding skills or changing build features

## PR Workflow

- Create GitHub issues before implementing fixes
- Branch naming: `fix/`, `feat/`, `chore/` prefixes
- Let CI pipeline pass before merging
- Update changelog and release notes with every PR
