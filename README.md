# cursor-doctor

**Fix your Cursor AI setup in seconds.**

Run one command to find out what's wrong with your `.cursor/` config and how to fix it.

```
$ npx cursor-doctor scan

  ✓ Rules exist: .cursor/rules/ found with .mdc files
  ✗ No legacy .cursorrules: .cursorrules exists alongside .mdc rules — may cause conflicts
  ! Lint checks: 3 errors, 2 warnings. Run `cursor-doctor fix` to repair.
  ! Token budget: ~4,200 tokens — getting heavy. Consider trimming.
  ✓ Coverage: Rules cover your project file types
  i Agent skills: No agent skills found

  Health Score: C (62%)

  3 issues can be auto-fixed. Run cursor-doctor fix (Pro)
```

## Install

```bash
npx cursor-doctor scan
```

No install needed. Runs directly with npx. Zero dependencies.

### VS Code / Cursor Extension

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/nedcodes.cursor-doctor?label=VS%20Code%20Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=nedcodes.cursor-doctor)
[![OpenVSX](https://img.shields.io/open-vsx/v/nedcodes/cursor-doctor?label=OpenVSX&color=purple)](https://open-vsx.org/extension/nedcodes/cursor-doctor)

Search **"Cursor Doctor"** in the extensions panel, or install from:
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nedcodes.cursor-doctor)
- [OpenVSX](https://open-vsx.org/extension/nedcodes/cursor-doctor) (used by Cursor)

Health grade in your status bar. Inline diagnostics on save. Same engine, zero config.

## What It Checks

| Check | What it does |
|-------|-------------|
| **Rules exist** | Verifies you have `.cursor/rules/*.mdc` files |
| **Legacy files** | Flags `.cursorrules` that should be migrated to `.mdc` |
| **Lint** | 20+ checks: broken YAML, missing frontmatter, vague rules, conflicts |
| **Token budget** | Estimates how many tokens your rules consume per request |
| **Coverage** | Detects project file types with no matching rules |
| **Skills** | Checks for agent skill definitions |
| **Conflicts** | Finds contradictory instructions across rule files |
| **Redundancy** | Spots duplicate content between rules |

## Commands

### Free

```bash
# Health score + issue list
cursor-doctor scan

# CI-friendly: one line per issue, exit code 0/1
cursor-doctor check

# Convert .cursorrules to .cursor/rules/*.mdc
cursor-doctor migrate
```

### Pro ($9 one-time)

```bash
# Full diagnostic report: conflicts, redundancy, token budget, stack detection
cursor-doctor audit

# Export as markdown
cursor-doctor audit --md > report.md

# Auto-fix: repair frontmatter, split oversized files, resolve issues
cursor-doctor fix

# Preview fixes without writing
cursor-doctor fix --dry-run

# Activate your license
cursor-doctor activate <key>
```

**Get a Pro key:** [nedcodes.gumroad.com/l/cursor-doctor-pro](https://nedcodes.gumroad.com/l/cursor-doctor-pro)

## Why?

Cursor's AI reads your `.cursor/rules/` directory to understand how you want code written. But most setups have problems:

- Rules with broken YAML frontmatter that Cursor silently ignores
- `alwaysApply: true` on everything, burning tokens on irrelevant rules
- Conflicting instructions across files ("use semicolons" in one, "no semicolons" in another)
- Legacy `.cursorrules` files that conflict with `.mdc` rules
- 5,000+ tokens of rules eating into your context window every request

cursor-doctor finds these problems and fixes them.

## From the makers of cursor-lint

cursor-doctor is the evolution of [cursor-lint](https://www.npmjs.com/package/cursor-lint) (1,800+ downloads). Same engine, broader scope, auto-fix capabilities.

If you're already using cursor-lint, cursor-doctor includes everything cursor-lint does plus diagnostics, conflict detection, and automated repair.

## License

MIT
