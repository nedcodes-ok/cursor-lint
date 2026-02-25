#!/usr/bin/env node

const path = require('path');
const { lintProject } = require('./index');
const { verifyProject } = require('./verify');
const { initProject } = require('./init');
const { fixProject } = require('./fix');
const { generateRules, suggestSkills, listPresets, generateFromPreset } = require('./generate');
const { checkVersions, checkRuleVersionMismatches } = require('./versions');
const { showStats } = require('./stats');
const { migrate } = require('./migrate');
const { doctor } = require('./doctor');
const { saveSnapshot, diffSnapshot } = require('./diff');
const { lintPlugin } = require('./plugin');

const VERSION = '1.0.0';

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const BLUE = '\x1b[34m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function showHelp() {
  console.log(`
${BOLD}cursor-doctor${RESET} v${VERSION} — Fix your Cursor AI setup in seconds.

${YELLOW}Usage:${RESET}
  npx cursor-doctor              # Run health check (default)
  npx cursor-doctor scan         # Same as above
  npx cursor-doctor check        # Quick pass/fail for CI
  npx cursor-doctor lint         # Detailed rule linting
  npx cursor-doctor migrate      # Convert .cursorrules to .mdc
  npx cursor-doctor fix          # Auto-fix common issues
  npx cursor-doctor generate     # Download rules for your stack
  npx cursor-doctor stats        # Token usage dashboard
  npx cursor-doctor verify       # Check code against rules
  npx cursor-doctor diff         # Compare rules to snapshot
  npx cursor-doctor diff save    # Save snapshot

${YELLOW}Options:${RESET}
  --help, -h     Show this help
  --version, -v  Show version
  --json         Output as JSON (scan/check only)

${YELLOW}What it checks:${RESET}
  * Rule syntax and YAML frontmatter errors
  * Legacy .cursorrules that should be migrated
  * Context file sizes (bloated files hurt AI performance)
  * Token budget across all rules
  * Coverage gaps (missing rules for your file types)
  * alwaysApply overuse
  * Agent skills setup

${YELLOW}More info:${RESET}
  https://github.com/nedcodes-ok/cursor-doctor
`);
}

async function runScan(dir, asJson) {
  const report = await doctor(dir);

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  console.log();
  const gradeColors = { A: GREEN, B: GREEN, C: YELLOW, D: YELLOW, F: RED };
  const gc = gradeColors[report.grade] || RESET;
  console.log('  ' + gc + BOLD + String.fromCharCode(9556) + String.fromCharCode(9552).repeat(34) + String.fromCharCode(9559) + RESET);
  console.log('  ' + gc + BOLD + String.fromCharCode(9553) + '  Cursor Health: ' + report.grade + '  (' + report.percentage + '%)' + ' '.repeat(Math.max(0, 13 - String(report.percentage).length)) + String.fromCharCode(9553) + RESET);
  console.log('  ' + gc + BOLD + String.fromCharCode(9562) + String.fromCharCode(9552).repeat(34) + String.fromCharCode(9565) + RESET);
  console.log();

  for (const check of report.checks) {
    let icon;
    if (check.status === 'pass') icon = GREEN + String.fromCharCode(10003) + RESET;
    else if (check.status === 'warn') icon = YELLOW + String.fromCharCode(9888) + RESET;
    else if (check.status === 'fail') icon = RED + String.fromCharCode(10007) + RESET;
    else icon = BLUE + 'i' + RESET;
    console.log('  ' + icon + ' ' + check.name);
    console.log('    ' + DIM + check.detail + RESET);
  }
  console.log();

  const fixable = report.checks.filter(c => c.status === 'fail' || c.status === 'warn').length;
  if (fixable > 0) {
    console.log('  ' + CYAN + fixable + ' issue(s) found.' + RESET + ' Run ' + CYAN + 'cursor-doctor fix' + RESET + ' to auto-repair.');
    console.log();
  }

  if (report.grade === 'F' || report.grade === 'D') {
    console.log('  ' + YELLOW + 'Quick wins:' + RESET);
    console.log('    * ' + CYAN + 'cursor-doctor generate' + RESET + ' — download rules for your stack');
    if (report.checks.some(c => c.name.includes('legacy') && c.status !== 'pass')) {
      console.log('    * ' + CYAN + 'cursor-doctor migrate' + RESET + ' — convert .cursorrules to .mdc');
    }
  }

  console.log();
  return report;
}

async function runCheck(dir) {
  const report = await doctor(dir);
  const issues = report.checks.filter(c => c.status === 'fail' || c.status === 'warn');

  if (issues.length === 0) {
    console.log(GREEN + String.fromCharCode(10003) + RESET + ' Cursor setup healthy (' + report.grade + ', ' + report.percentage + '%)');
    process.exit(0);
  }

  for (const issue of issues) {
    const icon = issue.status === 'fail' ? (RED + String.fromCharCode(10007) + RESET) : (YELLOW + String.fromCharCode(9888) + RESET);
    console.log(icon + ' ' + issue.name + ': ' + issue.detail);
  }
  console.log('\nGrade: ' + report.grade + ' (' + report.percentage + '%)');
  process.exit(1);
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
  const asJson = args.includes('--json');
  const command = args.find(a => !a.startsWith('-')) || 'scan';

  switch (command) {
    case 'scan': {
      const report = await runScan(cwd, asJson);
      process.exit(report.grade === 'F' ? 1 : 0);
      break;
    }

    case 'check': {
      await runCheck(cwd);
      break;
    }

    case 'lint': {
      console.log('\n' + BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' — lint\n');
      console.log('Scanning ' + cwd + '...\n');
      const results = await lintProject(cwd);
      let totalErrors = 0, totalWarnings = 0, totalPassed = 0;
      for (const result of results) {
        const relPath = path.relative(cwd, result.file) || result.file;
        console.log(relPath);
        if (result.issues.length === 0) {
          console.log('  ' + GREEN + String.fromCharCode(10003) + ' All checks passed' + RESET);
          totalPassed++;
        } else {
          for (const issue of result.issues) {
            let icon;
            if (issue.severity === 'error') { icon = RED + String.fromCharCode(10007) + RESET; totalErrors++; }
            else if (issue.severity === 'warning') { icon = YELLOW + String.fromCharCode(9888) + RESET; totalWarnings++; }
            else icon = BLUE + 'i' + RESET;
            const lineInfo = issue.line ? (' ' + DIM + '(line ' + issue.line + ')' + RESET) : '';
            console.log('  ' + icon + ' ' + issue.message + lineInfo);
            if (issue.hint) console.log('    ' + DIM + '-> ' + issue.hint + RESET);
          }
        }
        console.log();
      }
      console.log('-'.repeat(50));
      const parts = [];
      if (totalErrors > 0) parts.push(RED + totalErrors + ' error(s)' + RESET);
      if (totalWarnings > 0) parts.push(YELLOW + totalWarnings + ' warning(s)' + RESET);
      if (totalPassed > 0) parts.push(GREEN + totalPassed + ' passed' + RESET);
      console.log(parts.join(', ') + '\n');
      process.exit(totalErrors > 0 ? 1 : 0);
      break;
    }

    case 'migrate': {
      console.log('\n' + BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' — migrate\n');
      const result = migrate(cwd);
      if (result.error) { console.log(RED + String.fromCharCode(10007) + RESET + ' ' + result.error); process.exit(1); }
      console.log(CYAN + 'Source:' + RESET + ' .cursorrules (' + result.source.lines + ' lines)\n');
      if (result.created.length > 0) {
        console.log(GREEN + 'Created:' + RESET);
        for (const f of result.created) console.log('  ' + GREEN + String.fromCharCode(10003) + RESET + ' .cursor/rules/' + f);
      }
      if (result.skipped.length > 0) {
        console.log(YELLOW + 'Skipped:' + RESET);
        for (const f of result.skipped) console.log('  ' + YELLOW + String.fromCharCode(9888) + RESET + ' .cursor/rules/' + f);
      }
      console.log('\n' + DIM + '.cursorrules was NOT deleted — verify, then remove manually.' + RESET + '\n');
      process.exit(0);
      break;
    }

    case 'fix': {
      console.log('\n' + BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' — fix\n');
      console.log('Scanning ' + cwd + ' for fixable issues...\n');
      const results = await fixProject(cwd);
      if (results.length === 0) { console.log(YELLOW + 'No .mdc files found' + RESET + '\n'); process.exit(0); }
      let totalFixed = 0;
      for (const result of results) {
        const relPath = path.relative(cwd, result.file) || result.file;
        if (result.changes.length > 0) {
          console.log(GREEN + String.fromCharCode(10003) + RESET + ' ' + relPath);
          for (const change of result.changes) console.log('  ' + DIM + '-> ' + change + RESET);
          totalFixed++;
        }
      }
      console.log('\n' + (totalFixed > 0 ? GREEN + 'Fixed ' + totalFixed + ' file(s)' + RESET : GREEN + 'Nothing to fix' + RESET) + '\n');
      process.exit(0);
      break;
    }

    case 'generate': {
      const presetIndex = args.indexOf('--preset');
      const hasPreset = presetIndex !== -1;
      const presetValue = hasPreset ? args[presetIndex + 1] : null;

      if (hasPreset && presetValue === 'list') {
        console.log('\n' + BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' — presets\n');
        const presets = listPresets();
        for (const [key, preset] of Object.entries(presets)) {
          console.log('  ' + GREEN + key.padEnd(12) + RESET + ' ' + preset.name + ' — ' + DIM + preset.description + RESET);
        }
        console.log('\n' + YELLOW + 'Usage:' + RESET + ' cursor-doctor generate --preset t3\n');
        process.exit(0);
      }

      console.log('\n' + BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' — generate\n');
      console.log('Detecting stack in ' + cwd + '...\n');

      if (hasPreset && presetValue) {
        const results = await generateFromPreset(cwd, presetValue);
        if (results.created.length > 0) {
          console.log(GREEN + 'Downloaded:' + RESET);
          for (const r of results.created) console.log('  ' + GREEN + String.fromCharCode(10003) + RESET + ' .cursor/rules/' + r.file);
        }
        process.exit(0);
      }

      const results = await generateRules(cwd);
      if (results.detected.length > 0) {
        console.log(CYAN + 'Detected:' + RESET + ' ' + results.detected.join(', ') + '\n');
      }
      if (results.created.length > 0) {
        console.log(GREEN + 'Downloaded:' + RESET);
        for (const r of results.created) console.log('  ' + GREEN + String.fromCharCode(10003) + RESET + ' .cursor/rules/' + r.file + ' ' + DIM + '(' + r.stack + ')' + RESET);
      }
      if (results.skipped.length > 0) {
        console.log(YELLOW + 'Skipped:' + RESET);
        for (const r of results.skipped) console.log('  ' + YELLOW + String.fromCharCode(9888) + RESET + ' .cursor/rules/' + r.file);
      }
      console.log();
      process.exit(0);
      break;
    }

    case 'stats': {
      console.log('\n' + BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' — stats\n');
      const stats = showStats(cwd);
      console.log(CYAN + 'Rules:' + RESET + '  ' + stats.mdcFiles.length + ' .mdc | ' + stats.skillFiles.length + ' skills | ~' + stats.totalTokens + ' tokens');
      console.log(CYAN + 'Tiers:' + RESET + '  ' + stats.tiers.always + ' always | ' + stats.tiers.glob + ' glob | ' + stats.tiers.manual + ' manual');
      if (stats.mdcFiles.length > 0) {
        console.log('\n' + CYAN + 'Biggest files:' + RESET);
        const sorted = [...stats.mdcFiles].sort((a, b) => b.tokens - a.tokens).slice(0, 5);
        for (const f of sorted) {
          const pct = Math.round((f.tokens / stats.totalTokens) * 100);
          console.log('  ' + f.file.padEnd(30) + ' ' + String(f.tokens).padStart(5) + ' tokens (' + pct + '%)');
        }
      }
      console.log();
      process.exit(0);
      break;
    }

    case 'verify': {
      console.log('\n' + BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' — verify\n');
      const results = await verifyProject(cwd);
      if (results.stats.rulesWithVerify === 0) {
        console.log(YELLOW + 'No rules with verify: blocks found.' + RESET + '\n');
        process.exit(0);
      }
      if (results.violations.length === 0) {
        console.log(GREEN + String.fromCharCode(10003) + ' No violations' + RESET + '\n');
        process.exit(0);
      }
      for (const v of results.violations) {
        console.log(RED + String.fromCharCode(10007) + RESET + ' ' + v.file + (v.line ? ':' + v.line : '') + ' — ' + v.message);
      }
      console.log('\n' + RED + results.stats.totalViolations + ' violation(s)' + RESET + '\n');
      process.exit(1);
      break;
    }

    case 'diff': {
      if (args.includes('save')) {
        const { path: snapPath, state } = saveSnapshot(cwd);
        console.log(GREEN + String.fromCharCode(10003) + RESET + ' Snapshot saved (' + Object.keys(state.rules).length + ' rules)\n');
        process.exit(0);
      }
      const changes = diffSnapshot(cwd);
      if (changes.error) { console.log(RED + String.fromCharCode(10007) + RESET + ' ' + changes.error + '\n'); process.exit(1); }
      if (!changes.hasChanges) { console.log(GREEN + String.fromCharCode(10003) + ' No changes since snapshot' + RESET + '\n'); process.exit(0); }
      if (changes.added.length) for (const f of changes.added) console.log(GREEN + '+' + RESET + ' ' + f.file);
      if (changes.removed.length) for (const f of changes.removed) console.log(RED + '-' + RESET + ' ' + f.file);
      if (changes.modified.length) for (const f of changes.modified) console.log(YELLOW + '~' + RESET + ' ' + f.file);
      console.log();
      process.exit(1);
      break;
    }

    default: {
      console.log('Unknown command: ' + command + '\n');
      showHelp();
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
