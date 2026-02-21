const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://raw.githubusercontent.com/cursorrulespacks/cursorrules-collection/main/rules-mdc/';

const PKG_DEP_MAP = {
  'react': 'frameworks/react.mdc',
  'next': 'frameworks/nextjs.mdc',
  'vue': 'frameworks/vue.mdc',
  'svelte': 'frameworks/svelte.mdc',
  'express': 'frameworks/express.mdc',
  '@nestjs/core': 'frameworks/nestjs.mdc',
  'prisma': 'tools/prisma.mdc',
  'drizzle-orm': 'tools/drizzle.mdc',
};

const REQ_DEP_MAP = {
  'django': 'frameworks/django.mdc',
  'fastapi': 'frameworks/fastapi.mdc',
  'flask': 'frameworks/flask.mdc',
  'pydantic': 'tools/pydantic.mdc',
  'sqlalchemy': 'tools/sqlalchemy.mdc',
  'pytest': 'tools/pytest.mdc',
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

function detectStack(cwd) {
  const detected = [];
  const rules = new Map(); // rulePath -> stackName

  // package.json
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const [dep, rule] of Object.entries(PKG_DEP_MAP)) {
        if (allDeps[dep]) {
          detected.push(dep);
          rules.set(rule, dep);
        }
      }
    } catch {}
  }

  // tsconfig.json
  if (fs.existsSync(path.join(cwd, 'tsconfig.json'))) {
    detected.push('TypeScript');
    rules.set('languages/typescript.mdc', 'TypeScript');
  }

  // Python
  const reqPath = path.join(cwd, 'requirements.txt');
  const hasPy = fs.existsSync(reqPath) || fs.readdirSync(cwd).some(f => f.endsWith('.py'));
  if (hasPy) {
    detected.push('Python');
    rules.set('languages/python.mdc', 'Python');
  }
  if (fs.existsSync(reqPath)) {
    try {
      const req = fs.readFileSync(reqPath, 'utf8').toLowerCase();
      for (const [dep, rule] of Object.entries(REQ_DEP_MAP)) {
        if (req.includes(dep)) {
          detected.push(dep);
          rules.set(rule, dep);
        }
      }
    } catch {}
  }

  // Cargo.toml
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    detected.push('Rust');
    rules.set('languages/rust.mdc', 'Rust');
  }

  // go.mod
  if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    detected.push('Go');
    rules.set('languages/go.mdc', 'Go');
  }

  // Dockerfile
  if (fs.existsSync(path.join(cwd, 'Dockerfile'))) {
    detected.push('Docker');
    rules.set('tools/docker.mdc', 'Docker');
  }

  // CI/CD
  if (fs.existsSync(path.join(cwd, '.github', 'workflows'))) {
    detected.push('CI/CD');
    rules.set('tools/ci-cd.mdc', 'CI/CD');
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

module.exports = { generateRules };
