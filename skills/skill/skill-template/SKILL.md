---
name: skill-template
description: >
  Scaffold new Agent Skills with best-practice structure and frontmatter.
  Use when the user wants to create a new skill, bootstrap a skill directory,
  or generate SKILL.md boilerplate following the Agent Skills spec.
license: MIT
compatibility: Node.js 22+
metadata:
  author: skillscraft
  version: "1.0"
  category: tooling
allowed-tools: Bash Read Write
---

# Skill Template Generator

## When to use this skill

Activate when the user wants to:
- Create a new Agent Skill from scratch
- Bootstrap a skill directory with proper structure
- Generate SKILL.md boilerplate with valid frontmatter
- Scaffold scripts/, references/, assets/, or tests/ subdirectories

## Instructions

### Quick scaffold

1. Ask the user for: skill name, short description, and which optional directories they need
2. Run the scaffold script:
   ```
   node scripts/scaffold.js --name <skill-name> --desc "<description>" [--dirs scripts,references,assets,tests]
   ```
3. The script creates the full directory structure with template files
4. Walk the user through customising the generated SKILL.md body

### Interactive mode

If the user is unsure what they need, ask these questions in order:

1. **What does this skill do?** → becomes the `description` field
2. **Does it need executable scripts?** → adds `scripts/` with a starter script
3. **Does it need reference docs?** → adds `references/` with a template
4. **Does it need static assets?** → adds `assets/`
5. **Should it include test scenarios?** → adds `tests/scenarios.json`
6. **Which tools should agents use?** → sets `allowed-tools`
7. **Any runtime requirements?** → sets `compatibility`
8. **License?** → defaults to MIT

### Validating the result

After scaffolding, always validate:
```
skill validate <output-dir>/SKILL.md
skill lint <output-dir>/SKILL.md
```

Fix any issues before the user starts editing.

## Name rules

Skill names must:
- Be 1-64 characters
- Match `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`
- Use lowercase letters, digits, and hyphens only
- Not start or end with a hyphen

Valid: `code-review`, `test-gen`, `my-skill-v2`
Invalid: `Code-Review`, `-bad-start`, `has_underscores`, `UPPERCASE`

## Output structure

```
<skill-name>/
  SKILL.md              # Always created
  scripts/              # If --dirs includes scripts
    run.sh              #   Starter bash script
  references/           # If --dirs includes references
    GUIDE.md            #   Template reference doc
  assets/               # If --dirs includes assets
    .gitkeep            #   Placeholder
  tests/                # If --dirs includes tests
    scenarios.json      #   Empty test scenarios array
```

## Gotchas

- Skill name must match the directory name — the script enforces this
- Description must include "Use when" for best lint score
- Keep SKILL.md body under 500 lines for optimal agent performance
- The `allowed-tools` field accepts space-separated tool names (e.g., `Bash Read Write`)
- If the user wants Python/Java/TS scripts, update the starter script language after scaffolding
