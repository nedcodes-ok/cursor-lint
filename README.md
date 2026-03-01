# cursor-doctor

[![npm version](https://img.shields.io/npm/v/cursor-doctor)](https://www.npmjs.com/package/cursor-doctor) [![npm downloads](https://img.shields.io/npm/dw/cursor-doctor)](https://www.npmjs.com/package/cursor-doctor) [![GitHub stars](https://img.shields.io/github/stars/nedcodes-ok/cursor-doctor?style=social)](https://github.com/nedcodes-ok/cursor-doctor) [![license](https://img.shields.io/npm/l/cursor-doctor)](https://github.com/nedcodes-ok/cursor-doctor/blob/main/LICENSE)

**Your Cursor rules have bugs. This finds them.**

You wrote rules. Cursor still ignores them. cursor-doctor tells you exactly what's wrong: conflicting directives, broken globs, vague instructions the AI can't act on, token budget waste, and 100+ other issues. Treat your rules like code, not config. One command. Zero dependencies.

![cursor-doctor scan demo](https://raw.githubusercontent.com/nedcodes-ok/cursor-doctor/main/images/demo.gif)

## Quick Start

```bash
npx cursor-doctor scan
```

No install needed. Runs directly with npx.

## What It Checks

100+ lint rules across these categories:

| Check | Examples |
|-------|---------|
| **Syntax** | Broken YAML, missing frontmatter, boolean strings, unclosed code blocks |
| **Conflicts** | Contradictory instructions across files (48 semantic patterns) |
| **Token budget** | Rules burning context window, dead rules, excessive alwaysApply |
| **Globs** | Patterns that don't match files, regex in globs, overlapping coverage |
| **Prompt quality** | Vague instructions, first person, politeness tokens, negation-only rules |
| **Structure** | File naming, duplicate content, missing descriptions, legacy .cursorrules |

## Commands

```bash
npx cursor-doctor scan             # Find what's wrong (default)
npx cursor-doctor fix              # Auto-fix everything (Pro)
npx cursor-doctor fix --dry-run    # Preview fixes first
npx cursor-doctor lint             # Detailed rule-by-rule output
npx cursor-doctor check            # CI pass/fail (exit 0 or 1)
npx cursor-doctor init             # Generate rules for your stack
npx cursor-doctor install react    # Install community rule packs
npx cursor-doctor audit            # Full diagnostic report (Pro)
npx cursor-doctor conflicts        # Cross-format conflicts (Pro)
npx cursor-doctor test <file>      # AI rule adherence testing (Pro)
npx cursor-doctor team drift       # Detect config drift (Pro)
```

Run `cursor-doctor help` for the full list.

## Auto-Fix (Pro)

34 auto-fixers: frontmatter repair, glob syntax, boolean strings, whitespace, TODO removal, duplicate descriptions, heading normalization, and more.

```bash
npx cursor-doctor fix --dry-run    # See what would change
npx cursor-doctor fix              # Apply all fixes
```

**Get a Pro key ($9 one-time):** [nedcodes.gumroad.com/l/cursor-doctor-pro](https://nedcodes.gumroad.com/l/cursor-doctor-pro)

If Pro doesn't find real, fixable issues, email hello@nedcodes.dev for a full refund.

## VS Code / Cursor Extension

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/nedcodes.cursor-doctor?label=VS%20Code%20Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=nedcodes.cursor-doctor)
[![OpenVSX](https://img.shields.io/open-vsx/v/nedcodes/cursor-doctor?label=OpenVSX&color=purple)](https://open-vsx.org/extension/nedcodes/cursor-doctor)

Search **"Cursor Doctor"** in the extensions panel. Health grade in your status bar. Inline diagnostics on save. Quick-fix code actions with Pro.

## MCP Server

Use cursor-doctor as an MCP tool in your AI coding assistant. Add to `.cursor/mcp.json`:

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

## CI / GitHub Action

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: nedcodes-ok/cursor-doctor@v1
```

## LSP Server

Real-time diagnostics in Neovim, Zed, or any LSP-compatible editor:

```bash
npm install -g cursor-doctor
# Then configure your editor to use cursor-doctor-lsp
# See docs at nedcodes.dev for Neovim/Zed setup
```

## Related

- **[rule-gen](https://github.com/nedcodes-ok/rule-gen)** — Generate rules from your codebase with AI. `npx rulegen-ai`
- **[rule-porter](https://github.com/nedcodes-ok/rule-porter)** — Convert rules between Cursor, Claude, Copilot, and Windsurf. `npx rule-porter`
- **[nedcodes.dev](https://nedcodes.dev)** — Guides, playground, and tools for Cursor AI developers.

## License

MIT
