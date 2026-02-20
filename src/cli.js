#!/usr/bin/env node

const path = require('path');
const { lintProject } = require('./index');
const { verifyProject } = require('./verify');
const { initProject } = require('./init');

const VERSION = '0.3.1';

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function showHelp() {
  console.log(`
${CYAN}cursor-lint${RESET} v${VERSION}

Lint your Cursor rules and verify code compliance.

${YELLOW}Usage:${RESET}
  npx cursor-lint [options]

${YELLOW}Options:${RESET}
  --help, -h     Show this help message
  --version, -v  Show version number
  --verify       Check if code follows rules with verify: blocks
  --init         Generate starter .mdc rules (auto-detects your stack)

${YELLOW}What it checks (default):${RESET}
  • .cursorrules files (warns about agent mode compatibility)
  • .cursor/rules/*.mdc files (frontmatter, alwaysApply, etc.)
  • Vague rules that won't change AI behavior
  • YAML syntax errors

${YELLOW}What --verify checks:${RESET}
  • Scans code files matching rule globs
  • Checks for required patterns (pattern:, required:)
  • Catches forbidden patterns (antipattern:, forbidden:)
  • Reports violations with line numbers

${YELLOW}verify: block syntax in .mdc frontmatter:${RESET}
  ---
  globs: ["*.ts", "*.tsx"]
  verify:
    - pattern: "^import.*from '@/"
      message: "Use @/ alias for imports"
    - antipattern: "console\\\\.log"
      message: "Remove console.log"
    - required: "use strict"
      message: "Missing use strict"
    - forbidden: "TODO"
      message: "Resolve TODOs before commit"
  ---

${YELLOW}Examples:${RESET}
  npx cursor-lint              # Lint rule files
  npx cursor-lint --verify     # Check code against rules
  npx cursor-lint --init       # Generate starter rules for your project

${YELLOW}More info:${RESET}
  https://github.com/cursorrulespacks/cursor-lint
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  
  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
  }

  const cwd = process.cwd();
  const isVerify = args.includes('--verify');
  const isInit = args.includes('--init');

  if (isInit) {
    console.log(`\n🔍 cursor-lint v${VERSION} --init\n`);
    console.log(`Detecting stack in ${cwd}...\n`);

    const results = await initProject(cwd);

    const stacks = Object.entries(results.detected)
      .filter(([_, v]) => v)
      .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1));

    if (stacks.length > 0) {
      console.log(`Detected: ${stacks.join(', ')}\n`);
    }

    if (results.created.length > 0) {
      console.log(`${GREEN}Created:${RESET}`);
      for (const f of results.created) {
        console.log(`  ${GREEN}✓${RESET} .cursor/rules/${f}`);
      }
    }

    if (results.skipped.length > 0) {
      console.log(`\n${YELLOW}Skipped (already exist):${RESET}`);
      for (const f of results.skipped) {
        console.log(`  ${YELLOW}⚠${RESET} .cursor/rules/${f}`);
      }
    }

    if (results.created.length > 0) {
      console.log(`\n${DIM}Run cursor-lint to check these rules${RESET}`);
      console.log(`${DIM}Run cursor-lint --verify to check code against them${RESET}\n`);
    }

    process.exit(0);

  } else if (isVerify) {
    console.log(`\n🔍 cursor-lint v${VERSION} --verify\n`);
    console.log(`Scanning ${cwd} for rule violations...\n`);

    const results = await verifyProject(cwd);

    if (results.stats.rulesWithVerify === 0) {
      console.log(`${YELLOW}No rules with verify: blocks found.${RESET}`);
      console.log(`${DIM}Add verify: blocks to your .mdc frontmatter to check code compliance.${RESET}`);
      console.log(`${DIM}Run cursor-lint --help for syntax.${RESET}\n`);
      process.exit(0);
    }

    console.log(`Found ${results.stats.rulesWithVerify} rule(s) with verify blocks`);
    console.log(`Checked ${results.stats.filesChecked} file(s)\n`);

    if (results.violations.length === 0) {
      console.log(`${GREEN}✓ No violations found${RESET}\n`);
      process.exit(0);
    }

    // Group violations by file
    const byFile = {};
    for (const v of results.violations) {
      if (!byFile[v.file]) byFile[v.file] = [];
      byFile[v.file].push(v);
    }

    for (const [file, violations] of Object.entries(byFile)) {
      console.log(`${file}`);
      for (const v of violations) {
        const lineInfo = v.line ? ` ${DIM}(line ${v.line})${RESET}` : '';
        console.log(`  ${RED}✗${RESET} ${v.message}${lineInfo}`);
        if (v.match) {
          console.log(`    ${DIM}→ ${v.match}${RESET}`);
        }
      }
      console.log();
    }

    console.log('─'.repeat(50));
    console.log(`${RED}${results.stats.totalViolations} violation(s)${RESET} in ${results.stats.filesWithViolations} file(s)\n`);
    process.exit(1);

  } else {
    // Original lint mode
    const dir = args[0] ? path.resolve(args[0]) : cwd;

    console.log(`\n🔍 cursor-lint v${VERSION}\n`);
    console.log(`Scanning ${dir}...\n`);

    const results = await lintProject(dir);

    let totalErrors = 0;
    let totalWarnings = 0;
    let totalPassed = 0;

    for (const result of results) {
      const relPath = path.relative(dir, result.file) || result.file;
      console.log(relPath);

      if (result.issues.length === 0) {
        console.log(`  ${GREEN}✓ All checks passed${RESET}`);
        totalPassed++;
      } else {
        for (const issue of result.issues) {
          const icon = issue.severity === 'error' ? `${RED}✗${RESET}` : `${YELLOW}⚠${RESET}`;
          const lineInfo = issue.line ? ` ${DIM}(line ${issue.line})${RESET}` : '';
          console.log(`  ${icon} ${issue.message}${lineInfo}`);
          if (issue.hint) {
            console.log(`    ${DIM}→ ${issue.hint}${RESET}`);
          }
        }
        const errors = result.issues.filter(i => i.severity === 'error').length;
        const warnings = result.issues.filter(i => i.severity === 'warning').length;
        totalErrors += errors;
        totalWarnings += warnings;
        if (errors === 0 && warnings === 0) totalPassed++;
      }
      console.log();
    }

    console.log('─'.repeat(50));
    const parts = [];
    if (totalErrors > 0) parts.push(`${RED}${totalErrors} error${totalErrors !== 1 ? 's' : ''}${RESET}`);
    if (totalWarnings > 0) parts.push(`${YELLOW}${totalWarnings} warning${totalWarnings !== 1 ? 's' : ''}${RESET}`);
    if (totalPassed > 0) parts.push(`${GREEN}${totalPassed} passed${RESET}`);
    console.log(parts.join(', ') + '\n');

    if (totalErrors > 0) {
      console.log(`${DIM}Need help fixing these? Get a full setup review:${RESET}`);
      console.log(`${CYAN}https://cursorrulespacks.gumroad.com/l/cursor-setup-audit${RESET}\n`);
    }

    process.exit(totalErrors > 0 ? 1 : 0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
