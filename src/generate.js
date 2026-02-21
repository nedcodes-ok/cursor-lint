const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://raw.githubusercontent.com/cursorrulespacks/cursorrules-collection/main/rules-mdc/';

// package.json dependencies → rule files
const PKG_DEP_MAP = {
  // Frameworks
  'react': 'frameworks/react.mdc',
  'next': 'frameworks/nextjs.mdc',
  'vue': 'frameworks/vue.mdc',
  'nuxt': 'frameworks/nuxt.mdc',
  'svelte': 'frameworks/svelte.mdc',
  '@sveltejs/kit': 'frameworks/sveltekit.mdc',
  'express': 'frameworks/express.mdc',
  '@nestjs/core': 'frameworks/nestjs.mdc',
  '@angular/core': 'frameworks/angular.mdc',
  'astro': 'frameworks/astro.mdc',
  'gatsby': 'frameworks/gatsby.mdc',
  'remix': 'frameworks/remix.mdc',
  'solid-js': 'frameworks/solid-js.mdc',
  'hono': 'frameworks/hono.mdc',
  'htmx.org': 'frameworks/htmx.mdc',
  'electron': 'frameworks/electron.mdc',
  '@tauri-apps/api': 'frameworks/tauri.mdc',
  'expo': 'frameworks/expo.mdc',
  'swr': 'frameworks/swr.mdc',
  '@tanstack/react-query': 'frameworks/tanstack-query.mdc',
  'zod': 'frameworks/zod.mdc',
  'zustand': 'frameworks/zustand.mdc',
  '@t3-oss/env-nextjs': 'frameworks/t3-stack.mdc',
  'tailwindcss': 'frameworks/tailwind-css.mdc',

  // Tools
  'prisma': 'tools/prisma.mdc',
  'drizzle-orm': 'tools/drizzle.mdc',
  '@trpc/server': 'tools/trpc.mdc',
  'graphql': 'tools/graphql.mdc',
  '@supabase/supabase-js': 'tools/supabase.mdc',
  'firebase': 'tools/firebase.mdc',
  'convex': 'tools/convex.mdc',
  '@clerk/nextjs': 'tools/clerk.mdc',
  'next-auth': 'tools/nextauth.mdc',
  'stripe': 'tools/stripe.mdc',
  '@langchain/core': 'tools/langchain.mdc',
  'mongodb': 'tools/mongodb.mdc',
  'redis': 'tools/redis.mdc',
  'jest': 'tools/jest.mdc',
  'vitest': 'tools/vitest.mdc',
  'cypress': 'tools/cypress.mdc',
  '@playwright/test': 'tools/playwright.mdc',
  '@storybook/react': 'tools/storybook.mdc',
  'turborepo': 'tools/turborepo.mdc',
  'bun': 'tools/bun.mdc',
};

// Python requirements.txt / pyproject.toml → rule files
const PY_DEP_MAP = {
  'django': 'frameworks/django.mdc',
  'fastapi': 'frameworks/fastapi.mdc',
  'flask': 'frameworks/flask.mdc',
  'pydantic': 'tools/pydantic.mdc',
  'sqlalchemy': 'tools/sqlalchemy.mdc',
  'pytest': 'tools/pytest.mdc',
  'langchain': 'tools/langchain.mdc',
  'ruff': 'tools/ruff.mdc',
};

// Gemfile → rule files
const RUBY_DEP_MAP = {
  'rails': 'frameworks/rails.mdc',
};

// composer.json → rule files
const PHP_DEP_MAP = {
  'laravel/framework': 'frameworks/laravel.mdc',
};

// build.gradle / pom.xml → rule files
const JVM_DEP_MAP = {
  'spring-boot': 'frameworks/spring-boot.mdc',
};

// Best practices auto-included when certain conditions are met
const PRACTICE_TRIGGERS = {
  // Always suggest these for any project with >3 detected deps
  'practices/clean-code.mdc': { minDeps: 3, label: 'clean-code' },
  'practices/error-handling.mdc': { minDeps: 3, label: 'error-handling' },
  'practices/git-workflow.mdc': { files: ['.git'], label: 'git-workflow' },
  'practices/testing.mdc': { deps: ['jest', 'vitest', 'cypress', '@playwright/test', 'pytest', 'mocha', 'ava'], label: 'testing' },
  'practices/security.mdc': { minDeps: 5, label: 'security' },
  'practices/documentation.mdc': { files: ['README.md'], label: 'documentation' },
  'practices/api-design.mdc': { deps: ['express', '@nestjs/core', 'fastapi', 'flask', 'django', 'hono', '@trpc/server', 'graphql'], label: 'api-design' },
  'practices/performance.mdc': { deps: ['react', 'next', 'vue', 'nuxt', '@angular/core', 'svelte'], label: 'performance' },
  'practices/database-migrations.mdc': { deps: ['prisma', 'drizzle-orm', 'sqlalchemy', 'django'], label: 'database-migrations' },
  'practices/monorepo.mdc': { files: ['pnpm-workspace.yaml', 'lerna.json'], deps: ['turborepo'], label: 'monorepo' },
  'practices/accessibility.mdc': { deps: ['react', 'next', 'vue', '@angular/core', 'svelte'], label: 'accessibility' },
  'practices/logging.mdc': { deps: ['express', '@nestjs/core', 'fastapi', 'flask', 'django', 'hono'], label: 'logging' },
};

function fetchFile(url) {
  return new Promise((resolve, reject) => {
    const get = (u) => {
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          get(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          res.resume();
          return;
        }
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }).on('error', reject);
    };
    get(url);
  });
}

function readPyDeps(cwd) {
  const deps = [];

  // requirements.txt
  const reqPath = path.join(cwd, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    try {
      const content = fs.readFileSync(reqPath, 'utf8').toLowerCase();
      for (const dep of Object.keys(PY_DEP_MAP)) {
        if (content.includes(dep)) deps.push(dep);
      }
    } catch {}
  }

  // pyproject.toml (rough match)
  const pyprojectPath = path.join(cwd, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = fs.readFileSync(pyprojectPath, 'utf8').toLowerCase();
      for (const dep of Object.keys(PY_DEP_MAP)) {
        if (content.includes(dep)) deps.push(dep);
      }
    } catch {}
  }

  return [...new Set(deps)];
}

function readRubyDeps(cwd) {
  const gemfilePath = path.join(cwd, 'Gemfile');
  if (!fs.existsSync(gemfilePath)) return [];
  try {
    const content = fs.readFileSync(gemfilePath, 'utf8').toLowerCase();
    return Object.keys(RUBY_DEP_MAP).filter(dep => content.includes(dep));
  } catch { return []; }
}

function readPhpDeps(cwd) {
  const composerPath = path.join(cwd, 'composer.json');
  if (!fs.existsSync(composerPath)) return [];
  try {
    const pkg = JSON.parse(fs.readFileSync(composerPath, 'utf8'));
    const allDeps = { ...pkg.require, ...pkg['require-dev'] };
    return Object.keys(PHP_DEP_MAP).filter(dep => allDeps[dep]);
  } catch { return []; }
}

function readJvmDeps(cwd) {
  const deps = [];
  for (const file of ['build.gradle', 'build.gradle.kts', 'pom.xml']) {
    const p = path.join(cwd, file);
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8').toLowerCase();
        for (const dep of Object.keys(JVM_DEP_MAP)) {
          if (content.includes(dep)) deps.push(dep);
        }
      } catch {}
    }
  }
  return [...new Set(deps)];
}

function detectStack(cwd) {
  const detected = [];
  const rules = new Map(); // rulePath -> stackName
  const allDetectedDeps = [];

  // package.json
  const pkgPath = path.join(cwd, 'package.json');
  let pkgDeps = {};
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      pkgDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const [dep, rule] of Object.entries(PKG_DEP_MAP)) {
        if (pkgDeps[dep]) {
          detected.push(dep);
          allDetectedDeps.push(dep);
          rules.set(rule, dep);
        }
      }
    } catch {}
  }

  // tsconfig.json → TypeScript
  if (fs.existsSync(path.join(cwd, 'tsconfig.json'))) {
    detected.push('TypeScript');
    rules.set('languages/typescript.mdc', 'TypeScript');
  }

  // JavaScript (package.json exists but no TS)
  if (fs.existsSync(pkgPath) && !fs.existsSync(path.join(cwd, 'tsconfig.json'))) {
    detected.push('JavaScript');
    rules.set('languages/javascript.mdc', 'JavaScript');
  }

  // Python
  const hasPyFile = (() => { try { return fs.readdirSync(cwd).some(f => f.endsWith('.py')); } catch { return false; } })();
  const hasPyProject = fs.existsSync(path.join(cwd, 'requirements.txt')) ||
                       fs.existsSync(path.join(cwd, 'pyproject.toml')) ||
                       fs.existsSync(path.join(cwd, 'setup.py')) ||
                       hasPyFile;
  if (hasPyProject) {
    detected.push('Python');
    rules.set('languages/python.mdc', 'Python');
    const pyDeps = readPyDeps(cwd);
    for (const dep of pyDeps) {
      detected.push(dep);
      allDetectedDeps.push(dep);
      rules.set(PY_DEP_MAP[dep], dep);
    }
  }

  // Ruby
  if (fs.existsSync(path.join(cwd, 'Gemfile'))) {
    detected.push('Ruby');
    rules.set('languages/ruby.mdc', 'Ruby');
    for (const dep of readRubyDeps(cwd)) {
      detected.push(dep);
      allDetectedDeps.push(dep);
      rules.set(RUBY_DEP_MAP[dep], dep);
    }
  }

  // PHP
  if (fs.existsSync(path.join(cwd, 'composer.json'))) {
    detected.push('PHP');
    rules.set('languages/php.mdc', 'PHP');
    for (const dep of readPhpDeps(cwd)) {
      detected.push(dep);
      allDetectedDeps.push(dep);
      rules.set(PHP_DEP_MAP[dep], dep);
    }
  }

  // Rust
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    detected.push('Rust');
    rules.set('languages/rust.mdc', 'Rust');
  }

  // Go
  if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    detected.push('Go');
    rules.set('languages/go.mdc', 'Go');
  }

  // Java
  if (fs.existsSync(path.join(cwd, 'pom.xml')) || fs.existsSync(path.join(cwd, 'build.gradle')) || fs.existsSync(path.join(cwd, 'build.gradle.kts'))) {
    detected.push('Java');
    rules.set('languages/java.mdc', 'Java');
    for (const dep of readJvmDeps(cwd)) {
      detected.push(dep);
      allDetectedDeps.push(dep);
      rules.set(JVM_DEP_MAP[dep], dep);
    }
  }

  // Kotlin
  if (fs.existsSync(path.join(cwd, 'build.gradle.kts'))) {
    detected.push('Kotlin');
    rules.set('languages/kotlin.mdc', 'Kotlin');
  }

  // Swift
  if (fs.existsSync(path.join(cwd, 'Package.swift'))) {
    detected.push('Swift');
    rules.set('languages/swift.mdc', 'Swift');
  }

  // Elixir
  if (fs.existsSync(path.join(cwd, 'mix.exs'))) {
    detected.push('Elixir');
    rules.set('languages/elixir.mdc', 'Elixir');
  }

  // Scala
  if (fs.existsSync(path.join(cwd, 'build.sbt'))) {
    detected.push('Scala');
    rules.set('languages/scala.mdc', 'Scala');
  }

  // C#
  const hasCsproj = (() => { try { return fs.readdirSync(cwd).some(f => f.endsWith('.csproj') || f.endsWith('.sln')); } catch { return false; } })();
  if (hasCsproj) {
    detected.push('C#');
    rules.set('languages/csharp.mdc', 'C#');
  }

  // C++
  if (fs.existsSync(path.join(cwd, 'CMakeLists.txt')) || fs.existsSync(path.join(cwd, 'Makefile'))) {
    const hasCpp = (() => { try { return fs.readdirSync(cwd).some(f => /\.(cpp|cc|cxx|hpp|h)$/.test(f)); } catch { return false; } })();
    if (hasCpp) {
      detected.push('C++');
      rules.set('languages/cpp.mdc', 'C++');
    }
  }

  // Flutter (pubspec.yaml)
  if (fs.existsSync(path.join(cwd, 'pubspec.yaml'))) {
    detected.push('Flutter');
    rules.set('frameworks/flutter.mdc', 'Flutter');
  }

  // Docker
  if (fs.existsSync(path.join(cwd, 'Dockerfile')) || fs.existsSync(path.join(cwd, 'docker-compose.yml')) || fs.existsSync(path.join(cwd, 'docker-compose.yaml'))) {
    detected.push('Docker');
    rules.set('tools/docker.mdc', 'Docker');
  }

  // Kubernetes
  const k8sDir = path.join(cwd, 'k8s');
  if (fs.existsSync(k8sDir) || fs.existsSync(path.join(cwd, 'kubernetes'))) {
    detected.push('Kubernetes');
    rules.set('tools/kubernetes.mdc', 'Kubernetes');
  }

  // Terraform
  const hasTf = (() => { try { return fs.readdirSync(cwd).some(f => f.endsWith('.tf')); } catch { return false; } })();
  if (hasTf) {
    detected.push('Terraform');
    rules.set('tools/terraform.mdc', 'Terraform');
  }

  // Deno
  if (fs.existsSync(path.join(cwd, 'deno.json')) || fs.existsSync(path.join(cwd, 'deno.jsonc'))) {
    detected.push('Deno');
    rules.set('tools/deno.mdc', 'Deno');
  }

  // CI/CD
  if (fs.existsSync(path.join(cwd, '.github', 'workflows')) || fs.existsSync(path.join(cwd, '.gitlab-ci.yml'))) {
    detected.push('CI/CD');
    rules.set('tools/ci-cd.mdc', 'CI/CD');
  }

  // Nginx
  const hasNginx = (() => { try { return fs.readdirSync(cwd).some(f => f.includes('nginx')); } catch { return false; } })();
  if (hasNginx) {
    detected.push('Nginx');
    rules.set('tools/nginx.mdc', 'Nginx');
  }

  // SQLite
  if (pkgDeps['better-sqlite3'] || pkgDeps['sqlite3']) {
    detected.push('SQLite');
    allDetectedDeps.push('sqlite3');
    rules.set('tools/sqlite.mdc', 'SQLite');
  }

  // PostgreSQL
  if (pkgDeps['pg'] || pkgDeps['postgres']) {
    detected.push('PostgreSQL');
    allDetectedDeps.push('pg');
    rules.set('tools/postgresql.mdc', 'PostgreSQL');
  }

  // AWS
  if (pkgDeps['@aws-sdk/client-s3'] || pkgDeps['aws-sdk'] || fs.existsSync(path.join(cwd, 'serverless.yml')) || fs.existsSync(path.join(cwd, 'template.yaml'))) {
    detected.push('AWS');
    allDetectedDeps.push('aws-sdk');
    rules.set('tools/aws.mdc', 'AWS');
  }

  // Best practices — auto-suggest based on project signals
  for (const [rulePath, trigger] of Object.entries(PRACTICE_TRIGGERS)) {
    let shouldInclude = false;

    if (trigger.minDeps && allDetectedDeps.length >= trigger.minDeps) {
      shouldInclude = true;
    }
    if (trigger.deps && trigger.deps.some(d => allDetectedDeps.includes(d) || pkgDeps[d])) {
      shouldInclude = true;
    }
    if (trigger.files && trigger.files.some(f => fs.existsSync(path.join(cwd, f)))) {
      shouldInclude = true;
    }

    if (shouldInclude) {
      rules.set(rulePath, `best-practice: ${trigger.label}`);
    }
  }

  return { detected, rules };
}

async function generateRules(cwd) {
  const { detected, rules } = detectStack(cwd);
  const rulesDir = path.join(cwd, '.cursor', 'rules');
  const created = [];
  const skipped = [];
  const failed = [];

  if (rules.size === 0) {
    return { detected, created, skipped, failed };
  }

  fs.mkdirSync(rulesDir, { recursive: true });

  for (const [rulePath, stackName] of rules) {
    const filename = path.basename(rulePath);
    const destPath = path.join(rulesDir, filename);

    if (fs.existsSync(destPath)) {
      skipped.push({ file: filename, stack: stackName });
      continue;
    }

    try {
      const url = BASE_URL + rulePath;
      const content = await fetchFile(url);
      fs.writeFileSync(destPath, content, 'utf8');
      created.push({ file: filename, stack: stackName });
    } catch (err) {
      failed.push({ file: filename, stack: stackName, error: err.message });
    }
  }

  return { detected, created, skipped, failed };
}

const SKILLS_API = 'https://skills.sh/api/search';

function searchSkillsAPI(query, limit) {
  return new Promise((resolve) => {
    const url = `${SKILLS_API}?q=${encodeURIComponent(query)}&limit=${limit || 5}`;
    https.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve([]); return; }
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.skills || []);
        } catch { resolve([]); }
      });
      res.on('error', () => resolve([]));
    }).on('error', () => resolve([]));
  });
}

async function suggestSkills(detected) {
  // Map detected stack items to search queries
  const queries = new Set();
  for (const item of detected) {
    const lower = item.toLowerCase();
    // Skip generic terms that return noisy results
    if (['CI/CD', 'Docker', 'Kubernetes', 'Terraform'].includes(item)) {
      queries.add(lower);
    } else {
      queries.add(lower);
    }
  }

  // Search for top 3 unique queries to avoid API spam
  const searchTerms = [...queries].slice(0, 5);
  const allResults = [];
  const seen = new Set();

  for (const term of searchTerms) {
    const results = await searchSkillsAPI(term, 3);
    for (const skill of results) {
      if (!seen.has(skill.id)) {
        seen.add(skill.id);
        allResults.push(skill);
      }
    }
  }

  // Sort by installs descending, take top 10
  allResults.sort((a, b) => (b.installs || 0) - (a.installs || 0));
  return allResults.slice(0, 10);
}

module.exports = { generateRules, suggestSkills };
