const fs = require('fs');
const path = require('path');

async function initProject(projectPath) {
  const detected = detectStack(projectPath);
  const created = [];
  const skipped = [];

  const rulesDir = path.join(projectPath, '.cursor', 'rules');
  
  if (!fs.existsSync(rulesDir)) {
    fs.mkdirSync(rulesDir, { recursive: true });
  }

  const generalResult = writeRule(rulesDir, 'general.mdc', generateGeneral());
  if (generalResult.created) created.push(generalResult.file);
  else skipped.push(generalResult.file);

  if (detected.typescript) {
    const result = writeRule(rulesDir, 'typescript.mdc', generateTypeScript());
    if (result.created) created.push(result.file);
    else skipped.push(result.file);
  }

  if (detected.react && !detected.nextjs) {
    const result = writeRule(rulesDir, 'react.mdc', generateReact());
    if (result.created) created.push(result.file);
    else skipped.push(result.file);
  }

  if (detected.nextjs) {
    const result = writeRule(rulesDir, 'nextjs.mdc', generateNextJs());
    if (result.created) created.push(result.file);
    else skipped.push(result.file);
  }

  if (detected.express) {
    const result = writeRule(rulesDir, 'express.mdc', generateExpress());
    if (result.created) created.push(result.file);
    else skipped.push(result.file);
  }

  if (detected.python) {
    const result = writeRule(rulesDir, 'python.mdc', generatePython());
    if (result.created) created.push(result.file);
    else skipped.push(result.file);
  }

  return { created, skipped, detected };
}

function detectStack(projectPath) {
  const detected = {
    typescript: false,
    react: false,
    nextjs: false,
    express: false,
    python: false,
    node: false
  };

  if (fs.existsSync(path.join(projectPath, 'tsconfig.json'))) {
    detected.typescript = true;
  }

  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    detected.node = true;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (allDeps.react || allDeps['react-dom']) detected.react = true;
      if (allDeps.next) { detected.nextjs = true; detected.react = true; }
      if (allDeps.express) detected.express = true;
      if (allDeps.typescript || allDeps['@types/node']) detected.typescript = true;
    } catch (e) {}
  }

  try {
    const files = fs.readdirSync(projectPath);
    if (files.some(f => f.endsWith('.py')) || 
        fs.existsSync(path.join(projectPath, 'requirements.txt')) ||
        fs.existsSync(path.join(projectPath, 'pyproject.toml'))) {
      detected.python = true;
    }
  } catch (e) {}

  return detected;
}

function writeRule(rulesDir, filename, content) {
  const filePath = path.join(rulesDir, filename);
  if (fs.existsSync(filePath)) return { file: filename, created: false };
  fs.writeFileSync(filePath, content);
  return { file: filename, created: true };
}

function generateGeneral() {
  return `---
description: General code quality rules
alwaysApply: true
globs: ["*"]
verify:
  - antipattern: "TODO"
    message: "Resolve TODO comments before committing"
  - antipattern: "FIXME"
    message: "Resolve FIXME comments before committing"
  - antipattern: "console\\\\.log"
    message: "Remove console.log statements"
---

# General Guidelines

- Write clear, self-documenting code
- Use meaningful variable and function names
- Keep functions small and focused
- Remove all TODOs and FIXMEs before committing
- No console.log in production code
`;
}

function generateTypeScript() {
  return `---
description: TypeScript best practices
alwaysApply: true
globs: ["*.ts", "*.tsx"]
verify:
  - antipattern: ": any"
    message: "Avoid using 'any' type - use proper typing"
  - antipattern: "@ts-ignore"
    message: "Remove @ts-ignore - fix the type error instead"
---

# TypeScript Rules

- Use strict TypeScript configuration
- Avoid \`any\` type - use \`unknown\` if type is truly unknown
- Use type inference where possible, explicit types where helpful
- Prefer interfaces for object shapes, types for unions/intersections
`;
}

function generateReact() {
  return `---
description: React best practices
alwaysApply: true
globs: ["*.tsx", "*.jsx"]
verify:
  - antipattern: "dangerouslySetInnerHTML"
    message: "Avoid dangerouslySetInnerHTML - use proper sanitization if needed"
---

# React Rules

- Use functional components with hooks
- Before writing a useEffect, ask: can this be computed during render?
- Keep components small and focused
- Use proper key props in lists (never use array index as key for dynamic lists)
`;
}

function generateNextJs() {
  return `---
description: Next.js App Router best practices
alwaysApply: true
globs: ["*.ts", "*.tsx"]
verify:
  - antipattern: "getServerSideProps"
    message: "Use App Router patterns instead of getServerSideProps"
  - antipattern: "getStaticProps"
    message: "Use App Router patterns instead of getStaticProps"
---

# Next.js Rules

- Use App Router (app directory), not Pages Router
- Mark components as 'use client' only when they need client-side interactivity
- Default to Server Components
- Use Server Actions for mutations instead of API routes
- Use the @/ path alias for imports
`;
}

function generateExpress() {
  return `---
description: Express/Node.js best practices
alwaysApply: true
globs: ["*.js", "*.ts"]
verify:
  - antipattern: "app\\\\.use\\\\(express\\\\.json\\\\(\\\\)\\\\)"
    message: "Consider adding body size limits to express.json()"
---

# Express Rules

- Use async/await with proper error handling
- Always validate and sanitize user input
- Use middleware for cross-cutting concerns
- Add rate limiting for public endpoints
`;
}

function generatePython() {
  return `---
description: Python best practices
alwaysApply: true
globs: ["*.py"]
verify:
  - antipattern: "print\\\\("
    message: "Use logging instead of print statements"
  - antipattern: "import \\\\*"
    message: "Avoid wildcard imports - import specific names"
  - antipattern: "except:"
    message: "Avoid bare except - catch specific exceptions"
---

# Python Rules

- Follow PEP 8 style guidelines
- Use type hints for function signatures
- Use logging instead of print statements
- Handle exceptions specifically, never use bare except
`;
}

module.exports = { initProject, detectStack };
