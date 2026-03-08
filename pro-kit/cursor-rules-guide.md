# Cursor Rules That Work

A practical guide to writing `.cursorrules` that actually improve your code, not just burn tokens.

---

## 1. Why Rules Break

Most Cursor rules fail silently. You write instructions. The AI ignores them. Your IDE doesn't warn you. You keep coding.

We scanned 50 real open-source projects and found that **82% had at least one broken or misconfigured rule**. Not edge cases. Common mistakes that make rules either conflict with each other, match nothing, or give the AI instructions too vague to act on.

### The 3 Most Common Failures

**Conflict: Contradictory instructions**

Two rules say opposite things. One file says "always use semicolons." Another says "omit semicolons." Cursor loads both. The AI picks one at random, or mixes them, or ignores both.

You won't get an error. The rules just stop working. You notice your code isn't following the standards you set, but you don't know why.

**Vague instructions**

"Write clean code." "Follow best practices." "Make it maintainable."

These sound helpful. They do nothing. The AI has no concrete action to take. A good rule tells the AI exactly what to do in a specific situation. A vague rule is just noise that burns tokens.

**Glob mismatches**

Your rule targets `*.tsx` files. Your project uses `.jsx`. The rule never loads. Or you use regex syntax in a glob pattern (`*.{ts,tsx}`). Cursor's glob engine doesn't support that. The rule breaks silently.

Every glob should match at least one file in your project. If it doesn't, the rule is dead code.

---

## 2. Anatomy of a Good Rule

Cursor rules use MDC format: YAML frontmatter + Markdown instructions. The frontmatter tells Cursor when to load the rule. The markdown tells the AI what to do.

### Frontmatter Fields

```yaml
---
description: "Strict TypeScript: generics, discriminated unions, no any"
globs: ["*.ts", "*.tsx"]
alwaysApply: true
---
```

**description** (required)
One-line summary of what this rule does. Shows in Cursor's UI. Make it specific. "TypeScript rules" is vague. "Strict TypeScript: generics, discriminated unions, no any" tells you exactly what's inside.

**globs** (optional)
Array of glob patterns. Matches files by path. When you edit a file matching this glob, Cursor loads the rule.

Common patterns:
- `*.ts` — all TypeScript files
- `src/**/*.tsx` — all TSX files under src/
- `tests/**` — everything in the tests directory
- `package.json` — one specific file

No regex. No braces. Simple globs only. If your glob doesn't match files, run `cursor-doctor lint` to catch it.

**alwaysApply** (optional, default: false)
When true, this rule loads on every request, regardless of what file you're editing.

Use this sparingly. It burns tokens. Every rule with `alwaysApply: true` gets added to the context window on every single Cursor request. Three rules with `alwaysApply: true` can burn 2,000+ tokens per request.

When to use it: project-wide conventions that apply everywhere. Coding standards, error handling patterns, naming conventions.

When NOT to use it: framework-specific rules, tool configs, language features. Those belong in globs.

### Instructions: Actionable vs. Vague

**Vague:**
```markdown
# Code Quality

Write clean, maintainable code. Follow best practices. Keep functions small.
```

This gives the AI nothing concrete. What's "clean"? How small is "small"? What are the "best practices" for this project?

**Actionable:**
```markdown
# Code Quality

## Function Size
- Max 40 lines per function. Extract helpers if longer.
- Max 3 parameters. Use an options object if you need more.
- One responsibility per function. If the name has "and" in it, split it.

## Naming
- Functions are verbs: `getUserById`, `validateEmail`, `formatDate`
- Booleans start with `is`, `has`, `should`: `isValid`, `hasPermission`, `shouldRetry`
- Avoid abbreviations unless they're domain-standard: `req` for request is fine, `usr` for user is not
```

Now the AI knows exactly what to do. It can check line count. It can count parameters. It can look at function names and suggest changes.

Good instructions:
- Are specific (numbers, patterns, examples)
- Show the right way and the wrong way
- Give the AI something it can check or enforce
- Use plain language, not philosophy

---

## 3. The 5 Rules Every Project Needs

These templates cover the most common gaps in Cursor projects. Start here, then add framework and tool-specific rules as needed.

### 1. Coding Standards (`clean-code.mdc`)

**What it does:** Sets project-wide conventions for naming, formatting, comments, and function design. Prevents the AI from mixing styles across files.

**Key sections:**
- Naming conventions (camelCase vs snake_case, when to abbreviate)
- Function size limits (lines, parameters, nesting depth)
- Comment policy (when to write them, what makes a good one)
- Import organization (stdlib first, third-party second, local third)

**Why you need it:** Without this, the AI will use different conventions in every file. One file gets camelCase, another gets snake_case. Inconsistency makes code harder to read and review.

### 2. Error Handling (`error-handling.mdc`)

**What it does:** Defines how errors are created, logged, propagated, and shown to users. Prevents generic "something went wrong" messages and missing stack traces.

**Key sections:**
- Error types (client errors vs server errors, retryable vs fatal)
- Recovery strategies (retry with backoff, fallback values, fail fast)
- Logging patterns (what to log, what NOT to log, PII scrubbing)
- User-facing error messages (actionable, not technical, include support contact)

**Why you need it:** Error handling is where most bugs hide. The AI will default to `console.log(error)` and move on. This rule makes it handle errors like production code.

### 3. Testing (`testing.mdc`)

**What it does:** Enforces test structure, naming, and coverage philosophy. Tells the AI what to test, what to mock, and how to organize test files.

**Key sections:**
- Test structure (Arrange-Act-Assert)
- Naming convention (`returnsNullWhenUserNotFound`, not `test1`)
- What to test (behavior from caller's perspective, edge cases, error paths)
- Mocking strategy (mock I/O, not your own code, use real objects when possible)

**Why you need it:** The AI will write tests if you ask. But without guidance, it writes tests that check implementation details instead of behavior. Those tests break every time you refactor.

### 4. Git Workflow (`git-workflow.mdc`)

**What it does:** Standardizes commit messages, branch naming, and PR descriptions. Makes history readable and bisectable.

**Key sections:**
- Commit message format (conventional commits or your own convention)
- Branch naming (`feature/`, `fix/`, `refactor/`)
- PR description template (what changed, why, testing checklist)
- Merge strategy (squash vs rebase vs merge commit)

**Why you need it:** The AI generates commit messages when you use Cursor's built-in git features. Without this rule, you get "updated file" and "fix bug" commits. With it, you get structured messages that make `git log` useful.

### 5. Project Context (`project-context.mdc`)

**What it does:** Tells the AI about your project's architecture, stack, and constraints. Custom to your codebase.

**Example structure:**
```markdown
---
description: "Project architecture and stack overview"
alwaysApply: true
---

# Project Context

## Stack
- Next.js 14 App Router
- React Server Components
- Prisma + PostgreSQL
- tRPC for API layer
- Tailwind CSS for styling

## Architecture
- `/app` — Next.js routes (RSC by default)
- `/components` — React components (mark 'use client' when needed)
- `/server` — tRPC routers and procedures
- `/lib` — shared utilities, no framework deps
- `/prisma` — database schema and migrations

## Constraints
- No class components (hooks only)
- No inline styles (Tailwind utility classes only)
- No `any` types (use `unknown` and narrow with type guards)
- All API routes must validate input with Zod
- All database queries go through tRPC procedures (no raw Prisma in components)
```

**Why you need it:** Without project context, the AI doesn't know your stack. It might suggest class components in a hooks-only codebase, or raw SQL in a Prisma project. This rule makes it generate code that fits your architecture.

---

## 4. Common Mistakes and Fixes

### Conflicting Instructions

**Mistake:**

File: `.cursorrules/javascript.mdc`
```markdown
Always use semicolons. Omitting them can cause subtle bugs.
```

File: `.cursorrules/prettier.mdc`
```markdown
Omit semicolons. Prettier handles ASI automatically.
```

**What happens:** Cursor loads both rules when you edit a `.js` file. The AI sees contradictory instructions. It picks one at random, or mixes them (semicolons in some functions, not in others), or ignores both.

**Fix:** Pick one convention. Delete the other rule or update it to match. Run `cursor-doctor conflicts` to detect these across your rule files.

**Better approach:**
```markdown
# JavaScript

Use semicolons everywhere. Our linter enforces this.
```

One rule. One convention. No ambiguity.

### Over-Broad Globs

**Mistake:**

```yaml
---
description: "React component patterns"
globs: ["**/*.tsx"]
alwaysApply: false
---
```

This loads on every `.tsx` file. But half your `.tsx` files are server components, and this rule talks about `useState` and `useEffect`. Cursor applies React hooks advice to code that can't use hooks.

**Fix:** Be specific.

```yaml
---
description: "React client component patterns"
globs: ["components/**/*.tsx", "app/**/client-*.tsx"]
alwaysApply: false
---

# React Client Components

Mark the file with `'use client'` at the top if it uses hooks or browser APIs.

Use `useState` for local component state...
```

Now the rule only loads where it's relevant.

### alwaysApply Token Burn

**Mistake:**

```yaml
---
description: "TypeScript rules"
globs: ["*.ts", "*.tsx"]
alwaysApply: true
---
```

You have globs AND `alwaysApply: true`. The globs do nothing. This rule loads on every request, including when you're editing `README.md` or `package.json`. It burns tokens even when you're not writing TypeScript.

**Fix:** Remove `alwaysApply: true`. Let the globs do their job.

```yaml
---
description: "TypeScript rules"
globs: ["*.ts", "*.tsx"]
---
```

Now it only loads when editing `.ts` or `.tsx` files.

**When alwaysApply IS correct:**

```yaml
---
description: "Project coding standards"
alwaysApply: true
---
```

No globs. These rules apply to every language, every file type. Naming conventions, function size limits, comment style. Worth the token cost because they're always relevant.

### First-Person Rules

**Mistake:**

```markdown
I prefer functional components. I don't like class components.
```

**What happens:** The AI gets confused about who "I" is. Is it you? The AI? The project? It works sometimes, but it's fragile.

**Fix:** Write in imperative or declarative voice.

```markdown
Use functional components. Avoid class components.
```

Clear. Unambiguous. No pronouns.

### Negation-Only Rules

**Mistake:**

```markdown
Don't use `any`. Don't use `var`. Don't write long functions.
```

**What happens:** The AI knows what NOT to do. It doesn't know what to do instead. It might avoid `any` but use `unknown` incorrectly. It might avoid `var` but mix `let` and `const` randomly.

**Fix:** Tell it what to do, not just what to avoid.

```markdown
Use `unknown` instead of `any`. Narrow with type guards before use.

Use `const` by default. Use `let` only when reassignment is necessary. Never use `var`.

Keep functions under 40 lines. Extract helper functions if longer.
```

Now the AI has positive instructions. It knows the right way.

---

## 5. Token Budget Management

Cursor has a context window limit. Every rule you load uses part of that window. Load too many rules, and you run out of space for your code.

### How Cursor Loads Rules

1. You edit a file (e.g., `src/components/Button.tsx`)
2. Cursor checks all `.cursorrules/*.mdc` files
3. Rules with `alwaysApply: true` load immediately
4. Rules with globs matching the current file load next
5. All loaded rules get added to the context window
6. Cursor sends the context (rules + your code + conversation history) to the AI

If your rules take up 5,000 tokens, that's 5,000 tokens that can't be used for code.

### Why alwaysApply Is Expensive

Every rule with `alwaysApply: true` loads on every request. Three rules, 800 tokens each, 2,400 tokens per request. That adds up fast.

Use `alwaysApply: true` only for rules that apply to every file in your project. Coding standards, error handling, naming conventions. Not framework rules, not tool configs, not language features.

### Checking Your Budget

Run `cursor-doctor scan`. Look for this warning:

```
⚠ 3 rules use alwaysApply — burning 2,400 tokens on every request
```

If you see this, audit your `alwaysApply` rules. Do they really need to load every time? Can you use globs instead?

**Before:**
```yaml
---
description: "React patterns"
alwaysApply: true
---
```

**After:**
```yaml
---
description: "React patterns"
globs: ["**/*.tsx", "**/*.jsx"]
---
```

Now it only loads when editing React files. Same behavior where it matters. Zero tokens when editing Python or markdown.

### Dead Rules

A rule with globs that don't match any files in your project is dead code. It never loads. It's just noise in your `.cursorrules/` directory.

Run `cursor-doctor lint` to find these:

```
✗ Glob *.vue doesn't match any files in your project
```

Delete the rule or fix the glob.

---

## 6. Team Setup

Rules live in your git repository. Share them like any other code.

### Directory Structure

```
.cursorrules/
  clean-code.mdc
  typescript.mdc
  react.mdc
  testing.mdc
  git-workflow.mdc
  project-context.mdc
```

Commit this directory. Everyone on the team gets the same rules.

### Avoiding Drift

Drift happens when teammates edit rules locally but don't commit changes. Their Cursor behaves differently. Code reviews get confusing. Standards become inconsistent.

**Fix:** Treat rules like code.
1. Changes to `.cursorrules/` go through PRs
2. Run `cursor-doctor check` in CI (fails the build if rules are broken)
3. Review rule changes as carefully as code changes

### Using cursor-doctor in CI

Add this to your GitHub Actions workflow:

```yaml
- name: Validate Cursor rules
  run: npx cursor-doctor check
```

This runs the linter and exits with code 1 if issues are found. Catches broken rules before merge.

You can also add a pre-commit hook:

```bash
#!/bin/bash
npx cursor-doctor check --quiet || {
  echo "Cursor rules are broken. Run 'npx cursor-doctor lint' to see issues."
  exit 1
}
```

Now broken rules can't be committed.

---

## 7. Auto-Fix Workflow

cursor-doctor can fix common issues automatically. Frontmatter syntax errors, boolean strings, duplicate content, glob mistakes, and more.

### Preview First

```bash
npx cursor-doctor fix --preview
```

This shows what would change without modifying files. Review the fixes before applying them.

**Example output:**
```
Would fix 6 issues:

  .cursorrules/typescript.mdc
    line 2: Convert alwaysApply: "true" → true
    line 5: Remove duplicate description

  .cursorrules/react.mdc
    line 8: Fix glob pattern *.tsx → **/*.tsx
    line 15: Remove TODO comment

Apply with: npx cursor-doctor fix
```

### Apply Fixes

```bash
npx cursor-doctor fix
```

This writes the changes to disk. The first 3 fixes are free. Unlimited fixes require Pro.

### Verify

After fixing, run the linter again:

```bash
npx cursor-doctor lint
```

Make sure the issues are gone. If new issues appear, it means a fix created a conflict or broke something. File a bug report.

### Workflow

1. Write rules or update existing ones
2. Run `cursor-doctor scan` to check health
3. If issues found, run `cursor-doctor fix --preview`
4. Review the proposed changes
5. Run `cursor-doctor fix` to apply
6. Run `cursor-doctor lint` to verify
7. Commit the fixed rules

This workflow catches 90% of common mistakes. The remaining 10% are semantic issues (conflicting instructions) that need manual review.

---

## 8. Template Quick Reference

All 50 templates included in the Cursor Pro Kit. Organized by category. Pre-linted and tested with cursor-doctor.

### Languages (5)

| Template | When to Use |
|----------|-------------|
| **typescript.mdc** | TypeScript projects. Covers types, generics, unions, `any` avoidance. |
| **python.mdc** | Python projects. Type hints, dataclasses, pathlib, mutable defaults. |
| **javascript.mdc** | Plain JavaScript. Modern syntax: const/let, destructuring, async/await. |
| **go.mdc** | Go projects. Error handling, receiver naming, zero values, context. |
| **rust.mdc** | Rust projects. Ownership, pattern matching, error propagation, iterators. |

### Frameworks (15)

| Template | When to Use |
|----------|-------------|
| **react.mdc** | React projects. Hooks, component patterns, prop validation, rendering. |
| **nextjs.mdc** | Next.js. App Router, RSC, data fetching, metadata API, route handlers. |
| **vue.mdc** | Vue 3. Composition API, refs, computed properties, lifecycle hooks. |
| **express.mdc** | Express.js. Middleware, error handling, route organization, validation. |
| **django.mdc** | Django. Models, views, templates, ORM patterns, migration workflow. |
| **fastapi.mdc** | FastAPI. Async patterns, Pydantic validation, dependency injection. |
| **nestjs.mdc** | NestJS. Modules, providers, decorators, dependency injection, guards. |
| **flask.mdc** | Flask. Blueprints, request context, Jinja templates, extensions. |
| **tailwind-css.mdc** | Tailwind projects. Utility classes, responsive design, custom config. |
| **svelte.mdc** | Svelte. Reactive statements, stores, component lifecycle, slots. |
| **react-native.mdc** | React Native. Mobile components, navigation, platform-specific code. |
| **angular.mdc** | Angular. Modules, components, services, RxJS, change detection. |
| **remix.mdc** | Remix. Loaders, actions, forms, error boundaries, nested routes. |
| **nuxt.mdc** | Nuxt 3. Composables, server routes, auto-imports, layouts, middleware. |
| **laravel.mdc** | Laravel. Eloquent ORM, migrations, validation, resource controllers. |

### Practices (12)

| Template | When to Use |
|----------|-------------|
| **testing.mdc** | All projects. Test structure, mocking, coverage philosophy, AAA pattern. |
| **security.mdc** | All projects. Input validation, auth patterns, secrets, OWASP basics. |
| **error-handling.mdc** | All projects. Error types, recovery, logging, user-facing messages. |
| **clean-code.mdc** | All projects. Naming, function size, comments, SOLID, refactoring. |
| **git-workflow.mdc** | All projects. Commit messages, branch naming, PR descriptions. |
| **code-review.mdc** | Teams. Review checklist, feedback patterns, approval criteria. |
| **documentation.mdc** | All projects. README structure, API docs, comments, changelogs. |
| **api-design.mdc** | API projects. REST/GraphQL patterns, versioning, errors, pagination. |
| **performance.mdc** | All projects. Lazy loading, caching, N+1 queries, bundle size, memory. |
| **accessibility.mdc** | Web projects. ARIA, keyboard nav, color contrast, semantic HTML. |
| **monitoring.mdc** | Production apps. Logging patterns, metrics, error tracking, alerts. |
| **refactoring.mdc** | All projects. When to refactor, extract methods, reduce coupling. |

### Tools (15)

| Template | When to Use |
|----------|-------------|
| **jest.mdc** | Jest projects. Matchers, mocks, setup/teardown, snapshots. |
| **cypress.mdc** | Cypress E2E tests. Selectors, custom commands, fixtures, assertions. |
| **docker.mdc** | Dockerized apps. Dockerfile best practices, multi-stage, caching. |
| **graphql.mdc** | GraphQL APIs. Schema design, resolvers, N+1 prevention, errors. |
| **prisma.mdc** | Prisma ORM. Schema, migrations, queries, relations, transactions. |
| **postgresql.mdc** | PostgreSQL. Indexing, query optimization, constraints, migrations. |
| **mongodb.mdc** | MongoDB. Schema design, aggregations, indexing, validation. |
| **playwright.mdc** | Playwright E2E. Selectors, page objects, fixtures, parallelization. |
| **vitest.mdc** | Vitest. Setup, mocks, coverage, UI mode, browser testing. |
| **storybook.mdc** | Storybook. Stories, controls, decorators, interaction testing. |
| **pytest.mdc** | pytest. Fixtures, parametrize, markers, conftest patterns. |
| **trpc.mdc** | tRPC. Routers, procedures, middleware, input validation with Zod. |
| **supabase.mdc** | Supabase. Auth, RLS policies, real-time subscriptions, storage. |
| **redis.mdc** | Redis. Caching patterns, pub/sub, key naming, expiration policies. |
| **turborepo.mdc** | Turborepo. Task config, caching, pipeline dependencies, remote cache. |

### AI Tools (3)

| Template | When to Use |
|----------|-------------|
| **copilot-instructions.mdc** | GitHub Copilot users. Config and coding preferences for Copilot. |
| **claude-md.mdc** | Claude users. Instructions specific to Claude code generation. |
| **cross-tool-config.mdc** | Multi-tool setups. Shared rules for Cursor, Copilot, and other AI assistants. |

---

**Next steps:**

1. Copy the templates you need into your `.cursorrules/` directory
2. Edit globs and instructions to match your project
3. Run `cursor-doctor scan` to verify everything works
4. Run `cursor-doctor fix` to auto-repair any issues
5. Commit your rules and share them with your team

**Need help?** Email hello@nedcodes.dev or open an issue at github.com/nedcodes-ok/cursor-doctor
