# SkillsCraft Hub

Marketplace for AI Agent Skills, Prompts, Agents, and MCP servers.

[![CI](https://img.shields.io/github/actions/workflow/status/Pratiyush/skillscraft-hub/ci.yml?style=flat-square&label=CI)](https://github.com/Pratiyush/skillscraft-hub/actions)
[![Skills](https://img.shields.io/badge/skills-8-7C3AED?style=flat-square)](https://pratiyush.github.io/skillscraft-hub/gallery)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](LICENSE)

## Browse Skills

Visit the **[Skill Gallery](https://pratiyush.github.io/skillscraft-hub/gallery)** or the **[Tutorial](https://pratiyush.github.io/skillscraft-hub/tutorial)**.

## Install a Skill

```bash
# Install the CLI
npm install -g @skillscraft/cli

# Install a skill for Claude Code
skill install skills/skill/project-maintenance --target claude

# Install for GitHub Copilot
skill install skills/skill/release-notes --target copilot

# Install for any agent
skill install skills/skill/hello-skill --target generic
```

## Available Skills

| Skill | Description | Language | Complexity |
|-------|-------------|----------|------------|
| [project-maintenance](skills/skill/project-maintenance) | PR checklists, issue tracking, release readiness | JavaScript | Advanced |
| [release-notes](skills/skill/release-notes) | Changelog generation from git history | JavaScript | Intermediate |
| [skill-template](skills/skill/skill-template) | Scaffold new skills with best practices | JavaScript | Beginner |
| [hello-skill](skills/skill/hello-skill) | Tutorial example covering every spec feature | JavaScript | Beginner |
| [data-validation](skills/skill/data-validation) | Validate CSV/JSON against schemas | Python | Intermediate |
| [code-quality](skills/skill/code-quality) | Java code quality analysis | Java | Intermediate |
| [test-generator](skills/skill/test-generator) | Generate test stubs from source | TypeScript | Advanced |
| [dependency-audit](skills/skill/dependency-audit) | Audit dependencies for vulnerabilities | JavaScript | Intermediate |

## Categories

| Category | Status | Description |
|----------|--------|-------------|
| **Skills** | Active | SKILL.md instruction sets for AI agents |
| **Prompts** | Planned | Click-to-copy prompt templates |
| **Agents** | Planned | Pre-configured agent definitions |
| **MCP** | Planned | MCP server configurations |

## Submit a Skill

1. Fork this repo
2. Create `skills/skill/<your-skill-name>/SKILL.md`
3. Run `skill validate` and `skill lint`
4. Open a PR

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Compatibility

| Hub version | Framework version | Node.js |
|-------------|-------------------|---------|
| latest      | @skillscraft/core ^0.9.0 | >= 20.0.0 |

The hub uses `@skillscraft/core` for build-time validation. Check `package.json` for the exact version constraint.

## Powered By

Built with the [Agentic Skills Framework](https://github.com/Pratiyush/agentic-skills-framework) (`@skillscraft/spec`, `@skillscraft/core`, `@skillscraft/cli`).

## License

Apache-2.0
