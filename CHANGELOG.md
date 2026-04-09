# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-04-09

### Added

- `--continue-on-error` flag for `build.mjs` to skip failed skills (#24)
- `--exclude <name>` flag for `build.mjs` to exclude specific skills (#24)
- Lint rule IDs in `validate-skills.mjs` output for actionable debugging (#25)
- CLAUDE.md project rules

### Fixed

- Upgrade pnpm from 10.8.1 to 10.30.3 (unblocks corporate proxies) (#22)
- Relax `engines.node` from `>=22` to `>=20` for broader compatibility (#23)
