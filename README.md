# cursor-lint

Lint your [Cursor](https://cursor.com) rules. Catch common mistakes before they silently break your workflow.

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
cursor-lint [directory]    Lint rules in directory (default: current dir)
cursor-lint --help         Show help
cursor-lint --version      Show version
```

## Based on Real Testing

Every check in cursor-lint comes from [actual experiments](https://dev.to/nedcodes) testing what Cursor does and doesn't follow. Not guesswork — data.

## Need a deeper review?

cursor-lint catches structural issues. For a full review of your rules, project structure, and model settings, I offer [$50 async setup audits](https://cursorrulespacks.gumroad.com/l/cursor-setup-audit). You get a written report with specific fixes, not generic advice.

## License

MIT

---

Made by [nedcodes](https://dev.to/nedcodes) · [Free rules collection](https://github.com/cursorrulespacks/cursorrules-collection) · [Setup audits](https://cursorrulespacks.gumroad.com/l/cursor-setup-audit)

---

## Related

- [cursorrules-collection](https://github.com/cursorrulespacks/cursorrules-collection) — 77+ free .mdc rules
- [Cursor Setup Audit](https://cursorrulespacks.gumroad.com/l/cursor-setup-audit) — Professional review of your rules setup ($50)
- [Articles on Dev.to](https://dev.to/nedcodes) — Guides on writing effective Cursor rules
