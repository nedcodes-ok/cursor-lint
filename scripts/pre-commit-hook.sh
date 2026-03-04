#!/usr/bin/env bash
# cursor-doctor pre-commit hook
# Validates Cursor rules before each commit
# Install: cp scripts/pre-commit-hook.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

# Check if any .mdc files or .cursorrules are staged
STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.mdc$|\.cursorrules$|CLAUDE\.md$|AGENTS\.md$')

if [ -z "$STAGED" ]; then
  exit 0
fi

echo "cursor-doctor: checking staged rule files..."
npx cursor-doctor check
exit $?
