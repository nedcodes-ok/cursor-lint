# Cursor Pro Kit Templates

50 battle-tested `.cursorrules` templates, pre-linted with cursor-doctor.

## How to Use

1. Copy templates into your project's `.cursorrules/` directory
2. Edit globs and instructions to match your project
3. Run `cursor-doctor scan` to verify
4. Run `cursor-doctor lint` to catch conflicts

## Languages (5)

| Template | Description |
|----------|-------------|
| **typescript.mdc** | Strict TypeScript: generics, discriminated unions, no any |
| **python.mdc** | Modern Python: type hints, dataclasses, pathlib, no mutable defaults |
| **javascript.mdc** | Modern JS: const/let, template literals, destructuring, async/await |
| **go.mdc** | Idiomatic Go: error handling, receiver naming, zero values, context |
| **rust.mdc** | Rust: ownership, pattern matching, error propagation, iterator chains |

## Frameworks (15)

| Template | Description |
|----------|-------------|
| **react.mdc** | React hooks, component patterns, prop validation, render optimization |
| **nextjs.mdc** | Next.js App Router, RSC, data fetching, metadata, route handlers |
| **vue.mdc** | Vue 3 Composition API, refs, computed, lifecycle, template syntax |
| **express.mdc** | Express middleware, error handling, route organization, validation |
| **django.mdc** | Django models, views, templates, ORM patterns, migrations |
| **fastapi.mdc** | FastAPI async patterns, Pydantic validation, dependency injection |
| **nestjs.mdc** | NestJS modules, providers, decorators, dependency injection |
| **flask.mdc** | Flask blueprints, request context, templates, extensions |
| **tailwind-css.mdc** | Tailwind utility classes, responsive design, custom config |
| **svelte.mdc** | Svelte reactive statements, stores, component lifecycle |
| **react-native.mdc** | React Native components, navigation, platform-specific code |
| **angular.mdc** | Angular modules, components, services, RxJS patterns |
| **remix.mdc** | Remix loaders, actions, forms, error boundaries |
| **nuxt.mdc** | Nuxt composables, server routes, auto-imports, layouts |
| **laravel.mdc** | Laravel Eloquent, migrations, validation, resource controllers |

## Practices (12)

| Template | Description |
|----------|-------------|
| **testing.mdc** | Test structure, mocking strategy, coverage philosophy, AAA pattern |
| **security.mdc** | Input validation, auth patterns, secrets management, OWASP basics |
| **error-handling.mdc** | Error types, recovery strategies, logging, user-facing messages |
| **clean-code.mdc** | Naming, function size, comments, SOLID principles, refactoring |
| **git-workflow.mdc** | Commit messages, branch naming, PR descriptions, merge strategy |
| **code-review.mdc** | Review checklist, feedback patterns, approval criteria |
| **documentation.mdc** | README structure, API docs, code comments, changelog format |
| **api-design.mdc** | REST/GraphQL patterns, versioning, error responses, pagination |
| **performance.mdc** | Lazy loading, caching, N+1 queries, bundle size, memory leaks |
| **accessibility.mdc** | ARIA labels, keyboard nav, color contrast, semantic HTML |
| **monitoring.mdc** | Logging patterns, metrics, error tracking, alerting thresholds |
| **refactoring.mdc** | When to refactor, extract methods, reduce coupling, safe changes |

## Tools (15)

| Template | Description |
|----------|-------------|
| **jest.mdc** | Jest matchers, mocks, setup/teardown, snapshot testing |
| **cypress.mdc** | Cypress selectors, custom commands, fixtures, assertions |
| **docker.mdc** | Dockerfile best practices, multi-stage builds, layer caching |
| **graphql.mdc** | Schema design, resolvers, N+1 prevention, error handling |
| **prisma.mdc** | Prisma schema, migrations, queries, relations, transactions |
| **postgresql.mdc** | PostgreSQL indexing, query optimization, constraints, migrations |
| **mongodb.mdc** | MongoDB schema design, aggregations, indexing, validation |
| **playwright.mdc** | Playwright selectors, page objects, fixtures, parallelization |
| **vitest.mdc** | Vitest setup, mocks, coverage, UI mode, browser testing |
| **storybook.mdc** | Storybook stories, controls, decorators, interaction testing |
| **pytest.mdc** | Pytest fixtures, parametrize, markers, conftest patterns |
| **trpc.mdc** | tRPC routers, procedures, middleware, input validation |
| **supabase.mdc** | Supabase auth, RLS policies, real-time, storage patterns |
| **redis.mdc** | Redis caching patterns, pub/sub, key naming, expiration |
| **turborepo.mdc** | Turborepo tasks, caching, pipeline config, remote cache |

## AI Tools (3)

| Template | Description |
|----------|-------------|
| **copilot-instructions.mdc** | GitHub Copilot configuration and coding preferences |
| **claude-md.mdc** | Claude-specific instructions for code generation |
| **cross-tool-config.mdc** | Shared rules that work across Cursor, Copilot, and other AI tools |

---

**Need more templates?** Browse the full collection at [cursorrules-collection](https://github.com/PatrickJS/awesome-cursorrules)

**Found a bug in a template?** Run `cursor-doctor lint` to detect conflicts, then `cursor-doctor fix` to auto-repair common issues.
