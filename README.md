# cursor-lint

[![npm](https://img.shields.io/npm/dw/cursor-lint)](https://www.npmjs.com/package/cursor-lint)
[![npm version](https://img.shields.io/npm/v/cursor-lint)](https://www.npmjs.com/package/cursor-lint)

Lint your [Cursor](https://cursor.com) rules. Catch common mistakes before they silently break your workflow.

![cursor-lint demo](demo.png)

```bash
npx cursor-lint
```

```
🔍 cursor-lint v0.1.0

.cursorrules
  ⚠ .cursorrules may be ignored in agent mode
    → Use .cursor/rules/*.mdc with alwaysApply: true

.cursor/rules/code.mdc
  ✗ Missing alwaysApply: true
    → Add alwaysApply: true to frontmatter for agent mode
  ⚠ Vague rule detected: "write clean code" (line 6)

.cursor/rules/memory.mdc
  ✓ All checks passed

──────────────────────────────────────────────────
1 error, 2 warnings, 1 passed
```

## Why

Cursor rules fail silently. You won't know your rules are broken until the AI ignores them. Common mistakes:

- Using `.cursorrules` instead of `.mdc` files (agent mode ignores `.cursorrules`)
- Missing `alwaysApply: true` (rules never load)
- Vague instructions ("write clean code") that have zero effect
- Files too long for the context window
- Bad YAML frontmatter or glob syntax

cursor-lint catches all of these in seconds.

## Install

```bash
# Run directly (no install)
npx cursor-lint

# Or install globally
npm install -g cursor-lint
```

## What It Checks

| Check | Severity | Description |
|-------|----------|-------------|
| `.cursorrules` in agent mode | ⚠ Warning | Agent mode ignores `.cursorrules` — use `.mdc` files |
| Missing `alwaysApply: true` | ✗ Error | `.mdc` files without this won't load in agent mode |
| Missing `description` | ⚠ Warning | Cursor uses description to decide when to apply rules |
| Bad glob syntax | ✗ Error | Comma-separated globs should be YAML arrays |
| Vague rules | ⚠ Warning | Generic instructions like "follow best practices" have no effect |
| File too long | ⚠/✗ | Files over 150 lines may not fit in context window |
| Bad frontmatter | ✗ Error | Malformed YAML frontmatter won't parse |

## CI/CD

cursor-lint exits with code 1 when errors are found. Add it to your pipeline:

```yaml
# GitHub Actions
- name: Lint Cursor rules
  run: npx cursor-lint
```

## Options

```
cursor-lint [directory]       Lint rules in directory (default: current dir)
cursor-lint --fix             Auto-fix common issues (missing frontmatter, alwaysApply)
cursor-lint --generate        Auto-detect stack & download matching rules from collection
cursor-lint --verify          Check if code follows rules with verify: blocks
cursor-lint --order           Show rule load order, priority tiers, and token estimates
cursor-lint --version-check   Detect installed versions, show relevant features & rule mismatches
cursor-lint --init            Generate starter rules (auto-detects your stack)
cursor-lint --help            Show help
cursor-lint --version         Show version
```

### --version-check

Reads your `package.json`, `requirements.txt`, or `pyproject.toml` and tells you:
1. **Version-specific features** available in your installed packages (e.g., "React 19+: use useActionState")
2. **Rule mismatches** — if your `.mdc` rules reference version features your installed packages don't support

```bash
npx cursor-lint --version-check
```

```
📦 cursor-lint v0.8.0 --version-check

Version-specific features available:

  react (^19.0.0)
    → React 19+: use useActionState (replaces useFormState), use() hook
    → React 18+: useId, useSyncExternalStore, automatic batching

  next (^14.2.0)
    → Next.js 14+: Server Actions stable, partial prerendering (preview)

Version mismatches in your rules:

  ⚠ nextjs.mdc:5 — Rule references 15+ but next ^14.2.0 is installed
```

## Based on Real Testing

Every check in cursor-lint comes from [actual experiments](https://dev.to/nedcodes) testing what Cursor does and doesn't follow. Not guesswork — data.

## Need a deeper review?

cursor-lint catches structural issues. For a full review of your rules, project structure, and model settings, I offer [$50 async setup audits](https://nedcodes.gumroad.com/l/cursor-setup-audit). You get a written report with specific fixes, not generic advice.

## License

MIT

---

Made by [nedcodes](https://dev.to/nedcodes) · [Free rules collection](https://github.com/nedcodes-ok/cursorrules-collection) · [Setup audits](https://nedcodes.gumroad.com/l/cursor-setup-audit)

---

## Related

- [cursorrules-collection](https://github.com/nedcodes-ok/cursorrules-collection) — 104 free .mdc rules
- [Cursor Setup Audit](https://nedcodes.gumroad.com/l/cursor-setup-audit) — Professional review of your rules setup ($50)
- [Articles on Dev.to](https://dev.to/nedcodes) — Guides on writing effective Cursor rules
