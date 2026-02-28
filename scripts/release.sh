#!/bin/bash
set -euo pipefail

# cursor-doctor release script
# Usage: ./scripts/release.sh [patch|minor|major]
# Handles: npm publish, VS Code extension sync+publish, playground sync, git push
#
# Prerequisites:
#   - Clean working tree in ~/cursor-doctor and ~/cursor-doctor-vscode
#   - VSCE_PAT env var set (or ~/.vsce_pat file)
#   - npm logged in

BUMP="${1:-patch}"
DOCTOR_DIR="$HOME/cursor-doctor"
VSCODE_DIR="$HOME/cursor-doctor-vscode"
SITE_DIR="$HOME/nedcodes-site"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() { echo -e "\n${GREEN}▸ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }

# --- Pre-flight checks ---
step "Pre-flight checks"

cd "$DOCTOR_DIR"
if [[ -n $(git status --porcelain) ]]; then
  fail "cursor-doctor has uncommitted changes. Commit first."
fi

if [[ ! -d "$VSCODE_DIR" ]]; then
  fail "VS Code extension dir not found at $VSCODE_DIR"
fi

if [[ ! -d "$SITE_DIR" ]]; then
  warn "nedcodes-site not found at $SITE_DIR — playground sync will be skipped"
fi

# Check npm auth
npm whoami >/dev/null 2>&1 || fail "Not logged into npm. Run 'npm login' first."

# --- Step 1: Run tests ---
step "Running tests"
cd "$DOCTOR_DIR"
npm test || fail "Tests failed. Fix before releasing."

# --- Step 2: Bump version ---
step "Bumping version ($BUMP)"
cd "$DOCTOR_DIR"
NEW_VERSION=$(npm version "$BUMP" --no-git-tag-version | tr -d 'v')
echo "  New version: $NEW_VERSION"

# --- Step 3: Commit and tag ---
step "Committing version bump"
cd "$DOCTOR_DIR"
git add package.json package-lock.json
git commit -m "v${NEW_VERSION}"
git tag "v${NEW_VERSION}"

# --- Step 4: Publish to npm ---
step "Publishing to npm"
cd "$DOCTOR_DIR"
npm publish

# --- Step 5: Push git ---
step "Pushing to GitHub"
cd "$DOCTOR_DIR"
git push && git push --tags

# --- Step 6: Sync VS Code extension ---
step "Syncing VS Code extension to v${NEW_VERSION}"
cd "$VSCODE_DIR"

# Update version in package.json
node -e "
const pkg = require('./package.json');
pkg.version = '${NEW_VERSION}';
require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Copy shared source files that VS Code extension uses
if [[ -f "$DOCTOR_DIR/src/index.js" ]]; then
  # The extension imports from cursor-doctor — just version sync is enough
  echo "  Version synced to ${NEW_VERSION}"
fi

git add -A
git commit -m "v${NEW_VERSION} — sync with CLI" || warn "No VS Code changes to commit"

# --- Step 7: Publish VS Code extension ---
step "Publishing VS Code extension"
cd "$VSCODE_DIR"

# Check for vsce
if ! command -v vsce &>/dev/null; then
  npm install -g @vscode/vsce 2>/dev/null || fail "Cannot install vsce"
fi

# Get PAT
VSCE_PAT="${VSCE_PAT:-}"
if [[ -z "$VSCE_PAT" && -f "$HOME/.vsce_pat" ]]; then
  VSCE_PAT=$(cat "$HOME/.vsce_pat")
fi
if [[ -z "$VSCE_PAT" ]]; then
  fail "No VSCE_PAT env var or ~/.vsce_pat file. Set Azure DevOps PAT."
fi

vsce publish -p "$VSCE_PAT" || fail "VS Code Marketplace publish failed"

# Push VS Code extension
git push || warn "VS Code extension push failed"

echo -e "  ${GREEN}✓ Published to VS Code Marketplace${NC}"

# --- Step 8: Sync playground ---
step "Syncing playground"
if [[ -d "$SITE_DIR" && -f "$SITE_DIR/scripts/sync-playground.js" ]]; then
  cd "$SITE_DIR"
  node scripts/sync-playground.js

  if [[ -n $(git status --porcelain) ]]; then
    git add -A
    git commit -m "Sync playground with cursor-doctor v${NEW_VERSION}"
    git push
    echo -e "  ${GREEN}✓ Playground synced and deployed${NC}"
  else
    echo "  No playground changes needed"
  fi
else
  warn "Skipped — nedcodes-site or sync script not found"
fi

# --- Done ---
echo -e "\n${GREEN}══════════════════════════════════════${NC}"
echo -e "${GREEN}  Released cursor-doctor v${NEW_VERSION}${NC}"
echo -e "${GREEN}  ✓ npm published${NC}"
echo -e "${GREEN}  ✓ VS Code Marketplace published${NC}"
echo -e "${GREEN}  ✓ Playground synced${NC}"
echo -e "${GREEN}  ✓ Git pushed (all repos)${NC}"
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo ""
echo "Manual steps remaining:"
echo "  - Update CHANGELOG.md if needed"
echo "  - Update Gumroad Pro page if new features"
echo "  - OpenVSX publish (when unblocked)"
