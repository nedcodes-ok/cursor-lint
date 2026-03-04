# cursor-doctor

[![npm version](https://img.shields.io/npm/v/cursor-doctor)](https://www.npmjs.com/package/cursor-doctor) [![npm downloads](https://img.shields.io/npm/dw/cursor-doctor)](https://www.npmjs.com/package/cursor-doctor) [![GitHub stars](https://img.shields.io/github/stars/nedcodes-ok/cursor-doctor?style=social)](https://github.com/nedcodes-ok/cursor-doctor) [![license](https://img.shields.io/npm/l/cursor-doctor)](https://github.com/nedcodes-ok/cursor-doctor/blob/main/LICENSE)

**Your Cursor rules have bugs. This finds them.**

You wrote rules. Cursor still ignores them. cursor-doctor tells you exactly what's wrong: conflicting directives, broken globs, vague instructions the AI can't act on, token budget waste, and 100+ other issues. One command. Zero dependencies.

```bash
npx cursor-doctor scan
```

![cursor-doctor scan demo](https://raw.githubusercontent.com/nedcodes-ok/cursor-doctor/main/images/demo.gif)

## What you get

```
  ▒▒ Cursor Health: B ▒▒

  ██████████████████████████░░░░  84%

  ✗ Conflict: "always use semicolons" vs "omit semicolons" in 2 files
  ✗ Glob *.tsx doesn't match any files in your project
  ⚠ 3 rules use alwaysApply — burning 2,400 tokens on every request
  ⚠ "write clean code" is too vague for the AI to act on
  ✓ Frontmatter valid across 12 rules
  ✓ No legacy .cursorrules detected

  8 passed  4 issues  (2 auto-fixable)
```

Not generic warnings. Issues specific to your rules, with the exact file and line.

## Why this exists

We scanned [50 real open-source projects](https://nedcodes.dev/guides/cursor-rules-health-50-projects) and found that **82% had at least one broken or misconfigured rule**. The most common issues: contradictory instructions across files, glob patterns that match nothing, and vague rules the AI silently ignores.

## Commands

| Command | What it does | Free? |
|---------|-------------|-------|
| `npx cursor-doctor scan` | Health check with letter grade | ✅ |
| `npx cursor-doctor lint` | Rule-by-rule detailed diagnostics | ✅ |
| `npx cursor-doctor check` | CI pass/fail (exit code 0 or 1) | ✅ |
| `npx cursor-doctor init` | Generate starter rules for your stack | ✅ |
| `npx cursor-doctor install react` | Install community rule packs | ✅ |
| `npx cursor-doctor fix --preview` | Preview auto-fixes before applying | ✅ |
| `npx cursor-doctor fix` | Apply all auto-fixes | Pro |
| `npx cursor-doctor audit` | Full diagnostic report | Pro |
| `npx cursor-doctor conflicts` | Cross-format conflict detection | Pro |
| `npx cursor-doctor test <file>` | AI rule adherence testing | Pro |
| `npx cursor-doctor team drift` | Detect config drift across team | Pro |

## What it checks

100+ lint rules:

- **Conflicts** — contradictory instructions across files (48 semantic patterns)
- **Syntax** — broken YAML frontmatter, boolean strings, unclosed code blocks
- **Token budget** — rules burning context window, dead rules, excessive alwaysApply
- **Globs** — patterns that don't match files, regex in globs, overlapping coverage
- **Prompt quality** — vague instructions, first person, politeness tokens, negation-only rules
- **Structure** — file naming, duplicate content, missing descriptions, legacy .cursorrules

## Auto-fix (Pro)

34 auto-fixers: frontmatter repair, glob syntax, boolean strings, whitespace, TODO removal, duplicate descriptions, heading normalization, and more.

```bash
npx cursor-doctor fix --preview    # See what would change (free)
npx cursor-doctor fix              # Apply all fixes (Pro)
```

**$9 one-time** at [nedcodes.gumroad.com/l/cursor-doctor-pro](https://nedcodes.gumroad.com/l/cursor-doctor-pro). If it doesn't find real, fixable issues in your project, email hello@nedcodes.dev for a full refund.

## VS Code / Cursor extension

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/nedcodes.cursor-doctor?label=VS%20Code%20Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=nedcodes.cursor-doctor)
[![OpenVSX](https://img.shields.io/open-vsx/v/nedcodes/cursor-doctor?label=OpenVSX&color=purple)](https://open-vsx.org/extension/nedcodes/cursor-doctor)

Search **"Cursor Doctor"** in the extensions panel. Health grade in your status bar. Inline diagnostics on save. Quick-fix code actions with Pro.

## CI / GitHub Action

Catch broken rules before merge:

```yaml
- uses: nedcodes-ok/cursor-doctor@v1
```

## Pre-commit hook

Validate rules locally before every commit:

```bash
cp scripts/pre-commit-hook.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

The hook runs `cursor-doctor check` only when `.mdc`, `.cursorrules`, `CLAUDE.md`, or `AGENTS.md` files are staged.

## MCP Server

Use cursor-doctor as an MCP tool inside your AI coding assistant:

```json
{
  "mcpServers": {
    "cursor-doctor": {
      "command": "npx",
      "args": ["-y", "cursor-doctor-mcp"]
    }
  }
}
```

## LSP Server

Real-time diagnostics in Neovim, Zed, or any LSP-compatible editor:

```bash
npm install -g cursor-doctor
# Configure your editor to use cursor-doctor-lsp
```

## Related tools

| Tool | What | Install |
|------|------|---------|
| **[rule-gen](https://github.com/nedcodes-ok/rule-gen)** | Generate rules from your codebase with AI | `npx rulegen-ai` |
| **[rule-porter](https://github.com/nedcodes-ok/rule-porter)** | Convert rules between Cursor, Claude, Copilot, Windsurf | `npx rule-porter` |
| **[nedcodes.dev](https://nedcodes.dev)** | Guides, playground, and tools for Cursor AI developers | |

## License

MIT
