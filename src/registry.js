// Community rules registry
// Built-in rule packs for common frameworks and concerns

const REGISTRY = {
  react: {
    name: 'React',
    description: 'Component patterns, hooks, state management, and performance',
    rules: [
      {
        filename: 'react-hooks.mdc',
        description: 'React hooks patterns and rules',
        globs: ['**/*.tsx', '**/*.jsx'],
        alwaysApply: false,
        body: `---
description: React hooks patterns and rules
globs: ["**/*.tsx", "**/*.jsx"]
alwaysApply: false
---

# React Hooks

- Never call hooks inside conditions, loops, or nested functions
- Extract custom hooks when logic is shared between 2+ components
- Use useCallback for functions passed as props to memoized children
- Prefer useReducer over useState for complex state with multiple sub-values
- Always include cleanup in useEffect when subscribing to external sources
- Custom hook names must start with "use" prefix
- Dependencies array in useEffect/useCallback/useMemo must include all values from component scope
`
      },
      {
        filename: 'react-components.mdc',
        description: 'Component structure and patterns',
        globs: ['**/*.tsx', '**/*.jsx'],
        alwaysApply: false,
        body: `---
description: Component structure and patterns
globs: ["**/*.tsx", "**/*.jsx"]
alwaysApply: false
---

# React Components

- Keep components under 150 lines (split into subcomponents or hooks if longer)
- Use named exports for components (easier to refactor and grep)
- Destructure props in function signature for clarity
- Avoid prop drilling beyond 2-3 levels (use composition or context)
- Keep JSX readable: extract complex conditionals into variables before return
- Use compound components for related UI groups (Tabs, Accordion, etc)
- Prefer composition over configuration for flexible components
`
      },
      {
        filename: 'react-state.mdc',
        description: 'State management patterns',
        globs: ['**/*.tsx', '**/*.jsx'],
        alwaysApply: false,
        body: `---
description: State management patterns
globs: ["**/*.tsx", "**/*.jsx"]
alwaysApply: false
---

# State Management

- Prefer URL state (query params) for shareable UI state
- Colocate state with the component that owns it (lift only when needed)
- Use context for deeply-nested data, not as global store replacement
- Avoid storing derived data in state (use useMemo or compute in render)
- Initialize state with function when initial value is expensive to compute
- Use refs for values that don't trigger re-renders (timers, DOM nodes)
- For complex state, prefer useReducer with clear action types over multiple useState
`
      },
      {
        filename: 'react-performance.mdc',
        description: 'Performance optimization patterns',
        globs: ['**/*.tsx', '**/*.jsx'],
        alwaysApply: false,
        body: `---
description: Performance optimization patterns
globs: ["**/*.tsx", "**/*.jsx"]
alwaysApply: false
---

# React Performance

- Use React.memo() only after profiling shows re-render issue
- Avoid inline object/array literals in JSX (creates new reference each render)
- Use useMemo only when profiling shows benefit (not for every calculation)
- Lazy load route components with React.lazy() and Suspense
- Use key prop correctly: stable, unique IDs (not array index unless list never changes)
- Avoid creating functions inside render (extract or useCallback if passed to memoized children)
- Virtualize long lists with react-window or react-virtual
`
      }
    ]
  },

  nextjs: {
    name: 'Next.js',
    description: 'App router, server components, data fetching, and routing',
    rules: [
      {
        filename: 'nextjs-app-router.mdc',
        description: 'App Router architecture patterns',
        globs: ['**/app/**/*.tsx', '**/app/**/*.ts'],
        alwaysApply: false,
        body: `---
description: App Router architecture patterns
globs: ["**/app/**/*.tsx", "**/app/**/*.ts"]
alwaysApply: false
---

# Next.js App Router

- Use Server Components by default (add "use client" only when needed)
- Server Components: data fetching, async/await, direct database access
- Client Components: event handlers, useState, useEffect, browser APIs
- Never import Server Components into Client Components
- Colocate components in route folders, use underscore prefix for private files
- Use loading.tsx for instant loading states (Suspense boundaries)
- Use error.tsx for error boundaries at route level
`
      },
      {
        filename: 'nextjs-server-components.mdc',
        description: 'Server Components patterns',
        globs: ['**/app/**/*.tsx', '**/app/**/*.ts'],
        alwaysApply: false,
        body: `---
description: Server Components patterns
globs: ["**/app/**/*.tsx", "**/app/**/*.ts"]
alwaysApply: false
---

# Server Components

- Fetch data directly in Server Components (no client-side fetching for initial data)
- Use async/await in Server Components (they can be async functions)
- Access backend resources directly (databases, file system, env vars)
- Avoid state, effects, browser APIs, and event handlers in Server Components
- Use next/headers (cookies, headers) only in Server Components
- Streaming: return promises and wrap in Suspense for progressive rendering
- Use generateMetadata for dynamic metadata (SEO, social cards)
`
      },
      {
        filename: 'nextjs-data-fetching.mdc',
        description: 'Data fetching and caching',
        globs: ['**/app/**/*.tsx', '**/app/**/*.ts'],
        alwaysApply: false,
        body: `---
description: Data fetching and caching
globs: ["**/app/**/*.tsx", "**/app/**/*.ts"]
alwaysApply: false
---

# Data Fetching

- Use fetch() in Server Components (automatic deduplication and caching)
- Add revalidate in fetch options for ISR: fetch(url, { next: { revalidate: 3600 } })
- Use cache: "no-store" for always-fresh data
- Use unstable_cache for non-fetch data sources (database, CMS)
- Parallel data fetching: start all fetches before awaiting
- Use revalidatePath or revalidateTag in Server Actions to update cache
- Prefer server-side data fetching over client-side for initial page data
`
      },
      {
        filename: 'nextjs-routing.mdc',
        description: 'Routing and navigation patterns',
        globs: ['**/app/**/*.tsx', '**/app/**/*.ts'],
        alwaysApply: false,
        body: `---
description: Routing and navigation patterns
globs: ["**/app/**/*.tsx", "**/app/**/*.ts"]
alwaysApply: false
---

# Routing

- Dynamic routes: [id] for single param, [...slug] for catch-all
- Use Route Handlers (route.ts) for API endpoints, not pages/api
- Parallel routes (@folder) for simultaneous route rendering
- Intercepting routes ((.)) for modals and overlays
- Use Link component for navigation (prefetches automatically)
- Use useRouter from next/navigation for programmatic navigation
- Group routes with (folder-name) without affecting URL structure
`
      }
    ]
  },

  typescript: {
    name: 'TypeScript',
    description: 'Strict types, interfaces, generics, and error handling',
    rules: [
      {
        filename: 'typescript-types.mdc',
        description: 'Type safety and conventions',
        globs: ['**/*.ts', '**/*.tsx'],
        alwaysApply: false,
        body: `---
description: Type safety and conventions
globs: ["**/*.ts", "**/*.tsx"]
alwaysApply: false
---

# TypeScript Types

- Prefer explicit return types on exported functions
- Enable strict mode: noImplicitAny, strictNullChecks, noUncheckedIndexedAccess
- Avoid any (use unknown for truly dynamic values, then narrow with type guards)
- Use discriminated unions instead of optional properties for state modeling
- Use const assertions for literal types: const routes = ["home", "about"] as const
- Prefer type for unions/intersections, interface for object shapes that extend
- Use satisfies operator to validate literals without widening types
`
      },
      {
        filename: 'typescript-interfaces.mdc',
        description: 'Interfaces and type composition',
        globs: ['**/*.ts', '**/*.tsx'],
        alwaysApply: false,
        body: `---
description: Interfaces and type composition
globs: ["**/*.ts", "**/*.tsx"]
alwaysApply: false
---

# Interfaces

- Use PascalCase for interfaces and type aliases
- Colocate types with code that uses them (export from index for public API)
- Prefer interface for object shapes (better error messages, can be extended)
- Use type for unions, intersections, mapped types, and conditional types
- Use generic constraints: <T extends SomeBase> to limit type parameters
- Use utility types: Partial, Pick, Omit, Required, Readonly
- Avoid empty interfaces (use type alias or add properties)
`
      },
      {
        filename: 'typescript-generics.mdc',
        description: 'Generic patterns and constraints',
        globs: ['**/*.ts', '**/*.tsx'],
        alwaysApply: false,
        body: `---
description: Generic patterns and constraints
globs: ["**/*.ts", "**/*.tsx"]
alwaysApply: false
---

# Generics

- Use single letter (T, K, V) for simple generics, descriptive names for complex
- Add constraints when needed: <T extends { id: string }> or <K extends keyof T>
- Use default type parameters when reasonable: <T = string>
- Avoid over-generic types (if T is always string, don't use a generic)
- Use tuple types with labeled elements: [name: string, age: number]
- Use template literal types for string patterns: type Route = \`/api/\${string}\`
- Infer types from usage when possible instead of explicit type parameters
`
      },
      {
        filename: 'typescript-errors.mdc',
        description: 'Error handling patterns',
        globs: ['**/*.ts', '**/*.tsx'],
        alwaysApply: false,
        body: `---
description: Error handling patterns
globs: ["**/*.ts", "**/*.tsx"]
alwaysApply: false
---

# Error Handling

- Type errors with custom classes or discriminated unions
- Use unknown for caught errors: catch (error: unknown)
- Narrow error types with type guards before accessing properties
- Return Result types for expected errors: { ok: true, data: T } | { ok: false, error: E }
- Use NonNullable and strict null checks to avoid null/undefined errors
- Validate external data at boundaries (API responses, user input)
- Use Zod or similar for runtime type validation of untrusted data
`
      }
    ]
  },

  python: {
    name: 'Python',
    description: 'PEP 8, type hints, async patterns, and testing',
    rules: [
      {
        filename: 'python-style.mdc',
        description: 'PEP 8 and code style',
        globs: ['**/*.py'],
        alwaysApply: false,
        body: `---
description: PEP 8 and code style
globs: ["**/*.py"]
alwaysApply: false
---

# Python Style

- Follow PEP 8 (use black or ruff for auto-formatting)
- Max line length: 88 characters (black default)
- Use snake_case for functions and variables, PascalCase for classes
- Use UPPER_CASE for constants
- One class per file unless tightly coupled
- Group imports: stdlib, third-party, local (separated by blank lines)
- Use underscores for private: _internal_function, __private_attribute
`
      },
      {
        filename: 'python-typing.mdc',
        description: 'Type hints and annotations',
        globs: ['**/*.py'],
        alwaysApply: false,
        body: `---
description: Type hints and annotations
globs: ["**/*.py"]
alwaysApply: false
---

# Type Hints

- Use from __future__ import annotations for modern syntax (3.9+)
- Type hint all public functions: def get_user(id: int) -> User | None:
- Use list[str] instead of List[str] (3.9+), dict[str, int] instead of Dict
- Use | None instead of Optional (3.10+)
- Use Protocol for structural subtyping, not ABC
- Use TypedDict for dictionaries with known keys
- Use dataclasses for data containers instead of plain dicts
`
      },
      {
        filename: 'python-async.mdc',
        description: 'Async/await patterns',
        globs: ['**/*.py'],
        alwaysApply: false,
        body: `---
description: Async/await patterns
globs: ["**/*.py"]
alwaysApply: false
---

# Async Patterns

- Use async def for I/O-bound operations (network, file system, database)
- Always await async functions (don't forget await keyword)
- Use asyncio.gather() to run multiple async operations concurrently
- Use async with for async context managers
- Use async for for async iterators
- Use asyncio.create_task() to run tasks in background
- Avoid mixing blocking and async code (use asyncio.to_thread for blocking calls)
`
      },
      {
        filename: 'python-testing.mdc',
        description: 'Testing conventions',
        globs: ['**/test_*.py', '**/*_test.py'],
        alwaysApply: false,
        body: `---
description: Testing conventions
globs: ["**/test_*.py", "**/*_test.py"]
alwaysApply: false
---

# Python Testing

- Use pytest (not unittest) for new projects
- Test file naming: test_module.py or module_test.py
- Test function naming: test_function_behavior_when_condition
- Use fixtures for setup/teardown and shared test data
- Use parametrize for testing multiple inputs: @pytest.mark.parametrize
- Mock external dependencies with pytest-mock or unittest.mock
- Use assert statements (pytest shows helpful diffs)
`
      }
    ]
  },

  go: {
    name: 'Go',
    description: 'Error handling, concurrency, packages, and testing',
    rules: [
      {
        filename: 'go-errors.mdc',
        description: 'Error handling patterns',
        globs: ['**/*.go'],
        alwaysApply: false,
        body: `---
description: Error handling patterns
globs: ["**/*.go"]
alwaysApply: false
---

# Go Error Handling

- Always check errors immediately: if err != nil { return err }
- Wrap errors with context: fmt.Errorf("failed to save user: %w", err)
- Use errors.Is for sentinel error checking, errors.As for type checking
- Return errors, don't panic (panic only for truly unrecoverable situations)
- Create custom error types that implement error interface for structured errors
- Use defer for cleanup even when errors occur
- Name error variables err (not e, error, or other variants)
`
      },
      {
        filename: 'go-concurrency.mdc',
        description: 'Goroutines and channels',
        globs: ['**/*.go'],
        alwaysApply: false,
        body: `---
description: Goroutines and channels
globs: ["**/*.go"]
alwaysApply: false
---

# Concurrency

- Use channels for communication between goroutines, mutexes for shared state
- Close channels from sender side only, never from receiver
- Use buffered channels when you know capacity to avoid blocking
- Use context.Context for cancellation, deadlines, and request-scoped values
- Use sync.WaitGroup to wait for multiple goroutines to complete
- Lock/unlock pattern: mu.Lock(); defer mu.Unlock()
- Avoid goroutine leaks: always have a way to stop goroutines
`
      },
      {
        filename: 'go-packages.mdc',
        description: 'Package organization',
        globs: ['**/*.go'],
        alwaysApply: false,
        body: `---
description: Package organization
globs: ["**/*.go"]
alwaysApply: false
---

# Package Organization

- Package names: lowercase, single word, no underscores
- Keep packages focused: one responsibility per package
- Use internal/ directory for private code (enforced by compiler)
- Minimize dependencies between packages (acyclic dependency graph)
- Accept interfaces, return structs
- Use constructors: func NewClient(opts ...Option) *Client
- Exported names: PascalCase, unexported: camelCase
`
      },
      {
        filename: 'go-testing.mdc',
        description: 'Testing conventions',
        globs: ['**/*_test.go'],
        alwaysApply: false,
        body: `---
description: Testing conventions
globs: ["**/*_test.go"]
alwaysApply: false
---

# Go Testing

- Test files: module_test.go in same package as module.go
- Test function naming: TestFunctionName or TestFunction_Behavior
- Use table-driven tests for multiple inputs
- Use t.Helper() in test helper functions
- Use t.Parallel() for independent tests that can run concurrently
- Use testdata/ directory for test fixtures
- Benchmark functions: func BenchmarkName(b *testing.B)
`
      }
    ]
  },

  rust: {
    name: 'Rust',
    description: 'Ownership, error handling, traits, and testing',
    rules: [
      {
        filename: 'rust-ownership.mdc',
        description: 'Ownership and borrowing',
        globs: ['**/*.rs'],
        alwaysApply: false,
        body: `---
description: Ownership and borrowing
globs: ["**/*.rs"]
alwaysApply: false
---

# Ownership

- Prefer borrowing (&T, &mut T) over owned values when possible
- Use .clone() explicitly (no hidden copies in Rust)
- Use Cow<str> when you might need to clone, but usually don't
- Arc<T> for shared ownership across threads, Rc<T> for single-threaded
- Use references in function parameters unless you need ownership
- Avoid Clone when you can restructure to pass references
- Use &[T] slices instead of &Vec<T> in function signatures
`
      },
      {
        filename: 'rust-errors.mdc',
        description: 'Error handling',
        globs: ['**/*.rs'],
        alwaysApply: false,
        body: `---
description: Error handling
globs: ["**/*.rs"]
alwaysApply: false
---

# Error Handling

- Use Result<T, E> for recoverable errors, panic for programmer errors
- Use ? operator to propagate errors (not manual match)
- Use thiserror for library errors, anyhow for application errors
- Implement std::error::Error trait for custom error types
- Avoid unwrap() in production (use expect() with message or propagate)
- Use ok_or() and ok_or_else() to convert Option to Result
- Pattern match on errors when you need to handle specific cases
`
      },
      {
        filename: 'rust-traits.mdc',
        description: 'Traits and types',
        globs: ['**/*.rs'],
        alwaysApply: false,
        body: `---
description: Traits and types
globs: ["**/*.rs"]
alwaysApply: false
---

# Traits and Types

- Use newtypes for domain concepts: struct UserId(u64)
- Prefer Option<T> over nullable pointers
- Use enum for state machines and variants (not multiple bools)
- Use #[non_exhaustive] on public enums for forward compatibility
- Derive common traits: #[derive(Debug, Clone)]
- Use impl Trait for return types instead of Box<dyn> when possible
- Use trait bounds clearly: <T: Display + Clone> or where clauses for complex bounds
`
      },
      {
        filename: 'rust-testing.mdc',
        description: 'Testing patterns',
        globs: ['**/*.rs'],
        alwaysApply: false,
        body: `---
description: Testing patterns
globs: ["**/*.rs"]
alwaysApply: false
---

# Rust Testing

- Use #[cfg(test)] module for unit tests in same file
- Integration tests go in tests/ directory
- Test naming: fn test_function_behavior()
- Use assert_eq! and assert_ne! for equality checks
- Use #[should_panic] for tests that expect panics
- Use Result<(), Error> as test return type for ? operator
- Use cargo test -- --nocapture to see println! output
`
      }
    ]
  },

  security: {
    name: 'Security',
    description: 'Input validation, authentication, secrets, and dependencies',
    rules: [
      {
        filename: 'security-input.mdc',
        description: 'Input validation and sanitization',
        globs: ['**/*'],
        alwaysApply: false,
        body: `---
description: Input validation and sanitization
globs: ["**/*"]
alwaysApply: false
---

# Input Validation

- Validate all user input at entry points (controllers, API handlers)
- Use allowlists, not denylists (specify what is allowed, not what is forbidden)
- Sanitize data for context: HTML escaping for display, parameterized queries for SQL
- Validate data types, ranges, lengths, and formats
- Reject unexpected fields in API requests (don't silently ignore)
- Use schema validation libraries (Zod, Joi, Pydantic) for complex input
- Never trust client-side validation alone (always validate server-side)
`
      },
      {
        filename: 'security-auth.mdc',
        description: 'Authentication and authorization',
        globs: ['**/*'],
        alwaysApply: false,
        body: `---
description: Authentication and authorization
globs: ["**/*"]
alwaysApply: false
---

# Authentication

- Use established libraries for auth (Passport, NextAuth, Devise) not custom crypto
- Hash passwords with bcrypt, argon2, or scrypt (never MD5 or SHA-1)
- Use secure session management: httpOnly cookies, SameSite, secure flag
- Implement rate limiting on login endpoints to prevent brute force
- Use multi-factor authentication for sensitive operations
- Check authorization on every protected endpoint (don't rely on UI hiding)
- Use least privilege: grant minimum permissions needed
`
      },
      {
        filename: 'security-secrets.mdc',
        description: 'Secrets and sensitive data',
        globs: ['**/*'],
        alwaysApply: false,
        body: `---
description: Secrets and sensitive data
globs: ["**/*"]
alwaysApply: false
---

# Secrets Management

- Never commit secrets to version control (API keys, passwords, tokens)
- Use environment variables or secret management services (Vault, AWS Secrets Manager)
- Add .env to .gitignore, provide .env.example with dummy values
- Rotate secrets regularly (especially after team member departure)
- Use different secrets for dev, staging, and production
- Encrypt sensitive data at rest (database encryption, file encryption)
- Audit access to secrets (who read what and when)
`
      },
      {
        filename: 'security-dependencies.mdc',
        description: 'Dependency security',
        globs: ['**/package.json', '**/requirements.txt', '**/Cargo.toml', '**/go.mod'],
        alwaysApply: false,
        body: `---
description: Dependency security
globs: ["**/package.json", "**/requirements.txt", "**/Cargo.toml", "**/go.mod"]
alwaysApply: false
---

# Dependencies

- Audit dependencies regularly (npm audit, pip-audit, cargo-audit)
- Keep dependencies up to date (automated with Dependabot or Renovate)
- Review dependency changes before updating (check changelogs for breaking changes)
- Minimize dependencies (each dependency is attack surface)
- Pin exact versions in production (not ranges like ^1.0.0)
- Check for known vulnerabilities before adding new dependencies
- Use lockfiles (package-lock.json, poetry.lock, Cargo.lock)
`
      }
    ]
  },

  testing: {
    name: 'Testing',
    description: 'Unit tests, mocking, coverage, and TDD',
    rules: [
      {
        filename: 'testing-structure.mdc',
        description: 'Test structure and organization',
        globs: ['**/*.test.*', '**/*.spec.*', '**/test_*.py', '**/*_test.go'],
        alwaysApply: false,
        body: `---
description: Test structure and organization
globs: ["**/*.test.*", "**/*.spec.*", "**/test_*.py", "**/*_test.go"]
alwaysApply: false
---

# Test Structure

- One test file per source file: user.ts → user.test.ts
- Use describe/context blocks to group related tests
- Test names: should <expected behavior> when <condition>
- Arrange-Act-Assert pattern: setup data → execute action → verify outcome
- Keep tests focused: one logical assertion per test
- Tests should be independent (order should not matter)
- Use beforeEach/afterEach for setup/teardown
`
      },
      {
        filename: 'testing-mocking.mdc',
        description: 'Mocking and test doubles',
        globs: ['**/*.test.*', '**/*.spec.*', '**/test_*.py', '**/*_test.go'],
        alwaysApply: false,
        body: `---
description: Mocking and test doubles
globs: ["**/*.test.*", "**/*.spec.*", "**/test_*.py", "**/*_test.go"]
alwaysApply: false
---

# Mocking

- Mock external dependencies (API clients, databases), not your own code
- Use dependency injection to make code testable
- Prefer spies (verify behavior) over stubs (return values)
- Reset mocks between tests to avoid test pollution
- Don't mock what you don't own (wrap external APIs in adapter layer)
- Use real implementations for simple, fast dependencies (pure functions)
- Verify mock calls with specific arguments, not just that they were called
`
      },
      {
        filename: 'testing-coverage.mdc',
        description: 'Test coverage and quality',
        globs: ['**/*.test.*', '**/*.spec.*', '**/test_*.py', '**/*_test.go'],
        alwaysApply: false,
        body: `---
description: Test coverage and quality
globs: ["**/*.test.*", "**/*.spec.*", "**/test_*.py", "**/*_test.go"]
alwaysApply: false
---

# Coverage

- Aim for 80%+ coverage on business logic (not everything needs 100%)
- Test edge cases: null, undefined, empty arrays, boundary values
- Test error paths (what happens when things fail)
- Coverage metrics don't guarantee quality (test behavior, not implementation)
- Use coverage to find untested code paths, not as success metric
- Test public API, not internal implementation details
- Avoid snapshot tests for complex objects (brittle and low value)
`
      },
      {
        filename: 'testing-tdd.mdc',
        description: 'Test-driven development',
        globs: ['**/*.test.*', '**/*.spec.*', '**/test_*.py', '**/*_test.go'],
        alwaysApply: false,
        body: `---
description: Test-driven development
globs: ["**/*.test.*", "**/*.spec.*", "**/test_*.py", "**/*_test.go"]
alwaysApply: false
---

# TDD

- Red-Green-Refactor cycle: write failing test, make it pass, improve code
- Write test first to clarify requirements and API design
- Start with simplest test case, add complexity incrementally
- Each test should fail for right reason (not syntax error)
- Refactor only when tests are green
- Use TDD for complex logic and algorithms (not for simple CRUD)
- Tests should serve as documentation for expected behavior
`
      }
    ]
  },

  performance: {
    name: 'Performance',
    description: 'Lazy loading, caching, bundle size, and query optimization',
    rules: [
      {
        filename: 'performance-lazy-loading.mdc',
        description: 'Code splitting and lazy loading',
        globs: ['**/*.tsx', '**/*.jsx', '**/*.ts', '**/*.js'],
        alwaysApply: false,
        body: `---
description: Code splitting and lazy loading
globs: ["**/*.tsx", "**/*.jsx", "**/*.ts", "**/*.js"]
alwaysApply: false
---

# Lazy Loading

- Lazy load routes/pages (not all components need immediate loading)
- Use dynamic imports for large dependencies used conditionally
- Defer non-critical scripts (analytics, chat widgets) until after page load
- Use Intersection Observer for loading content when visible
- Preload critical resources with <link rel="preload">
- Avoid loading full libraries when you need single function (use tree-shaking)
- Split vendor bundles to cache common dependencies separately
`
      },
      {
        filename: 'performance-caching.mdc',
        description: 'Caching strategies',
        globs: ['**/*'],
        alwaysApply: false,
        body: `---
description: Caching strategies
globs: ["**/*"]
alwaysApply: false
---

# Caching

- Set appropriate Cache-Control headers (public, private, max-age)
- Use ETags for validation-based caching
- Cache at multiple levels: CDN, server, application, database
- Use stale-while-revalidate for better perceived performance
- Cache expensive computations in memory (Redis, Memcached)
- Invalidate caches explicitly when data changes
- Use versioned URLs for static assets (cache forever)
`
      },
      {
        filename: 'performance-bundle.mdc',
        description: 'Bundle size optimization',
        globs: ['**/*.tsx', '**/*.jsx', '**/*.ts', '**/*.js'],
        alwaysApply: false,
        body: `---
description: Bundle size optimization
globs: ["**/*.tsx", "**/*.jsx", "**/*.ts", "**/*.js"]
alwaysApply: false
---

# Bundle Size

- Analyze bundle with webpack-bundle-analyzer or similar tool
- Remove unused dependencies from package.json
- Use tree-shaking friendly imports (import { x } from 'lib', not import * as lib)
- Avoid large libraries for simple tasks (moment.js vs date-fns)
- Minify and compress assets (gzip or brotli)
- Use code splitting to break large bundles into chunks
- Lazy load images with loading="lazy" attribute
`
      },
      {
        filename: 'performance-queries.mdc',
        description: 'Database and API query optimization',
        globs: ['**/*'],
        alwaysApply: false,
        body: `---
description: Database and API query optimization
globs: ["**/*"]
alwaysApply: false
---

# Query Optimization

- Add indexes to frequently queried fields (foreign keys, search fields)
- Use select() to fetch only needed fields, not entire records
- Avoid N+1 queries (use eager loading, joins, or batch loading)
- Use pagination for large result sets (limit + offset or cursor-based)
- Cache query results when data doesn't change frequently
- Use database query planners to identify slow queries
- Batch API requests when possible (GraphQL batching, bulk endpoints)
`
      }
    ]
  },

  accessibility: {
    name: 'Accessibility',
    description: 'ARIA, semantic HTML, keyboard navigation, and contrast',
    rules: [
      {
        filename: 'accessibility-aria.mdc',
        description: 'ARIA attributes and roles',
        globs: ['**/*.tsx', '**/*.jsx', '**/*.html', '**/*.vue', '**/*.svelte'],
        alwaysApply: false,
        body: `---
description: ARIA attributes and roles
globs: ["**/*.tsx", "**/*.jsx", "**/*.html", "**/*.vue", "**/*.svelte"]
alwaysApply: false
---

# ARIA

- Use semantic HTML first, ARIA only when needed
- Add aria-label or aria-labelledby to interactive elements without text
- Use aria-describedby for additional context (error messages, hints)
- Set aria-live for dynamic content (alerts, status updates)
- Use role attribute only when semantic HTML is not enough
- Mark decorative images with alt="" or aria-hidden="true"
- Use aria-expanded, aria-pressed, aria-selected for state
`
      },
      {
        filename: 'accessibility-semantic-html.mdc',
        description: 'Semantic HTML structure',
        globs: ['**/*.tsx', '**/*.jsx', '**/*.html', '**/*.vue', '**/*.svelte'],
        alwaysApply: false,
        body: `---
description: Semantic HTML structure
globs: ["**/*.tsx", "**/*.jsx", "**/*.html", "**/*.vue", "**/*.svelte"]
alwaysApply: false
---

# Semantic HTML

- Use <button> for actions, <a> for navigation (not div with onClick)
- Use <nav>, <main>, <header>, <footer>, <article>, <section> for structure
- Use heading hierarchy: single <h1> per page, then h2, h3 in order
- Use <label> for form inputs (linked with htmlFor/for attribute)
- Use <ul>/<ol> for lists, not divs with bullets
- Use <table> for tabular data, not layout (with <thead>, <tbody>, <th>)
- Use <figure> and <figcaption> for images with captions
`
      },
      {
        filename: 'accessibility-keyboard.mdc',
        description: 'Keyboard navigation',
        globs: ['**/*.tsx', '**/*.jsx', '**/*.html', '**/*.vue', '**/*.svelte'],
        alwaysApply: false,
        body: `---
description: Keyboard navigation
globs: ["**/*.tsx", "**/*.jsx", "**/*.html", "**/*.vue", "**/*.svelte"]
alwaysApply: false
---

# Keyboard Navigation

- All interactive elements must be keyboard accessible (Tab, Enter, Space)
- Use tabIndex={0} to add elements to tab order, tabIndex={-1} to remove
- Avoid tabIndex > 0 (disrupts natural tab order)
- Implement focus management: trap focus in modals, restore focus after close
- Provide visible focus indicators (don't remove outline without alternative)
- Support arrow keys for navigation in menus, tabs, and lists
- Test with keyboard only (no mouse) to verify accessibility
`
      },
      {
        filename: 'accessibility-contrast.mdc',
        description: 'Color contrast and visual design',
        globs: ['**/*.css', '**/*.scss', '**/*.tsx', '**/*.jsx'],
        alwaysApply: false,
        body: `---
description: Color contrast and visual design
globs: ["**/*.css", "**/*.scss", "**/*.tsx", "**/*.jsx"]
alwaysApply: false
---

# Contrast

- Maintain 4.5:1 contrast ratio for normal text, 3:1 for large text (WCAG AA)
- Use tools to verify contrast (WebAIM Contrast Checker, browser DevTools)
- Don't rely on color alone to convey information (use icons, labels, patterns)
- Support user preferences: prefers-reduced-motion, prefers-color-scheme
- Ensure focus indicators have 3:1 contrast against background
- Use sufficient spacing and font sizes (minimum 16px for body text)
- Test in grayscale mode to verify information hierarchy
`
      }
    ]
  }
};

function getPackNames() {
  return Object.keys(REGISTRY);
}

function getPack(name) {
  return REGISTRY[name.toLowerCase()];
}

function getAllPacks() {
  return REGISTRY;
}

module.exports = { getPackNames, getPack, getAllPacks, REGISTRY };
