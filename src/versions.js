const fs = require('fs');
const path = require('path');

// Map of package names to their version-specific rule notes
// Each entry: { package, minVersion, note }
const VERSION_NOTES = [
  // React
  { package: 'react', minVersion: '19.0.0', note: 'React 19+: use useActionState (replaces useFormState), use() hook for promises/context' },
  { package: 'react', minVersion: '18.0.0', note: 'React 18+: useId, useSyncExternalStore, automatic batching, Suspense for data fetching' },

  // Next.js
  { package: 'next', minVersion: '15.0.0', note: 'Next.js 15+: async request APIs (cookies/headers/params are now async), Turbopack stable' },
  { package: 'next', minVersion: '14.0.0', note: 'Next.js 14+: Server Actions stable, partial prerendering (preview), Metadata API improvements' },
  { package: 'next', minVersion: '13.4.0', note: 'Next.js 13.4+: App Router stable, Server Components default. Pages Router is legacy' },

  // Vue
  { package: 'vue', minVersion: '3.4.0', note: 'Vue 3.4+: defineModel(), improved reactivity, v-bind shorthand' },
  { package: 'vue', minVersion: '3.3.0', note: 'Vue 3.3+: generic components, defineSlots, defineOptions' },

  // Angular
  { package: '@angular/core', minVersion: '18.0.0', note: 'Angular 18+: stable signals, zoneless change detection (experimental), @let template syntax' },
  { package: '@angular/core', minVersion: '17.0.0', note: 'Angular 17+: new control flow (@if/@for/@switch), deferrable views (@defer), signal inputs/outputs' },

  // Prisma
  { package: 'prisma', minVersion: '5.0.0', note: 'Prisma 5+: JSON protocol default, improved query engine, Prisma Client extensions stable' },
  { package: '@prisma/client', minVersion: '5.0.0', note: 'Prisma 5+: $extends replaces middleware (deprecated), improved type safety' },

  // Tailwind
  { package: 'tailwindcss', minVersion: '4.0.0', note: 'Tailwind v4+: CSS-first config, no tailwind.config.js needed, @theme directive, automatic content detection' },
  { package: 'tailwindcss', minVersion: '3.4.0', note: 'Tailwind 3.4+: size-* utility (replaces w-* h-* pairs), has-* and group-has-* variants' },
  { package: 'tailwindcss', minVersion: '3.3.0', note: 'Tailwind 3.3+: ESM config support, logical properties, overflow-clip utility' },

  // TypeScript
  { package: 'typescript', minVersion: '5.5.0', note: 'TypeScript 5.5+: inferred type predicates, config extends from multiple files' },
  { package: 'typescript', minVersion: '5.0.0', note: 'TypeScript 5+: decorators (TC39 standard), const type parameters, --moduleResolution bundler' },

  // Express
  { package: 'express', minVersion: '5.0.0', note: 'Express 5+: async error handling built-in (no more express-async-errors), path route matching changes' },

  // Pydantic (Python)
  { package: 'pydantic', minVersion: '2.0.0', note: 'Pydantic v2+: model_validator/field_validator replace validator/root_validator, ConfigDict replaces Config class, 5-50x faster' },

  // FastAPI (Python)
  { package: 'fastapi', minVersion: '0.100.0', note: 'FastAPI 0.100+: Annotated dependencies preferred, Pydantic v2 support, lifespan replaces on_event' },

  // Django (Python)
  { package: 'django', minVersion: '5.0', note: 'Django 5+: GeneratedField, Field.db_default, facet filters in admin, simplified templates' },
  { package: 'django', minVersion: '4.2', note: 'Django 4.2+: psycopg 3 support, comments on columns/tables, custom file storage' },
];

/**
 * Parse a semver-ish string into comparable parts.
 * Handles: "5.0.0", "^5.0.0", "~5.0.0", ">=5.0.0", "5.0", "5"
 */
function parseVersion(v) {
  if (!v) return null;
  const cleaned = v.replace(/^[\^~>=<]+/, '').replace(/-.*$/, '').trim();
  const parts = cleaned.split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

function versionGte(installed, required) {
  const a = parseVersion(installed);
  const b = parseVersion(required);
  if (!a || !b) return false;
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch >= b.patch;
}

/**
 * Detect installed versions from package.json and Python config files.
 * Returns Map<packageName, versionString>
 */
function detectVersions(cwd) {
  const versions = new Map();

  // package.json
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const [name, version] of Object.entries(allDeps)) {
        versions.set(name, version);
      }
    } catch {}
  }

  // pyproject.toml (basic parsing)
  const pyprojectPath = path.join(cwd, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = fs.readFileSync(pyprojectPath, 'utf8');
      // Match lines like: django = ">=4.2" or django = {version = ">=4.2"}
      const depRegex = /^(\w[\w-]*)\s*=\s*"([^"]+)"/gm;
      let match;
      while ((match = depRegex.exec(content)) !== null) {
        versions.set(match[1].toLowerCase(), match[2]);
      }
    } catch {}
  }

  // requirements.txt
  const reqPath = path.join(cwd, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    try {
      const lines = fs.readFileSync(reqPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        // Match: django>=4.2, django==4.2.0, django~=4.2
        const match = trimmed.match(/^([\w-]+)\s*([><=~!]+)\s*([\d.]+)/);
        if (match) {
          versions.set(match[1].toLowerCase(), match[3]);
        }
      }
    } catch {}
  }

  return versions;
}

/**
 * Check installed versions against version notes.
 * Returns array of { package, installedVersion, notes[] }
 */
function checkVersions(cwd) {
  const versions = detectVersions(cwd);
  const results = [];

  // Group notes by package
  const notesByPkg = new Map();
  for (const note of VERSION_NOTES) {
    if (!notesByPkg.has(note.package)) notesByPkg.set(note.package, []);
    notesByPkg.get(note.package).push(note);
  }

  for (const [pkg, notes] of notesByPkg) {
    const installed = versions.get(pkg);
    if (!installed) continue;

    const applicable = [];
    for (const note of notes) {
      if (versionGte(installed, note.minVersion)) {
        applicable.push(note.note);
      }
    }

    if (applicable.length > 0) {
      results.push({
        package: pkg,
        installedVersion: installed,
        notes: applicable,
      });
    }
  }

  return results;
}

/**
 * Scan .mdc rules for version references that don't match installed versions.
 * Returns array of { file, line, message }
 */
function checkRuleVersionMismatches(cwd) {
  const versions = detectVersions(cwd);
  const warnings = [];
  const rulesDir = path.join(cwd, '.cursor', 'rules');

  if (!fs.existsSync(rulesDir)) return warnings;

  const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.mdc'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(rulesDir, file), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for version references like "v14+", "v3.4+", "(v5+)", "17+"
      const versionRefs = line.matchAll(/\b(?:v|version\s*)?([\d]+(?:\.[\d]+)*)\+/gi);
      for (const match of versionRefs) {
        const refVersion = match[1];
        // Try to find which package this might relate to based on the file name
        const fileBase = file.replace('.mdc', '').toLowerCase();

        // Map filenames to package names
        const fileToPackage = {
          'nextjs': 'next',
          'react': 'react',
          'vue': 'vue',
          'angular': '@angular/core',
          'tailwind-css': 'tailwindcss',
          'typescript': 'typescript',
          'prisma': 'prisma',
          'express': 'express',
          'django': 'django',
          'fastapi': 'fastapi',
        };

        const pkg = fileToPackage[fileBase];
        if (pkg && versions.has(pkg)) {
          const installed = versions.get(pkg);
          if (!versionGte(installed, refVersion)) {
            warnings.push({
              file,
              line: i + 1,
              message: `Rule references ${refVersion}+ but ${pkg} ${installed} is installed`,
            });
          }
        }
      }
    }
  }

  return warnings;
}

module.exports = { detectVersions, checkVersions, checkRuleVersionMismatches, parseVersion, versionGte };
