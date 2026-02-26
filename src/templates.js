// Template rules for common stacks
// Each template should be genuinely useful, not generic filler

const TEMPLATES = {
  typescript: {
    name: 'typescript.mdc',
    content: `---
description: TypeScript conventions and best practices
globs: ["*.ts", "*.tsx"]
alwaysApply: false
---

# TypeScript Guidelines

## Type Safety
- Prefer explicit return types on exported functions
- Use strict TypeScript config: enable noImplicitAny, strictNullChecks, noUncheckedIndexedAccess
- Avoid \`any\` — use \`unknown\` for truly dynamic values, then narrow with type guards
- Use discriminated unions instead of optional properties when modeling states

## Naming
- Interfaces: PascalCase (e.g., \`UserProfile\`)
- Type aliases: PascalCase (e.g., \`RequestHandler\`)
- Generic parameters: single letter (T, K, V) for simple cases, descriptive names for complex ones

## Organization
- Colocate types with the code that uses them
- Export types from index files for public API
- Use \`type\` for unions/intersections, \`interface\` for object shapes that might be extended

## Patterns
- Use \`satisfies\` to validate object literals without widening types
- Prefer tuple types with labeled elements: \`[name: string, age: number]\`
- Use template literal types for string patterns (e.g., route keys)
`,
  },

  react: {
    name: 'react.mdc',
    content: `---
description: React component patterns and conventions
globs: ["*.tsx", "*.jsx"]
alwaysApply: false
---

# React Guidelines

## Component Structure
- Prefer function components with hooks over class components
- Use named exports for components (easier to refactor and tree-shake)
- Extract custom hooks when logic is reused across >2 components
- Keep components under 150 lines — split into subcomponents or hooks if longer

## Hooks
- Declare hooks at the top level, never conditionally
- Use \`useCallback\` for functions passed to memoized children
- Use \`useMemo\` only when profiling shows a performance benefit
- Custom hooks should start with \`use\` prefix

## Props
- Destructure props in the function signature for clarity
- Use TypeScript interfaces for prop types, not inline types
- Prefer required props over optional with defaults

## State Management
- Prefer URL state (query params) for shareable UI state
- Use context for deeply-nested data, not as global store
- Colocate state with the component that owns it — lift only when needed

## Patterns
- Use compound components for related UI groups (e.g., Tabs)
- Avoid prop drilling — use composition or context after 2-3 levels
- Keep JSX readable: extract complex conditionals into variables
`,
  },

  nextjs: {
    name: 'nextjs.mdc',
    content: `---
description: Next.js app architecture and routing
globs: ["*.ts", "*.tsx", "next.config.*"]
alwaysApply: false
---

# Next.js Guidelines

## App Router (13+)
- Use Server Components by default — add \`'use client'\` only when needed (interactivity, hooks, browser APIs)
- Server Components: data fetching, async/await directly in component
- Client Components: event handlers, state, effects, browser-only code
- Never import Server Components into Client Components

## Routing
- Colocate components in route folders, use \`_components/\` prefix for private files
- Use Route Handlers (route.ts) for API endpoints, not pages/api
- Dynamic routes: \`[id]\` for single, \`[...slug]\` for catch-all
- Parallel routes and intercepting routes for modals and multi-pane UIs

## Data Fetching
- Use \`fetch\` in Server Components — automatic deduplication and caching
- Prefer server-side fetching over client-side for initial data
- Use \`loading.tsx\` for instant loading states (Suspense boundaries)
- Use \`error.tsx\` for error boundaries

## Performance
- Use \`next/image\` for all images — automatic optimization
- Enable PPR (Partial Prerendering) when available
- Use \`revalidate\` in fetch options for ISR, not getStaticProps
- Lazy load client components with \`next/dynamic\`
`,
  },

  python: {
    name: 'python.mdc',
    content: `---
description: Python style and conventions
globs: ["*.py"]
alwaysApply: false
---

# Python Guidelines

## Style
- Follow PEP 8 for formatting (use black or ruff for auto-formatting)
- Type hints on all public functions: \`def get_user(id: int) -> User | None:\`
- Docstrings for modules, classes, and public functions (Google or NumPy style)
- Max line length: 88 characters (black default)

## Structure
- One class per file unless tightly coupled
- Group imports: stdlib, third-party, local (separated by blank lines)
- Use \`__init__.py\` to expose public API, keep internals private with \`_prefix\`

## Typing
- Use \`from __future__ import annotations\` for modern type syntax in 3.9+
- Prefer \`list[str]\` over \`List[str]\` (3.9+)
- Use \`| None\` instead of \`Optional\` (3.10+)
- Use Protocol for structural subtyping, not abstract classes

## Patterns
- Use dataclasses for data containers, not dicts
- Context managers (\`with\`) for resource management
- Comprehensions for simple transformations, generator expressions for large data
- Avoid mutable default arguments — use \`None\` and initialize in function body
`,
  },

  django: {
    name: 'django.mdc',
    content: `---
description: Django models, views, and architecture
globs: ["*.py"]
alwaysApply: false
---

# Django Guidelines

## Models
- Singular names: \`User\`, \`Order\` (Django pluralizes automatically)
- Use \`models.TextChoices\` or \`models.IntegerChoices\` for choice fields
- Indexes: add \`db_index=True\` to foreign keys and frequently queried fields
- Use \`select_related\` for one-to-one/foreign key, \`prefetch_related\` for many-to-many
- Custom managers for reusable querysets

## Views
- Prefer class-based views for CRUD, function-based for custom logic
- Use \`get_object_or_404\` instead of manual try/except for single-object lookups
- Keep views thin — move business logic to models, managers, or services
- Return JSON with \`JsonResponse\`, not serialized strings

## URLs
- Use path converters: \`path('users/<int:id>/', ...)\` not regex
- Name all URL patterns: \`name='user-detail'\`
- Namespace apps: \`app_name = 'blog'\` in urls.py

## Queries
- Use \`.only()\` and \`.defer()\` to limit fields when fetching large models
- Annotate/aggregate at database level, not Python loops
- Use \`Q\` objects for complex lookups, not raw SQL
- Avoid N+1 queries — use debug toolbar to catch them

## Settings
- Use environment variables for secrets (python-decouple or django-environ)
- Split settings: base.py, dev.py, prod.py
- Never commit SECRET_KEY or database credentials
`,
  },

  go: {
    name: 'go.mdc',
    content: `---
description: Go idioms and best practices
globs: ["*.go"]
alwaysApply: false
---

# Go Guidelines

## Style
- Run \`gofmt\` (automatic with most editors)
- Use \`golangci-lint\` for comprehensive linting
- Package names: lowercase, single word, no underscores
- Exported names: PascalCase; unexported: camelCase

## Error Handling
- Always check errors immediately: \`if err != nil { return err }\`
- Wrap errors with context: \`fmt.Errorf("failed to save user: %w", err)\`
- Use \`errors.Is\` and \`errors.As\` for sentinel and type checking
- Return errors, don't panic (except for truly unrecoverable situations)

## Concurrency
- Use channels for communication, mutexes for state protection
- Close channels from sender side, never receiver
- Use \`context.Context\` for cancellation and timeouts
- \`defer\` unlock calls immediately after lock: \`mu.Lock(); defer mu.Unlock()\`

## Organization
- Keep packages focused: one responsibility per package
- Use internal/ for private code (enforced by compiler)
- Minimize dependencies between packages (dependency graph should be acyclic)

## Patterns
- Accept interfaces, return structs
- Use \`io.Reader\`/\`io.Writer\` for streaming data
- Constructor pattern: \`func NewClient(opts ...Option) *Client\`
- Avoid getters/setters — expose fields directly or use methods that do work
`,
  },

  rust: {
    name: 'rust.mdc',
    content: `---
description: Rust patterns and idiomatic code
globs: ["*.rs"]
alwaysApply: false
---

# Rust Guidelines

## Ownership
- Prefer borrowing (\`&T\`, \`&mut T\`) over owned values when possible
- Use \`.clone()\` explicitly — no hidden copies
- Use \`Cow<str>\` when you might need to clone, but usually don't
- \`Arc<T>\` for shared ownership across threads, \`Rc<T>\` for single-threaded

## Error Handling
- Use \`Result<T, E>\` for recoverable errors, panic for bugs
- Use \`?\` operator to propagate errors, not manual \`match\`
- Use \`thiserror\` for library errors, \`anyhow\` for application errors
- Implement \`std::error::Error\` for custom error types

## Types
- Use newtypes for domain concepts: \`struct UserId(u64)\`
- Prefer \`Option<T>\` over nullable pointers
- Use \`enum\` for state machines and variants
- Use \`#[non_exhaustive]\` on public enums for forward compatibility

## Patterns
- Builder pattern for complex construction: \`Config::builder().timeout(30).build()\`
- Use \`impl Trait\` for return types instead of boxing when possible
- Use \`#[derive(Debug, Clone)]\` by default, add others as needed
- Avoid \`unwrap()\` in production code — use \`expect()\` with a message or propagate errors

## Performance
- Use iterators, not loops — they're zero-cost and composable
- Prefer \`&[T]\` over \`&Vec<T>\` in function signatures
- Use \`#[inline]\` sparingly, only after profiling
- Use \`cargo flamegraph\` or \`perf\` for profiling
`,
  },

  vue: {
    name: 'vue.mdc',
    content: `---
description: Vue 3 composition API and component patterns
globs: ["*.vue"]
alwaysApply: false
---

# Vue 3 Guidelines

## Composition API
- Use \`<script setup>\` for all components (less boilerplate)
- Declare reactive state with \`ref\` for primitives, \`reactive\` for objects
- Extract reusable logic into composables (functions that start with \`use\`)
- Use \`computed\` for derived state, not methods

## Component Structure
- Template-first: put \`<template>\` before \`<script>\`
- Single file components: template, script, style in one .vue file
- Keep components under 200 lines — extract child components if longer
- Use \`defineProps\` and \`defineEmits\` (no imports needed with \`<script setup>\`)

## Props and Events
- Use TypeScript for prop types: \`defineProps<{ userId: number }>()\`
- Emit events for child-to-parent communication, not prop mutations
- Use \`v-model\` for two-way binding, with \`update:modelValue\` event

## Directives
- Use \`v-if\` for conditional rendering, \`v-show\` for toggling visibility (DOM stays)
- Use \`v-for\` with \`:key\` — keys should be stable and unique
- Use \`v-memo\` for expensive lists that rarely change

## Performance
- Use \`shallowRef\` for large objects that are replaced, not mutated
- Use \`v-once\` for static content that never changes
- Lazy load routes with \`() => import('./views/About.vue')\`
`,
  },

  svelte: {
    name: 'svelte.mdc',
    content: `---
description: Svelte component patterns and reactivity
globs: ["*.svelte"]
alwaysApply: false
---

# Svelte Guidelines

## Reactivity
- Reactive statements: \`$: doubled = count * 2\` (re-runs when dependencies change)
- Use \`$:\` for side effects: \`$: console.log('count is', count)\`
- Update arrays/objects with assignment, not mutation: \`items = [...items, newItem]\`
- Use stores (\`writable\`, \`readable\`, \`derived\`) for global state

## Component Structure
- Export variables to make them props: \`export let name\`
- Use \`$$props\` and \`$$restProps\` to forward props
- Emit events with \`createEventDispatcher\` or bubble with \`on:click\`
- Use slots for composition: \`<slot />\` and named slots

## Directives
- \`use:action\` for lifecycle hooks on DOM elements
- \`bind:this\` to get DOM references
- \`class:active={isActive}\` for conditional classes
- \`on:event|modifiers\` for event handling (\`preventDefault\`, \`stopPropagation\`, etc.)

## SvelteKit (if used)
- Use \`+page.svelte\` for routes, \`+page.ts\` for load functions
- Use \`+layout.svelte\` for shared layouts
- Use \`$app/stores\` for page, navigating, updated stores
- Form actions in \`+page.server.ts\` for progressive enhancement

## Patterns
- Keep logic in \`<script>\`, not template — complex expressions should be variables
- Use \`{#await promise}\` for async data in templates
- Use transitions: \`transition:fade\`, \`in:fly\`, \`out:scale\`
`,
  },

  tailwind: {
    name: 'tailwind.mdc',
    content: `---
description: Tailwind CSS utility patterns and conventions
globs: ["*.css", "*.tsx", "*.jsx"]
alwaysApply: false
---

# Tailwind CSS Guidelines

## Utility Classes
- Use utilities for layout, spacing, colors — avoid custom CSS when possible
- Group utilities logically: layout → spacing → typography → colors → effects
- Use \`@apply\` sparingly, only for truly reusable patterns (extract components instead)
- Use arbitrary values when needed: \`w-[127px]\`, \`text-[#1da1f2]\`

## Responsive Design
- Mobile-first: default classes apply to all sizes, add \`md:\`, \`lg:\` for larger screens
- Use container utilities: \`container mx-auto px-4\`
- Use responsive utilities: \`grid-cols-1 md:grid-cols-2 lg:grid-cols-3\`

## Dark Mode
- Configure dark mode in tailwind.config (class or media strategy)
- Use \`dark:\` variant: \`bg-white dark:bg-gray-800\`
- Group related variants: \`text-gray-900 dark:text-gray-100\`

## Customization
- Extend theme in tailwind.config.js, don't replace defaults
- Use CSS variables for dynamic values (e.g., user themes)
- Use \`clsx\` or \`cn\` helper for conditional classes
- Keep config organized: colors, spacing, fonts, plugins

## Components
- Extract components when same classes repeat >3 times
- Use \`@layer components\` for component classes, \`@layer utilities\` for custom utilities
- Prefix custom classes to avoid conflicts: \`btn-primary\` not \`primary\`
`,
  },

  express: {
    name: 'express.mdc',
    content: `---
description: Express.js API routes and middleware
globs: ["*.js", "*.ts"]
alwaysApply: false
---

# Express Guidelines

## Routing
- Use Router() for modular route definitions: \`const router = express.Router()\`
- Group routes by resource: \`/api/users\`, \`/api/posts\`
- Use route parameters for dynamic segments: \`/users/:id\`
- Use query strings for filters: \`/users?role=admin\`

## Middleware
- Order matters: error handlers go last, after all routes
- Use \`app.use(express.json())\` for JSON body parsing
- Use \`next()\` to pass control, \`next(err)\` to trigger error handler
- Keep middleware focused: one responsibility per function

## Error Handling
- Use async error wrapper to avoid try/catch in every route
- Centralized error handler: \`app.use((err, req, res, next) => {...})\`
- Return consistent error format: \`{ error: { message, code, details } }\`
- Use HTTP status codes correctly: 400 (bad request), 401 (unauthorized), 404 (not found), 500 (server error)

## Request/Response
- Validate input before processing (use express-validator or zod)
- Use \`res.status(code).json(data)\`, not \`res.send\`
- Set appropriate headers: \`Content-Type\`, \`Cache-Control\`
- Use \`res.locals\` to pass data between middleware

## Security
- Use helmet for security headers
- Rate limit with express-rate-limit
- Sanitize input to prevent XSS and SQL injection
- Use CORS middleware, configure allowed origins
`,
  },

  testing: {
    name: 'testing.mdc',
    content: `---
description: Testing patterns and conventions
globs: ["*.test.*", "*.spec.*"]
alwaysApply: false
---

# Testing Guidelines

## Structure
- One test file per source file: \`user.ts\` → \`user.test.ts\`
- Use \`describe\` blocks to group related tests
- Test names: \`it('should <expected behavior> when <condition>')\`
- Arrange-Act-Assert pattern: setup → execute → verify

## What to Test
- Public API, not implementation details
- Edge cases: null, undefined, empty arrays, boundary values
- Error paths: what happens when things fail
- Integration points: API calls, database queries, external services

## Mocking
- Mock external dependencies (API clients, databases), not your own code
- Use dependency injection to make code testable
- Prefer test doubles that verify behavior (spies), not just return values (stubs)
- Reset mocks between tests: \`beforeEach(() => jest.clearAllMocks())\`

## Assertions
- One logical assertion per test (multiple expect calls are OK if testing same outcome)
- Use specific matchers: \`toEqual\` for deep equality, \`toBe\` for identity
- Use \`toThrow\` for error testing, with specific error message or type

## Best Practices
- Tests should be fast (<1s per test file ideal)
- Tests should be independent — order shouldn't matter
- Avoid snapshot tests for complex objects (brittle)
- Use factories or builders for test data, not inline objects
`,
  },
};

function getTemplate(stack) {
  const key = stack.toLowerCase();
  return TEMPLATES[key] || null;
}

function getAllTemplates() {
  return Object.values(TEMPLATES);
}

function getTemplateNames() {
  return Object.keys(TEMPLATES);
}

module.exports = { getTemplate, getAllTemplates, getTemplateNames, TEMPLATES };
