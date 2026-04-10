#!/usr/bin/env bash
set -euo pipefail

# add-skill.sh — Automated skill addition pipeline for Agent Catalog
# Usage: ./scripts/add-skill.sh <source-path-or-url> [options]
#
# Options:
#   --name <name>           Override skill name (default: directory name)
#   --category <cat>        Category: skill|prompt|agent|mcp (default: skill)
#   --type <type>            Alias for --category
#   --license <license>     Set license in frontmatter
#   --auto-fix              Auto-fix common issues
#   --add-skillignore       Generate default .skillignore
#   --add-gitignore         Add skill to root .gitignore
#   --dry-run               Preview without making changes
#   --validate-only         Only validate, don't copy
#   --force                 Overwrite existing skill
#   --help                  Show this help

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

# Defaults
CATEGORY="skill"
LICENSE=""
AUTO_FIX=false
ADD_SKILLIGNORE=false
ADD_GITIGNORE=false
DRY_RUN=false
VALIDATE_ONLY=false
FORCE=false
SKILL_NAME=""

usage() {
  head -15 "$0" | tail -14 | sed 's/^# //' | sed 's/^#//'
  exit 0
}

# Parse args
SOURCE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) SKILL_NAME="$2"; shift 2 ;;
    --category) CATEGORY="$2"; shift 2 ;;
    --type) CATEGORY="$2"; shift 2 ;;
    --license) LICENSE="$2"; shift 2 ;;
    --auto-fix) AUTO_FIX=true; shift ;;
    --add-skillignore) ADD_SKILLIGNORE=true; shift ;;
    --add-gitignore) ADD_GITIGNORE=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --validate-only) VALIDATE_ONLY=true; shift ;;
    --force) FORCE=true; shift ;;
    --help|-h) usage ;;
    -*) echo "Unknown option: $1"; exit 1 ;;
    *) SOURCE="$1"; shift ;;
  esac
done

if [[ -z "$SOURCE" ]]; then
  echo "Error: No source path provided."
  echo "Usage: ./scripts/add-skill.sh <source-path> [options]"
  exit 1
fi

# Step 1: Resolve source
echo "Step 1: Resolve source"
if [[ "$SOURCE" == https://github.com/* ]]; then
  TEMP_DIR=$(mktemp -d)
  echo "  Cloning $SOURCE..."
  git clone --depth 1 "$SOURCE" "$TEMP_DIR" 2>/dev/null
  SOURCE_DIR="$TEMP_DIR"
elif [[ -d "$SOURCE" ]]; then
  SOURCE_DIR="$(cd "$SOURCE" && pwd)"
else
  echo "Error: Source '$SOURCE' is not a directory or GitHub URL."
  exit 1
fi

# Step 2: Detect skill name
echo "Step 2: Detect skill"
if [[ -z "$SKILL_NAME" ]]; then
  SKILL_NAME="$(basename "$SOURCE_DIR")"
fi
echo "  Name: $SKILL_NAME"
echo "  Category: $CATEGORY"

# Determine the manifest file based on category
case "$CATEGORY" in
  skill) MANIFEST_FILE="SKILL.md" ;;
  prompt) MANIFEST_FILE="PROMPT.md" ;;
  agent) MANIFEST_FILE="AGENT.md" ;;
  mcp) MANIFEST_FILE="MCP.json" ;;
  *) echo "Error: Unknown category '$CATEGORY'"; exit 1 ;;
esac

DEST_DIR="$ROOT/skills/$CATEGORY/$SKILL_NAME"

# Step 3: Validate manifest exists
echo "Step 3: Validate"
if [[ ! -f "$SOURCE_DIR/$MANIFEST_FILE" ]]; then
  if [[ "$AUTO_FIX" == true && "$CATEGORY" == "skill" ]]; then
    echo "  ⚠ No SKILL.md found — generating from directory name"
    cat > "$SOURCE_DIR/SKILL.md" <<SKILLEOF
---
name: $SKILL_NAME
description: $SKILL_NAME skill
---

# $SKILL_NAME

TODO: Add skill instructions.
SKILLEOF
  else
    echo "  ✗ No $MANIFEST_FILE found in $SOURCE_DIR"
    exit 1
  fi
fi

# Step 4: Validate frontmatter
echo "Step 4: Validate frontmatter"
if [[ "$CATEGORY" == "skill" || "$CATEGORY" == "prompt" ]]; then
  if ! head -1 "$SOURCE_DIR/$MANIFEST_FILE" | grep -q "^---"; then
    echo "  ✗ No frontmatter found in $MANIFEST_FILE"
    exit 1
  fi
  if ! grep -q "^name:" "$SOURCE_DIR/$MANIFEST_FILE"; then
    echo "  ✗ Missing 'name' field in frontmatter"
    exit 1
  fi
  if ! grep -q "^description:" "$SOURCE_DIR/$MANIFEST_FILE"; then
    echo "  ✗ Missing 'description' field in frontmatter"
    exit 1
  fi
  echo "  ✓ Frontmatter valid"
fi

# Step 5: Generate .skillignore if requested or missing
echo "Step 5: Check .skillignore"
if [[ "$ADD_SKILLIGNORE" == true || ! -f "$SOURCE_DIR/.skillignore" ]]; then
  if [[ "$ADD_SKILLIGNORE" == true || "$AUTO_FIX" == true ]]; then
    cat > "$SOURCE_DIR/.skillignore" <<'IGNEOF'
# Auto-generated .skillignore
node_modules/
.git/
.github/
__pycache__/
*.pyc
coverage/
*.log
*.tsbuildinfo
.DS_Store
.turbo/
.env
.env.*
examples/
__tests__/
*.test.*
*.spec.*
jest.config.*
vitest.config.*
IGNEOF
    echo "  ✓ Generated default .skillignore"
  else
    echo "  ⚠ No .skillignore (default patterns will apply during build)"
  fi
fi

if [[ "$VALIDATE_ONLY" == true ]]; then
  echo ""
  echo "✓ Validation passed (--validate-only mode)"
  exit 0
fi

# Step 6: Check destination
echo "Step 6: Check destination"
if [[ -d "$DEST_DIR" && "$FORCE" != true ]]; then
  echo "  ✗ Skill already exists at $DEST_DIR"
  echo "  Use --force to overwrite."
  exit 1
fi

if [[ "$DRY_RUN" == true ]]; then
  echo ""
  echo "Dry run — would copy:"
  echo "  From: $SOURCE_DIR"
  echo "  To:   $DEST_DIR"
  echo "  Files: $(find "$SOURCE_DIR" -type f | wc -l | tr -d ' ')"
  exit 0
fi

# Step 7: Copy skill
echo "Step 7: Copy to catalog"
mkdir -p "$DEST_DIR"
cp -R "$SOURCE_DIR"/* "$DEST_DIR/" 2>/dev/null || true
cp "$SOURCE_DIR"/.[!.]* "$DEST_DIR/" 2>/dev/null || true
# Remove .git from copied skill
rm -rf "$DEST_DIR/.git"
echo "  ✓ Copied to $DEST_DIR"

# Step 8: Run validation
echo "Step 8: Run validation"
if command -v node &>/dev/null; then
  node "$SCRIPT_DIR/validate-skills.mjs" 2>&1 | tail -5
else
  echo "  ⚠ Node.js not found — skipping validation"
fi

echo ""
echo "════════════════════════════════════════"
echo "  ✓ Skill '$SKILL_NAME' added to agent-catalog"
echo "  Category: $CATEGORY"
echo "  Location: $DEST_DIR"
echo "════════════════════════════════════════"
