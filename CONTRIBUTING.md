# Contributing to SkillsCraft Hub

Thank you for your interest in contributing to the SkillsCraft Hub marketplace! This guide explains how to submit skills, report issues, and improve the project.

## Submitting a Skill

### Prerequisites

1. Install the SkillsCraft CLI: `npm install -g @skillscraft/cli`
2. Familiarize yourself with the [Agent Skills specification](https://github.com/Pratiyush/agentic-skills-framework)

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
     skill/       # General-purpose skills
     prompt/      # Prompt templates
     agent/       # Agent configurations
     mcp/         # MCP server skills
   ```

5. **Open a Pull Request** using the PR template.

### Skill Requirements

- Valid `SKILL.md` with complete frontmatter (name, description, version)
- `skill validate` passes with zero errors
- `skill lint` passes with no errors
- `.skillignore` file excludes dev-only files
- Scripts are executable and documented
- Include a clear description of what the skill does and when agents should use it

### Skill Naming

- Use lowercase with hyphens: `my-cool-skill`
- Be descriptive but concise
- Avoid generic names like `utils` or `helper`

## Updating an Existing Skill

1. Fork and create a branch
2. Make your changes
3. Bump the version in SKILL.md frontmatter
4. Run `skill validate` and `skill lint`
5. Open a PR describing the changes

## Reporting Issues

- Use the [GitHub Issues](https://github.com/Pratiyush/skillscraft-hub/issues) page
- For skill submissions, use the "Skill Submission" issue template
- For bugs, include steps to reproduce

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.
