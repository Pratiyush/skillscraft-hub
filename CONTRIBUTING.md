# Contributing to SkillsCraft Hub

Thank you for your interest in contributing to the SkillsCraft Hub marketplace! This guide explains how to submit skills, report issues, and improve the project.

## Submitting a Skill

### Prerequisites

> **Note:** `@skillscraft/cli` is not yet published to npm. For now, validation is handled by the build pipeline (`pnpm build`) which uses `@skillscraft/core` as a devDependency. You do not need to install the CLI separately.

1. Familiarize yourself with the [Agent Skills specification](https://github.com/Pratiyush/agentic-skills-framework)

### Steps

1. **Create your skill** using the scaffold command:
   ```bash
   skill init my-skill
   ```

2. **Develop and test** your skill locally:
   ```bash
   skill validate my-skill/
   skill lint my-skill/
   ```

3. **Fork this repository** and create a branch:
   ```bash
   git checkout -b add/my-skill
   ```

4. **Copy your skill** into the appropriate category:
   ```
   skills/
     skill/       # General-purpose skills (active — accepting submissions)
     prompt/      # Prompt templates (planned — spec and examples only)
     agent/       # Agent configurations (planned — spec and examples only)
     mcp/         # MCP server skills (planned — spec and examples only)
   ```

5. **Open a Pull Request** using the PR template.

### Skill Requirements

- Valid `SKILL.md` with complete frontmatter (required: `name`, `description`; optional: `compatibility`, `license`, `metadata`, `allowed-tools`)
- `skill validate` passes with zero errors
- `skill lint` passes with no errors
- `.skillignore` file excludes dev-only files (see format below)
- Scripts are executable and documented

#### `.skillignore` format

`.skillignore` follows `.gitignore` syntax — one pattern per line, `#` for comments, blank lines ignored.

Common patterns:
- `*.test.*` — exclude test files
- `*.spec.*` — exclude spec files
- `examples/` — exclude examples directory
- `__tests__/` — exclude test directory
- `.env` — exclude environment files

If no `.skillignore` is present, a sensible default set is applied automatically during build.

- Include a clear description of what the skill does and when agents should use it

### Skill Naming

- Use lowercase with hyphens: `my-cool-skill`
- Be descriptive but concise
- Avoid generic names like `utils` or `helper`

## Updating an Existing Skill

1. Fork and create a branch
2. Make your changes
3. Run `pnpm build` to validate
4. Open a PR describing the changes

## Reporting Issues

- Use the [GitHub Issues](https://github.com/Pratiyush/skillscraft-hub/issues) page
- For skill submissions, use the "Skill Submission" issue template
- For bugs, include steps to reproduce

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.
