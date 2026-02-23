# cursor-lint

**Lint your Cursor rules before they silently break your AI output.**

[![npm](https://img.shields.io/npm/dw/cursor-lint)](https://www.npmjs.com/package/cursor-lint)
[![npm version](https://img.shields.io/npm/v/cursor-lint)](https://www.npmjs.com/package/cursor-lint)

```bash
npx cursor-lint
```

![cursor-lint demo](demo.png)

Cursor rules fail silently. Missing `alwaysApply: true`? Rule never loads. Bad glob syntax? Ignored without warning. Vague instructions like "write clean code"? Zero effect on output. You won't know until the AI does something wrong.

cursor-lint catches these problems in seconds. Every check comes from [real experiments](https://dev.to/nedcodes) testing what Cursor actually follows — not guesswork.

## What it catches

- **Missing `alwaysApply: true`** — your .mdc rules aren't loading in agent mode
- **Using `.cursorrules` instead of `.mdc`** — agent mode ignores the old format
- **Bad YAML frontmatter** — malformed frontmatter means the whole rule is skipped
- **Broken glob patterns** — comma-separated globs should be YAML arrays
- **Vague rules** — "follow best practices" has literally zero effect (we tested it)
- **Files too long for context** — rules that don't fit get silently truncated
- **Missing description** — Cursor uses this to decide when to apply your rule
- **Duplicate rules** — same rule in multiple files wastes context tokens
- **Rules too long / empty bodies** — bloated or hollow rules that add nothing
- **URL-only rule bodies** — a URL isn't an instruction
- **`alwaysApply` + `globs` together** — contradictory config, pick one

20+ checks total. All based on [documented experiments](https://dev.to/nedcodes/series/cursorrules-that-work).

## Install

```bash
# Run without installing
npx cursor-lint

# Install globally
npm install -g cursor-lint

# Or add to your project
npm install --save-dev cursor-lint
```

## Commands

### Lint (default)

```bash
npx cursor-lint           # lint current directory
npx cursor-lint ./myapp   # lint specific directory
```

```
🔍 cursor-lint v0.15.0

.cursor/rules/react.mdc
  ✗ Missing alwaysApply: true
  ⚠ Vague rule: "write clean code" (line 6)

.cursor/rules/api.mdc
  ✓ All checks passed

1 error, 1 warning, 1 passed
```

### `--fix` — Auto-repair common issues

Adds missing frontmatter, sets `alwaysApply: true`, fixes formatting.

```bash
npx cursor-lint --fix
```

### `--generate` — Download rules for your stack

Reads your `package.json` / `requirements.txt` / `pyproject.toml`, detects your stack, and downloads matching rules from the [free collection](https://github.com/nedcodes-ok/cursorrules-collection).

```bash
npx cursor-lint --generate
```

Supports React, Next.js, Vue, Svelte, Express, Django, FastAPI, Flask, Rails, Laravel, Spring Boot, and 30+ more. Includes popular stack presets (T3, MERN, Python+FastAPI) and framework version detection (React 18 vs 19, Next 14 vs 15).

### `--stats` — Rule health dashboard

See how many tokens your rules cost, which ones are heaviest, and where you have coverage gaps.

```bash
npx cursor-lint --stats
```

```
Rule files:
  .mdc files:     8
  Total tokens:   ~1,847

Token breakdown:
  typescript.mdc                    412 tokens (22%) ████████
  react.mdc                         389 tokens (21%) ███████
  testing.mdc                       201 tokens (11%) ████
  ...

✓ No coverage gaps detected
```

### `--doctor` — Full health check with letter grade

Runs lint checks, measures token budget, analyzes coverage, and gives your project a grade.

```bash
npx cursor-lint --doctor
```

```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Project Health: A (92%)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✓ Rules exist
  ✓ No legacy .cursorrules
  ✓ Lint checks — all pass
  ✓ Token budget — ~1,847 tokens
  ⚠ Coverage — missing rules for .py files
  ✓ Agent skills found
```

### `--migrate` — Convert `.cursorrules` to `.mdc`

Still using the old `.cursorrules` file? This converts it to the modern `.cursor/rules/*.mdc` format, splitting by sections automatically.

```bash
npx cursor-lint --migrate
```

### `--diff` — Track rule changes over time

Save a snapshot, edit your rules, then see exactly what changed. Useful in CI to catch unreviewed rule changes.

```bash
npx cursor-lint --diff save   # save current state
# ... edit rules ...
npx cursor-lint --diff         # see what changed
```

### `--plugin` — Validate Cursor 2.5 plugins

Validates plugin manifests, frontmatter, hook events, MCP configs, and marketplace files against Cursor's official spec.

```bash
npx cursor-lint --plugin ./my-plugin
```

### `--verify` — Check if code follows your rules

```bash
npx cursor-lint --verify
```

### `--version-check` — Detect version mismatches

Compares your installed package versions against what your rules reference.

```bash
npx cursor-lint --version-check
```

### `--init` — Generate starter rules

Auto-detects your stack and creates a starter `.cursor/rules/` setup.

```bash
npx cursor-lint --init
```

### `--order` — Show rule load order

See rule priority tiers, load order, and per-rule token estimates.

```bash
npx cursor-lint --order
```

## CI/CD

cursor-lint exits with code 1 when errors are found:

```yaml
# GitHub Actions
- name: Lint Cursor rules
  run: npx cursor-lint
```

## Based on real experiments

We tested `.cursorrules` vs `.mdc`, `alwaysApply` on vs off, model compliance across Sonnet 4.5 / Gemini 3 Flash / GPT-5.1 Codex Mini, vague vs specific rules, negative vs positive framing, comment preservation, and more. [12 experiments, all documented.](https://dev.to/nedcodes/series/cursorrules-that-work)

cursor-lint encodes what we learned into automated checks so you don't have to learn it the hard way.

## Links

- 📦 [npm](https://www.npmjs.com/package/cursor-lint)
- 📚 [Free rules collection](https://github.com/nedcodes-ok/cursorrules-collection) — 105+ .mdc rules for every stack
- 📝 [Experiment write-ups on Dev.to](https://dev.to/nedcodes)
- 📬 [Subscribe](https://buttondown.com/nedcodes) — one email per new post, nothing else

## License

MIT — Made by [nedcodes](https://dev.to/nedcodes)
