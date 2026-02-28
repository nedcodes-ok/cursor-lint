# cursor-doctor

[![npm version](https://img.shields.io/npm/v/cursor-doctor)](https://www.npmjs.com/package/cursor-doctor) [![npm downloads](https://img.shields.io/npm/dw/cursor-doctor)](https://www.npmjs.com/package/cursor-doctor) [![license](https://img.shields.io/npm/l/cursor-doctor)](https://github.com/nedcodes-ok/cursor-doctor/blob/main/LICENSE) [![contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen)](https://github.com/nedcodes-ok/cursor-doctor/blob/main/CONTRIBUTING.md)

**Fix your Cursor AI setup in seconds.**

Run one command to find out what's wrong with your `.cursor/` config and how to fix it.

![cursor-doctor scan demo](https://raw.githubusercontent.com/nedcodes-ok/cursor-doctor/main/images/demo.gif)

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
| **Lint** | 60+ checks: broken YAML, missing frontmatter, vague rules, conflicts, prompt engineering anti-patterns |
| **Token budget** | Estimates how many tokens your rules consume per request |
| **Coverage** | Detects project file types with no matching rules |
| **Skills** | Checks for agent skill definitions |
| **Conflicts** | Finds contradictory instructions across rule files |
| **Redundancy** | Spots duplicate content between rules |
| **Structure** | Validates project organization, file naming, and configuration |
| **Context files** | Checks AGENTS.md, CLAUDE.md, and other context files for bloat |

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

## GitHub Action

Run cursor-doctor in your CI pipeline:

```yaml
name: Cursor Rules Check
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: nedcodes-ok/cursor-doctor@v1
        with:
          path: '.'
          fail-on-warning: false
```

Outputs: `issue-count`, `health-grade`, `percentage`

## LSP Server (Editor Integration)

Get real-time diagnostics in Neovim, Zed, or any LSP-compatible editor.

### Installation

```bash
npm install -g cursor-doctor
```

### Neovim (nvim-lspconfig)

Add to your `init.lua`:

```lua
local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

-- Register cursor-doctor LSP
if not configs.cursor_doctor then
  configs.cursor_doctor = {
    default_config = {
      cmd = { 'cursor-doctor-lsp' },
      filetypes = { 'mdc' },
      root_dir = lspconfig.util.root_pattern('.cursor', '.git'),
      settings = {},
    },
  }
end

-- Enable for .mdc files
lspconfig.cursor_doctor.setup{}
```

Set filetype for `.mdc` files in `~/.config/nvim/ftdetect/mdc.vim`:

```vim
au BufRead,BufNewFile *.mdc set filetype=mdc
```

### Zed

Add to your `settings.json`:

```json
{
  "lsp": {
    "cursor-doctor": {
      "binary": {
        "path": "cursor-doctor-lsp"
      },
      "language_servers": ["cursor-doctor"]
    }
  },
  "languages": {
    "MDC": {
      "language_servers": ["cursor-doctor"],
      "file_types": ["mdc"]
    }
  }
}
```

### VS Code

The [Cursor Doctor extension](https://marketplace.visualstudio.com/items?itemName=nedcodes.cursor-doctor) already includes LSP support. No additional setup needed.

## Related

- **[rule-gen](https://github.com/nedcodes-ok/rule-gen)** — Generate rules from your codebase using Google Gemini. `npx rulegen-ai`
- **[rule-porter](https://github.com/nedcodes-ok/rule-porter)** — Convert your Cursor rules to CLAUDE.md, AGENTS.md, Copilot, or Windsurf (and back). `npx rule-porter --to agents-md`

## License

MIT
