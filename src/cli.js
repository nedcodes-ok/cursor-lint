#!/usr/bin/env node

const path = require('path');
const { lintProject } = require('./index');
const { verifyProject } = require('./verify');
const { initProject } = require('./init');
const { fixProject } = require('./fix');
const { generateRules } = require('./generate');

const VERSION = '0.7.0';

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
  --fix          Auto-fix common issues (missing frontmatter, alwaysApply)
  --generate     Auto-detect stack & download matching .mdc rules from GitHub
  --order        Show rule load order, priority tiers, and token estimates

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
  npx cursor-lint --generate   # Download community rules for your stack

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
  const isFix = args.includes('--fix');
  const isGenerate = args.includes('--generate');
  const isOrder = args.includes('--order');

  if (isOrder) {
    const { showLoadOrder } = require('./order');
    console.log(`\n📋 cursor-lint v${VERSION} --order\n`);
    const dir = args.find(a => !a.startsWith('-')) ? path.resolve(args.find(a => !a.startsWith('-'))) : cwd;
    console.log(`Analyzing rule load order in ${dir}...\n`);

    const results = showLoadOrder(dir);

    if (results.rules.length === 0) {
      console.log(`${YELLOW}No rules found.${RESET}\n`);
      process.exit(0);
    }

    // Show .cursorrules warning if present
    if (results.hasCursorrules) {
      console.log(`${YELLOW}⚠ .cursorrules found${RESET} — overridden by any .mdc rule covering the same topic`);
      console.log(`${DIM}  .mdc files always take precedence when both exist${RESET}\n`);
    }

    // Group by priority tier
    const tiers = {
      'always': { label: 'Always Active', color: GREEN, rules: [] },
      'glob': { label: 'File-Scoped (glob match)', color: CYAN, rules: [] },
      'manual': { label: 'Manual Only (no alwaysApply, no globs)', color: DIM, rules: [] },
    };

    for (const rule of results.rules) {
      tiers[rule.tier].rules.push(rule);
    }

    let position = 1;
    for (const [key, tier] of Object.entries(tiers)) {
      if (tier.rules.length === 0) continue;
      console.log(`${tier.color}── ${tier.label} ──${RESET}`);
      for (const rule of tier.rules) {
        const globs = rule.globs.length > 0 ? ` ${DIM}[${rule.globs.join(', ')}]${RESET}` : '';
        const desc = rule.description ? ` ${DIM}— ${rule.description}${RESET}` : '';
        const size = ` ${DIM}(${rule.lines} lines, ~${rule.tokens} tokens)${RESET}`;
        console.log(`  ${position}. ${rule.file}${globs}${desc}${size}`);
        position++;
      }
      console.log();
    }

    // Token budget warning
    const totalTokens = results.rules.reduce((s, r) => s + r.tokens, 0);
    const alwaysTokens = tiers.always.rules.reduce((s, r) => s + r.tokens, 0);
    console.log('─'.repeat(50));
    console.log(`${CYAN}Total rules:${RESET} ${results.rules.length}`);
    console.log(`${CYAN}Always-active token estimate:${RESET} ~${alwaysTokens} tokens`);
    console.log(`${CYAN}All rules token estimate:${RESET} ~${totalTokens} tokens`);

    if (alwaysTokens > 4000) {
      console.log(`\n${YELLOW}⚠ Your always-active rules use ~${alwaysTokens} tokens.${RESET}`);
      console.log(`${DIM}  Large rule sets eat into your context window. Consider moving some to glob-scoped rules.${RESET}`);
    }

    if (results.warnings.length > 0) {
      console.log();
      for (const w of results.warnings) {
        console.log(`${YELLOW}⚠ ${w}${RESET}`);
      }
    }

    console.log();
    process.exit(0);

  } else if (isGenerate) {
    console.log(`\n🚀 cursor-lint v${VERSION} --generate\n`);
    console.log(`Detecting stack in ${cwd}...\n`);

    const results = await generateRules(cwd);

    if (results.detected.length > 0) {
      console.log(`${CYAN}Detected:${RESET} ${results.detected.join(', ')}\n`);
    } else {
      console.log(`${YELLOW}No recognized stack detected.${RESET}`);
      console.log(`${DIM}Supports: package.json, tsconfig.json, requirements.txt, Cargo.toml, go.mod, Dockerfile${RESET}\n`);
      process.exit(0);
    }

    if (results.created.length > 0) {
      console.log(`${GREEN}Downloaded:${RESET}`);
      for (const r of results.created) {
        console.log(`  ${GREEN}✓${RESET} .cursor/rules/${r.file} ${DIM}(${r.stack})${RESET}`);
      }
    }

    if (results.skipped.length > 0) {
      console.log(`\n${YELLOW}Skipped (already exist):${RESET}`);
      for (const r of results.skipped) {
        console.log(`  ${YELLOW}⚠${RESET} .cursor/rules/${r.file}`);
      }
    }

    if (results.failed.length > 0) {
      console.log(`\n${RED}Failed:${RESET}`);
      for (const r of results.failed) {
        console.log(`  ${RED}✗${RESET} ${r.file} — ${r.error}`);
      }
    }

    if (results.created.length > 0) {
      console.log(`\n${DIM}Run cursor-lint to check these rules${RESET}\n`);
    }

    process.exit(results.failed.length > 0 ? 1 : 0);

  } else if (isFix) {
    console.log(`\n🔧 cursor-lint v${VERSION} --fix\n`);
    console.log(`Scanning ${cwd} for fixable issues...\n`);

    const results = await fixProject(cwd);

    if (results.length === 0) {
      console.log(`${YELLOW}No .mdc files found in .cursor/rules/${RESET}\n`);
      process.exit(0);
    }

    let totalFixed = 0;
    for (const result of results) {
      const relPath = path.relative(cwd, result.file) || result.file;
      if (result.changes.length > 0) {
        console.log(`${GREEN}✓${RESET} ${relPath}`);
        for (const change of result.changes) {
          console.log(`  ${DIM}→ ${change}${RESET}`);
        }
        totalFixed++;
      } else {
        console.log(`${DIM}  ${relPath} — nothing to fix${RESET}`);
      }
    }

    console.log();
    console.log('─'.repeat(50));
    if (totalFixed > 0) {
      console.log(`${GREEN}Fixed ${totalFixed} file(s)${RESET}. Run cursor-lint to verify.\n`);
    } else {
      console.log(`${GREEN}All files look good — nothing to fix${RESET}\n`);
    }
    process.exit(0);

  } else if (isInit) {
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
    } else if (totalPassed > 0) {
      console.log(`${DIM}If cursor-lint saved you time: ${CYAN}https://github.com/cursorrulespacks/cursor-lint${RESET} ${DIM}(⭐ helps others find it)${RESET}\n`);
    }

    process.exit(totalErrors > 0 ? 1 : 0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
