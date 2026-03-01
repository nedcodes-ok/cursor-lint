const fs = require('fs');
const path = require('path');

/**
 * Initialize a Cursor project with smart stack detection and rule generation
 * @param {string} projectPath - Path to project directory
 * @param {object} options - { dryRun: boolean, force: boolean }
 * @returns {object} - { created: [], skipped: [], detected: {}, summary: string }
 */
async function initProject(projectPath, options = {}) {
  const { dryRun = false, force = false } = options;
  
  const detected = detectStack(projectPath);
  const created = [];
  const skipped = [];
  const warnings = [];

  const rulesDir = path.join(projectPath, '.cursor', 'rules');
  
  // Check if rules directory exists and has files
  if (fs.existsSync(rulesDir) && !force) {
    const existingFiles = fs.readdirSync(rulesDir).filter(f => f.endsWith('.mdc'));
    if (existingFiles.length > 0) {
      return {
        error: 'Rules directory already exists with ' + existingFiles.length + ' files. Use --force to overwrite.',
        created: [],
        skipped: [],
        detected,
      };
    }
  }

  if (!dryRun && !fs.existsSync(rulesDir)) {
    fs.mkdirSync(rulesDir, { recursive: true });
  }

  // Always generate general.mdc
  const generalResult = writeRule(rulesDir, 'general.mdc', generateGeneral(), { dryRun, force });
  if (generalResult.created) created.push(generalResult.file);
  else if (generalResult.skipped) skipped.push(generalResult.file);

  // Language-specific rules
  if (detected.languages.typescript) {
    const result = writeRule(rulesDir, 'typescript.mdc', generateTypeScript(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.languages.javascript && !detected.languages.typescript) {
    const result = writeRule(rulesDir, 'javascript.mdc', generateJavaScript(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.languages.python) {
    const result = writeRule(rulesDir, 'python.mdc', generatePython(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.languages.go) {
    const result = writeRule(rulesDir, 'go.mdc', generateGo(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.languages.rust) {
    const result = writeRule(rulesDir, 'rust.mdc', generateRust(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.languages.java) {
    const result = writeRule(rulesDir, 'java.mdc', generateJava(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.languages.ruby) {
    const result = writeRule(rulesDir, 'ruby.mdc', generateRuby(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.languages.php) {
    const result = writeRule(rulesDir, 'php.mdc', generatePHP(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.languages.csharp) {
    const result = writeRule(rulesDir, 'csharp.mdc', generateCSharp(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.languages.swift) {
    const result = writeRule(rulesDir, 'swift.mdc', generateSwift(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.languages.kotlin) {
    const result = writeRule(rulesDir, 'kotlin.mdc', generateKotlin(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  // Framework-specific rules
  if (detected.frameworks.react && !detected.frameworks.nextjs) {
    const result = writeRule(rulesDir, 'react.mdc', generateReact(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.frameworks.nextjs) {
    const result = writeRule(rulesDir, 'nextjs.mdc', generateNextJs(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.frameworks.vue) {
    const result = writeRule(rulesDir, 'vue.mdc', generateVue(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.frameworks.angular) {
    const result = writeRule(rulesDir, 'angular.mdc', generateAngular(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.frameworks.svelte) {
    const result = writeRule(rulesDir, 'svelte.mdc', generateSvelte(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.frameworks.express) {
    const result = writeRule(rulesDir, 'express.mdc', generateExpress(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.frameworks.fastify) {
    const result = writeRule(rulesDir, 'fastify.mdc', generateFastify(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.frameworks.django) {
    const result = writeRule(rulesDir, 'django.mdc', generateDjango(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.frameworks.flask) {
    const result = writeRule(rulesDir, 'flask.mdc', generateFlask(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.frameworks.rails) {
    const result = writeRule(rulesDir, 'rails.mdc', generateRails(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  if (detected.frameworks.spring) {
    const result = writeRule(rulesDir, 'spring.mdc', generateSpring(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  // Testing frameworks
  if (detected.testing.hasTests) {
    const result = writeRule(rulesDir, 'testing.mdc', generateTesting(detected.testing), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  // Git workflow
  if (detected.git) {
    const result = writeRule(rulesDir, 'git.mdc', generateGitWorkflow(), { dryRun, force });
    if (result.created) created.push(result.file);
    else if (result.skipped) skipped.push(result.file);
  }

  // Documentation
  const result = writeRule(rulesDir, 'documentation.mdc', generateDocumentation(), { dryRun, force });
  if (result.created) created.push(result.file);
  else if (result.skipped) skipped.push(result.file);

  // Build summary
  const detectedTechs = [];
  Object.keys(detected.languages).forEach(lang => {
    if (detected.languages[lang]) detectedTechs.push(lang);
  });
  Object.keys(detected.frameworks).forEach(fw => {
    if (detected.frameworks[fw]) detectedTechs.push(fw);
  });
  if (detected.testing.hasTests) detectedTechs.push('testing');

  const summary = 'Generated ' + created.length + ' rules for: ' + detectedTechs.join(', ');

  return {
    created,
    skipped,
    detected,
    summary,
    warnings,
  };
}

/**
 * Detect tech stack from project files
 */
function detectStack(projectPath) {
  const detected = {
    languages: {
      typescript: false,
      javascript: false,
      python: false,
      go: false,
      rust: false,
      java: false,
      ruby: false,
      php: false,
      csharp: false,
      swift: false,
      kotlin: false,
    },
    frameworks: {
      react: false,
      nextjs: false,
      vue: false,
      angular: false,
      svelte: false,
      express: false,
      fastify: false,
      django: false,
      flask: false,
      rails: false,
      spring: false,
    },
    testing: {
      hasTests: false,
      jest: false,
      vitest: false,
      pytest: false,
      gotest: false,
      cargotest: false,
    },
    buildTools: {
      webpack: false,
      vite: false,
      turbo: false,
      nx: false,
    },
    configs: {
      eslint: false,
      prettier: false,
      tsconfig: false,
    },
    git: false,
  };

  // Check for git
  if (fs.existsSync(path.join(projectPath, '.git'))) {
    detected.git = true;
  }

  // Check config files
  if (fs.existsSync(path.join(projectPath, 'tsconfig.json'))) {
    detected.configs.tsconfig = true;
    detected.languages.typescript = true;
  }

  if (fs.existsSync(path.join(projectPath, '.eslintrc')) ||
      fs.existsSync(path.join(projectPath, '.eslintrc.js')) ||
      fs.existsSync(path.join(projectPath, '.eslintrc.json'))) {
    detected.configs.eslint = true;
  }

  if (fs.existsSync(path.join(projectPath, '.prettierrc')) ||
      fs.existsSync(path.join(projectPath, '.prettierrc.js')) ||
      fs.existsSync(path.join(projectPath, '.prettierrc.json'))) {
    detected.configs.prettier = true;
  }

  // Rust
  if (fs.existsSync(path.join(projectPath, 'Cargo.toml'))) {
    detected.languages.rust = true;
    detected.testing.cargotest = true;
    detected.testing.hasTests = true;
  }

  // Go
  if (fs.existsSync(path.join(projectPath, 'go.mod'))) {
    detected.languages.go = true;
    detected.testing.gotest = true;
    detected.testing.hasTests = true;
  }

  // Ruby/Rails
  if (fs.existsSync(path.join(projectPath, 'Gemfile'))) {
    detected.languages.ruby = true;
  }

  // Java
  if (fs.existsSync(path.join(projectPath, 'pom.xml')) ||
      fs.existsSync(path.join(projectPath, 'build.gradle'))) {
    detected.languages.java = true;
  }

  // Python
  if (fs.existsSync(path.join(projectPath, 'requirements.txt')) ||
      fs.existsSync(path.join(projectPath, 'pyproject.toml')) ||
      fs.existsSync(path.join(projectPath, 'setup.py'))) {
    detected.languages.python = true;
  }

  // Check package.json for Node/JS projects
  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    detected.languages.javascript = true;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Frameworks
      if (allDeps.react || allDeps['react-dom']) detected.frameworks.react = true;
      if (allDeps.next) {
        detected.frameworks.nextjs = true;
        detected.frameworks.react = true;
      }
      if (allDeps.vue) detected.frameworks.vue = true;
      if (allDeps['@angular/core']) detected.frameworks.angular = true;
      if (allDeps.svelte) detected.frameworks.svelte = true;
      if (allDeps.express) detected.frameworks.express = true;
      if (allDeps.fastify) detected.frameworks.fastify = true;

      // Testing
      if (allDeps.jest) {
        detected.testing.jest = true;
        detected.testing.hasTests = true;
      }
      if (allDeps.vitest) {
        detected.testing.vitest = true;
        detected.testing.hasTests = true;
      }

      // Build tools
      if (allDeps.webpack) detected.buildTools.webpack = true;
      if (allDeps.vite) detected.buildTools.vite = true;
      if (allDeps.turbo) detected.buildTools.turbo = true;
      if (allDeps.nx) detected.buildTools.nx = true;

      // TypeScript
      if (allDeps.typescript || allDeps['@types/node']) {
        detected.languages.typescript = true;
      }
    } catch (e) {
      // Invalid package.json, skip
    }
  }

  // Scan for file extensions (sample first 100 files to avoid perf issues)
  try {
    const sampleFiles = walkDir(projectPath, 100);
    
    sampleFiles.forEach(file => {
      const ext = path.extname(file);
      if (ext === '.ts' || ext === '.tsx') detected.languages.typescript = true;
      if (ext === '.js' || ext === '.jsx') detected.languages.javascript = true;
      if (ext === '.py') detected.languages.python = true;
      if (ext === '.go') detected.languages.go = true;
      if (ext === '.rs') detected.languages.rust = true;
      if (ext === '.java') detected.languages.java = true;
      if (ext === '.rb') detected.languages.ruby = true;
      if (ext === '.php') detected.languages.php = true;
      if (ext === '.cs') detected.languages.csharp = true;
      if (ext === '.swift') detected.languages.swift = true;
      if (ext === '.kt') detected.languages.kotlin = true;
    });
  } catch (e) {
    // Ignore scan errors
  }

  // Python frameworks (check imports in requirements or pyproject)
  if (detected.languages.python) {
    const reqPath = path.join(projectPath, 'requirements.txt');
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    
    let pythonDeps = '';
    if (fs.existsSync(reqPath)) {
      pythonDeps += fs.readFileSync(reqPath, 'utf-8');
    }
    if (fs.existsSync(pyprojectPath)) {
      pythonDeps += fs.readFileSync(pyprojectPath, 'utf-8');
    }

    if (pythonDeps.includes('django')) detected.frameworks.django = true;
    if (pythonDeps.includes('flask')) detected.frameworks.flask = true;
    if (pythonDeps.includes('pytest')) {
      detected.testing.pytest = true;
      detected.testing.hasTests = true;
    }
  }

  // Ruby frameworks
  if (detected.languages.ruby) {
    const gemfilePath = path.join(projectPath, 'Gemfile');
    if (fs.existsSync(gemfilePath)) {
      const gemfile = fs.readFileSync(gemfilePath, 'utf-8');
      if (gemfile.includes('rails')) detected.frameworks.rails = true;
    }
  }

  // Java frameworks
  if (detected.languages.java) {
    const pomPath = path.join(projectPath, 'pom.xml');
    if (fs.existsSync(pomPath)) {
      const pom = fs.readFileSync(pomPath, 'utf-8');
      if (pom.includes('spring')) detected.frameworks.spring = true;
    }
  }

  return detected;
}

/**
 * Walk directory and collect file paths (limited for performance)
 */
function walkDir(dir, limit = 100) {
  const files = [];
  const ignoreDirs = ['node_modules', '.git', 'dist', 'build', 'target', 'vendor', '.venv', 'venv'];
  
  function walk(currentDir) {
    if (files.length >= limit) return;
    
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (files.length >= limit) return;
        
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          if (!ignoreDirs.includes(entry.name)) {
            walk(fullPath);
          }
        } else {
          files.push(fullPath);
        }
      }
    } catch (e) {
      // Skip directories we can't read
    }
  }
  
  walk(dir);
  return files;
}

/**
 * Write a rule file
 */
function writeRule(rulesDir, filename, content, options = {}) {
  const { dryRun = false, force = false } = options;
  const filePath = path.join(rulesDir, filename);
  
  if (!force && fs.existsSync(filePath)) {
    return { file: filename, created: false, skipped: true };
  }
  
  if (!dryRun) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }
  
  return { file: filename, created: true, skipped: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Template Generators
// ─────────────────────────────────────────────────────────────────────────────

function generateGeneral() {
  return `---
description: General coding conventions
alwaysApply: true
---
- Write clear, self-documenting code
- Keep functions focused. One responsibility per function
- Add comments only for "why", not "what"
- Handle errors explicitly. No silent catches
- Write tests for new features and bug fixes
`;
}

function generateTypeScript() {
  return `---
description: TypeScript conventions for this project
globs: ["**/*.ts", "**/*.tsx"]
---
- Use TypeScript strict mode patterns
- Prefer \`interface\` over \`type\` for object shapes
- Use explicit return types on exported functions
- Avoid \`any\`. Use \`unknown\` if type is truly unknown
- Leverage type inference where appropriate
- Use discriminated unions for complex state
`;
}

function generateJavaScript() {
  return `---
description: JavaScript conventions
globs: ["**/*.js", "**/*.jsx"]
---
- Use modern ES6+ syntax (arrow functions, destructuring, async/await)
- Prefer \`const\` over \`let\`, never use \`var\`
- Use named exports over default exports
- Avoid mutating objects — prefer immutable patterns
- Use optional chaining (?.) and nullish coalescing (??)
`;
}

function generateReact() {
  return `---
description: React component patterns
globs: ["**/*.tsx", "**/*.jsx"]
---
- Use functional components with hooks
- Keep components under 200 lines. Extract sub-components
- Use named exports for components
- Colocate styles, tests, and types with components
- Before writing a useEffect, ask: can this be computed during render?
- Use proper key props in lists (never use array index for dynamic data)
- Avoid prop drilling. Use context or state management for deep trees
`;
}

function generateNextJs() {
  return `---
description: Next.js App Router patterns
alwaysApply: true
---
- Use App Router (app directory) over Pages Router
- Default to Server Components. Mark 'use client' only when needed
- Use Server Actions for mutations instead of API routes
- Leverage Next.js caching strategies (revalidate, cache)
- Use the @/ path alias for imports
- Keep client components minimal. Extract interactive pieces only
`;
}

function generateVue() {
  return `---
description: Vue 3 Composition API patterns
globs: ["**/*.vue"]
---
- Use Composition API (setup script) over Options API
- Keep components focused — extract composables for reusable logic
- Use ref() for primitives, reactive() for objects
- Prefer computed() over methods for derived state
- Use TypeScript with defineProps and defineEmits
`;
}

function generateAngular() {
  return `---
description: Angular best practices
globs: ["**/*.ts", "**/*.html"]
---
- Use standalone components (Angular 14+)
- Leverage signals for reactive state (Angular 16+)
- Keep components under 200 lines
- Use OnPush change detection strategy
- Avoid complex logic in templates — move to component
- Use services for shared logic and state
`;
}

function generateSvelte() {
  return `---
description: Svelte component conventions
globs: ["**/*.svelte"]
---
- Keep components simple and reactive
- Use $: for reactive statements
- Leverage stores for shared state
- Avoid manual DOM manipulation — let Svelte handle it
- Use context API for deeply nested props
- Prefer single-file components with scoped styles
`;
}

function generatePython() {
  return `---
description: Python code conventions
globs: ["**/*.py"]
---
- Follow PEP 8 style guide
- Use type hints on all function signatures
- Use pathlib over os.path for file operations
- Prefer f-strings over .format() or % formatting
- Avoid bare except. Catch specific exceptions
- Use dataclasses or Pydantic models for structured data
- Use logging module, not print statements
`;
}

function generateGo() {
  return `---
description: Go conventions
globs: ["**/*.go"]
---
- Follow Go conventions: gofmt, golint
- Handle errors explicitly. Never ignore error returns
- Use defer for cleanup operations
- Keep functions small and focused
- Use interfaces for abstraction
- Prefer table-driven tests
- Use context for cancellation and timeouts
`;
}

function generateRust() {
  return `---
description: Rust best practices
globs: ["**/*.rs"]
---
- Run cargo clippy before committing
- Use Result and Option explicitly. Avoid unwrap() in production
- Leverage the type system. Make invalid states unrepresentable
- Use #[derive] for common traits
- Prefer iterators over manual loops
- Use cargo fmt for consistent formatting
- Write tests in the same file with #[cfg(test)]
`;
}

function generateJava() {
  return `---
description: Java conventions
globs: ["**/*.java"]
---
- Follow Java naming conventions (PascalCase for classes, camelCase for methods)
- Use Optional<T> to represent nullable values
- Prefer composition over inheritance
- Use try-with-resources for auto-closeable objects
- Avoid raw types — use generics properly
- Use Stream API for collections processing
- Write unit tests with JUnit 5
`;
}

function generateRuby() {
  return `---
description: Ruby conventions
globs: ["**/*.rb"]
---
- Follow Ruby Style Guide (RuboCop)
- Use snake_case for methods and variables
- Prefer symbols over strings for hash keys
- Use blocks and yield for iteration patterns
- Avoid monkey-patching core classes
- Use RSpec or Minitest for testing
- Leverage Ruby's expressive syntax — keep code readable
`;
}

function generatePHP() {
  return `---
description: PHP best practices
globs: ["**/*.php"]
---
- Follow PSR-12 coding standard
- Use type declarations for function parameters and returns
- Use null coalescing operator (??) for defaults
- Avoid extract() and eval()
- Use prepared statements for database queries
- Use Composer autoloading
- Write tests with PHPUnit
`;
}

function generateCSharp() {
  return `---
description: C# conventions
globs: ["**/*.cs"]
---
- Follow C# naming conventions (PascalCase for public members)
- Use nullable reference types (enabled by default in modern C#)
- Prefer async/await over Task.Result or Task.Wait
- Use LINQ for collection operations
- Use expression-bodied members for simple methods
- Use pattern matching where appropriate
- Write tests with xUnit or NUnit
`;
}

function generateSwift() {
  return `---
description: Swift best practices
globs: ["**/*.swift"]
---
- Follow Swift API Design Guidelines
- Use optionals safely — prefer if let or guard let over force unwrapping
- Use value types (struct, enum) over reference types (class) when appropriate
- Leverage protocol-oriented programming
- Use SwiftUI for modern UI development
- Write tests with XCTest
- Use Codable for JSON serialization
`;
}

function generateKotlin() {
  return `---
description: Kotlin conventions
globs: ["**/*.kt"]
---
- Follow Kotlin coding conventions
- Use data classes for models
- Prefer val over var — immutability by default
- Use null-safety features (?., !!, let, etc.)
- Leverage extension functions for utility methods
- Use coroutines for async operations
- Write tests with JUnit and Mockk
`;
}

function generateExpress() {
  return `---
description: Express.js patterns
globs: ["**/*.js", "**/*.ts"]
---
- Use async/await with proper error handling
- Always validate and sanitize user input
- Use middleware for cross-cutting concerns (auth, logging, etc.)
- Add rate limiting for public endpoints
- Use environment variables for config (dotenv)
- Return consistent JSON error responses
`;
}

function generateFastify() {
  return `---
description: Fastify patterns
globs: ["**/*.js", "**/*.ts"]
---
- Use JSON schema validation for routes
- Leverage Fastify's plugin architecture
- Use async/await for route handlers
- Take advantage of Fastify's performance features (serialization)
- Use decorators for shared utilities
- Validate input with fastify-type-provider-typebox or zod
`;
}

function generateDjango() {
  return `---
description: Django conventions
globs: ["**/*.py"]
---
- Follow Django's "fat models, thin views" principle
- Use Django ORM efficiently. Avoid N+1 queries
- Use class-based views for complex logic
- Validate input with Django forms or serializers
- Use migrations for all database changes
- Keep settings in environment variables (django-environ)
- Write tests with Django's TestCase
`;
}

function generateFlask() {
  return `---
description: Flask best practices
alwaysApply: true
---
- Use application factory pattern for app creation
- Organize code with blueprints for modularity
- Use SQLAlchemy for database operations
- Validate input with marshmallow or pydantic
- Use environment variables for config
- Add error handlers for common HTTP errors
- Write tests with pytest and Flask's test client
`;
}

function generateRails() {
  return `---
description: Ruby on Rails conventions
globs: ["**/*.rb"]
---
- Follow Rails conventions: "convention over configuration"
- Use Rails migrations for database changes
- Keep controllers thin. Move logic to models or services
- Use strong parameters for mass assignment protection
- Leverage ActiveRecord efficiently. Avoid N+1 queries
- Use concerns for shared model/controller behavior
- Write tests with RSpec or Minitest
`;
}

function generateSpring() {
  return `---
description: Spring Boot conventions
globs: ["**/*.java"]
---
- Use Spring Boot auto-configuration
- Use constructor injection over field injection
- Use @RestController for REST APIs
- Leverage Spring Data JPA for database operations
- Use validation annotations (@Valid, @NotNull, etc.)
- Externalize configuration with application.properties or YAML
- Write tests with Spring Boot Test and MockMvc
`;
}

function generateTesting(testingConfig) {
  let testingTools = [];
  let globs = [];
  let languageSpecific = [];
  
  if (testingConfig.jest) testingTools.push('Jest');
  if (testingConfig.vitest) testingTools.push('Vitest');
  if (testingConfig.pytest) testingTools.push('Pytest');
  if (testingConfig.gotest) testingTools.push('Go test');
  if (testingConfig.cargotest) testingTools.push('Cargo test');
  
  // BUG 5: Go should use **/*_test.go
  if (testingConfig.gotest) {
    globs.push('"**/*_test.go"');
    languageSpecific.push('- Use table-driven tests with subtests via t.Run()');
    languageSpecific.push('- Leverage testify/assert for readable assertions');
    languageSpecific.push('- Keep test functions focused with clear names (TestFunctionName_Scenario)');
  }
  
  // BUG 6: Rust should use tests/**/*.rs and **/*.rs (or alwaysApply)
  if (testingConfig.cargotest) {
    globs.push('"tests/**/*.rs"', '"**/*.rs"');
    languageSpecific.push('- Use #[cfg(test)] modules for inline tests');
    languageSpecific.push('- Use #[test] attribute and assert_eq!, assert! macros');
    languageSpecific.push('- Organize integration tests in tests/ directory');
  }
  
  // Python pytest
  if (testingConfig.pytest) {
    globs.push('"**/test_*.py"', '"**/*_test.py"', '"**/conftest.py"');
    languageSpecific.push('- Use pytest fixtures for shared setup and teardown');
    languageSpecific.push('- Leverage parametrize for data-driven tests');
    languageSpecific.push('- Use conftest.py for shared fixtures and configuration');
  }
  
  // JS/TS Jest/Vitest
  if (testingConfig.jest || testingConfig.vitest) {
    globs.push('"**/*.test.*"', '"**/*.spec.*"');
    languageSpecific.push('- Use describe/it blocks for clear test organization');
    languageSpecific.push('- Mock external dependencies with jest.mock() or vi.mock()');
    languageSpecific.push('- Use beforeEach/afterEach for test isolation');
  }
  
  // Default globs if none specified
  if (globs.length === 0) {
    globs.push('"**/*.test.*"', '"**/*.spec.*"', '"**/*_test.*"');
  }
  
  const toolsText = testingTools.length > 0 ? ' (using ' + testingTools.join(', ') + ')' : '';
  const globsText = 'globs: [' + globs.join(', ') + ']';
  const languageSpecificText = languageSpecific.length > 0 ? '\n' + languageSpecific.join('\n') : '';

  return `---
description: Testing conventions${toolsText}
${globsText}
---
- Write tests for all new features and bug fixes
- Follow AAA pattern: Arrange, Act, Assert
- Keep tests isolated. No shared state between tests
- Use descriptive test names that explain the scenario
- Test edge cases and error conditions
- Aim for high coverage on critical paths, not 100% everywhere
- Mock external dependencies (APIs, databases)
- Keep tests fast. Unit tests should run in milliseconds${languageSpecificText}
`;
}

function generateGitWorkflow() {
  return `---
description: Git workflow conventions
alwaysApply: true
---
- Write clear, descriptive commit messages
- Use conventional commits format: type(scope): description
- Common types: feat, fix, docs, style, refactor, test, chore
- Keep commits focused. One logical change per commit
- Don't commit sensitive data (API keys, passwords, etc.)
- Use .gitignore for generated files and dependencies
- Review your diff before committing
`;
}

function generateDocumentation() {
  return `---
description: Documentation standards
globs: ["**/*.md", "**/*.mdx"]
---
- Keep README.md up to date with setup instructions
- Document non-obvious decisions and tradeoffs
- Use inline comments for "why", not "what"
- Document public APIs and interfaces
- Include examples in documentation
- Keep docs close to code (colocate when possible)
- Use diagrams for complex architectures
`;
}

module.exports = { initProject, detectStack };
