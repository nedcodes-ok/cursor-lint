#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { lintProject } = require('./index');
const { showStats } = require('./stats');
const { migrate } = require('./migrate');
const { doctor } = require('./doctor');
const { fullAudit, formatAuditMarkdown } = require('./audit');
const { autoFix } = require('./autofix');
const { isLicensed, activateLicense } = require('./license');
const { fixProject } = require('./fix');

const VERSION = '1.1.1';

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const BLUE = '\x1b[34m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

var PURCHASE_URL = 'https://nedcodes.gumroad.com/l/cursor-doctor-pro';

function showHelp() {
  var lines = [
    '',
    CYAN + BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- Fix your Cursor AI setup in seconds.',
    '',
    YELLOW + 'Usage:' + RESET,
    '  npx cursor-doctor              # Run health check (default)',
    '  npx cursor-doctor scan         # Same as above',
    '  npx cursor-doctor check        # Quick pass/fail for CI',
    '  npx cursor-doctor lint         # Detailed rule linting',
    '  npx cursor-doctor migrate      # Convert .cursorrules to .mdc',
    '  npx cursor-doctor stats        # Token usage dashboard',
    '',
    YELLOW + 'Pro Commands ($9 one-time key):' + RESET,
    '  npx cursor-doctor audit        # Full diagnostic report',
    '  npx cursor-doctor audit --md   # Export audit as markdown',
    '  npx cursor-doctor fix          # Auto-fix issues',
    '  npx cursor-doctor fix --dry-run # Preview fixes',
    '',
    YELLOW + 'Other:' + RESET,
    '  npx cursor-doctor activate <key>  # Activate license',
    '',
    DIM + 'Get a Pro key: ' + PURCHASE_URL + RESET,
    '',
  ];
  console.log(lines.join('\n'));
}

function requirePro(dir) {
  if (isLicensed(dir)) return true;
  console.log();
  console.log(YELLOW + 'This is a Pro feature.' + RESET);
  console.log('Get a license key ($9 one-time): ' + CYAN + PURCHASE_URL + RESET);
  console.log('Then run: ' + DIM + 'cursor-doctor activate <your-key>' + RESET);
  console.log();
  return false;
}

async function main() {
  var args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
  }

  var cwd = process.cwd();
  var asJson = args.includes('--json');
  var command = args.find(function(a) { return !a.startsWith('-'); }) || 'scan';

  // --- activate ---
  if (command === 'help') { showHelp(); process.exit(0); }
  if (command === 'version') { console.log(VERSION); process.exit(0); }

  if (command === 'activate') {
    var key = args[1];
    if (!key) {
      console.log(RED + 'Usage: cursor-doctor activate <key>' + RESET);
      process.exit(1);
    }
    var result = await activateLicense(cwd, key);
    if (result.ok) {
      console.log(GREEN + 'License activated.' + RESET + ' Pro commands unlocked.');
      console.log(DIM + 'Saved to ' + result.path + RESET);
    } else {
      console.log(RED + 'Activation failed: ' + RESET + result.error);
      process.exit(1);
    }
    process.exit(0);
  }

  // --- scan (free, default) ---
  if (command === 'scan') {
    var report = await doctor(cwd);

    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.grade === 'F' ? 1 : 0);
    }

    var gradeColors = { A: GREEN, B: GREEN, C: YELLOW, D: YELLOW, F: RED };
    var gc = gradeColors[report.grade] || RESET;

    console.log();
    console.log('  ' + gc + BOLD + 'Cursor Health: ' + report.grade + '  (' + report.percentage + '%)' + RESET);
    console.log('  ' + gc + String.fromCharCode(9472).repeat(34) + RESET);
    console.log();

    for (var i = 0; i < report.checks.length; i++) {
      var check = report.checks[i];
      var icon;
      if (check.status === 'pass') icon = GREEN + String.fromCharCode(10003) + RESET;
      else if (check.status === 'warn') icon = YELLOW + String.fromCharCode(9888) + RESET;
      else if (check.status === 'fail') icon = RED + String.fromCharCode(10007) + RESET;
      else icon = BLUE + String.fromCharCode(8505) + RESET;
      console.log('  ' + icon + ' ' + BOLD + check.name + RESET);
      console.log('    ' + DIM + check.detail + RESET);
    }
    console.log();

    var fixable = report.checks.filter(function(c) { return c.status === 'fail' || c.status === 'warn'; }).length;
    if (fixable > 0) {
      console.log('  ' + CYAN + fixable + ' issue(s) found.' + RESET + ' Run ' + CYAN + 'cursor-doctor fix' + RESET + ' to auto-repair. ' + DIM + '(Pro)' + RESET);
      console.log();
    }

    process.exit(report.grade === 'F' ? 1 : 0);
  }

  // --- check (free, CI) ---
  if (command === 'check') {
    var report = await doctor(cwd);
    var issues = report.checks.filter(function(c) { return c.status === 'fail' || c.status === 'warn'; });

    if (issues.length === 0) {
      console.log(GREEN + String.fromCharCode(10003) + RESET + ' Cursor setup healthy (' + report.grade + ', ' + report.percentage + '%)');
      process.exit(0);
    }

    for (var i = 0; i < issues.length; i++) {
      var issue = issues[i];
      var icon = issue.status === 'fail' ? RED + String.fromCharCode(10007) + RESET : YELLOW + String.fromCharCode(9888) + RESET;
      console.log(icon + ' ' + issue.name + ': ' + issue.detail);
    }
    console.log('\nGrade: ' + report.grade + ' (' + report.percentage + '%)');
    process.exit(1);
  }

  // --- lint (free) ---
  if (command === 'lint') {
    console.log();
    console.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- lint');
    console.log();
    var results = await lintProject(cwd);
    var totalErrors = 0;
    var totalWarnings = 0;
    var totalPassed = 0;
    for (var i = 0; i < results.length; i++) {
      var result = results[i];
      var relPath = path.relative(cwd, result.file) || result.file;
      console.log(relPath);
      if (result.issues.length === 0) {
        console.log('  ' + GREEN + String.fromCharCode(10003) + ' All checks passed' + RESET);
        totalPassed++;
      } else {
        for (var j = 0; j < result.issues.length; j++) {
          var issue = result.issues[j];
          var icon;
          if (issue.severity === 'error') { icon = RED + String.fromCharCode(10007) + RESET; totalErrors++; }
          else if (issue.severity === 'warning') { icon = YELLOW + String.fromCharCode(9888) + RESET; totalWarnings++; }
          else { icon = BLUE + String.fromCharCode(8505) + RESET; }
          var lineInfo = issue.line ? ' ' + DIM + '(line ' + issue.line + ')' + RESET : '';
          console.log('  ' + icon + ' ' + issue.message + lineInfo);
          if (issue.hint) console.log('    ' + DIM + String.fromCharCode(8594) + ' ' + issue.hint + RESET);
        }
      }
      console.log();
    }
    console.log(String.fromCharCode(9472).repeat(50));
    var parts = [];
    if (totalErrors > 0) parts.push(RED + totalErrors + ' error(s)' + RESET);
    if (totalWarnings > 0) parts.push(YELLOW + totalWarnings + ' warning(s)' + RESET);
    if (totalPassed > 0) parts.push(GREEN + totalPassed + ' passed' + RESET);
    console.log(parts.join(', '));
    console.log();
    process.exit(totalErrors > 0 ? 1 : 0);
  }

  // --- migrate (free) ---
  if (command === 'migrate') {
    console.log();
    console.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- migrate');
    console.log();
    var result = migrate(cwd);
    if (result.error) {
      console.log(RED + String.fromCharCode(10007) + RESET + ' ' + result.error);
      process.exit(1);
    }
    console.log(CYAN + 'Source:' + RESET + ' .cursorrules (' + result.source.lines + ' lines)');
    console.log();
    if (result.created.length > 0) {
      console.log(GREEN + 'Created:' + RESET);
      for (var i = 0; i < result.created.length; i++) console.log('  ' + GREEN + String.fromCharCode(10003) + RESET + ' .cursor/rules/' + result.created[i]);
    }
    if (result.skipped.length > 0) {
      console.log(YELLOW + 'Skipped:' + RESET);
      for (var i = 0; i < result.skipped.length; i++) console.log('  ' + YELLOW + String.fromCharCode(9888) + RESET + ' .cursor/rules/' + result.skipped[i]);
    }
    console.log();
    console.log(DIM + '.cursorrules was NOT deleted -- verify, then remove manually.' + RESET);
    console.log();
    process.exit(0);
  }

  // --- stats (free) ---
  if (command === 'stats') {
    console.log();
    console.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- stats');
    console.log();
    var stats = showStats(cwd);
    console.log(CYAN + 'Rules:' + RESET + '  ' + stats.mdcFiles.length + ' .mdc | ' + stats.skillFiles.length + ' skills | ~' + stats.totalTokens + ' tokens');
    console.log(CYAN + 'Tiers:' + RESET + '  ' + stats.tiers.always + ' always | ' + stats.tiers.glob + ' glob | ' + stats.tiers.manual + ' manual');
    if (stats.mdcFiles.length > 0) {
      console.log();
      console.log(CYAN + 'Biggest files:' + RESET);
      var sorted = stats.mdcFiles.slice().sort(function(a, b) { return b.tokens - a.tokens; }).slice(0, 5);
      for (var i = 0; i < sorted.length; i++) {
        var f = sorted[i];
        var pct = Math.round((f.tokens / stats.totalTokens) * 100);
        console.log('  ' + f.file.padEnd(30) + ' ' + String(f.tokens).padStart(5) + ' tokens (' + pct + '%)');
      }
    }
    console.log();
    process.exit(0);
  }

  // --- audit (PRO) ---
  if (command === 'audit') {
    if (!requirePro(cwd)) process.exit(1);
    var report = await fullAudit(cwd);
    if (args.includes('--md')) {
      process.stdout.write(formatAuditMarkdown(report));
    } else {
      console.log();
      console.log(CYAN + BOLD + 'cursor-doctor audit' + RESET);
      console.log();
      for (var i = 0; i < report.sections.length; i++) {
        var section = report.sections[i];
        console.log(BOLD + section.title + RESET);
        for (var j = 0; j < section.items.length; j++) {
          var item = section.items[j];
          var icon;
          if (item.type === 'pass') icon = GREEN + String.fromCharCode(10003) + RESET;
          else if (item.type === 'error') icon = RED + String.fromCharCode(10007) + RESET;
          else if (item.type === 'warning') icon = YELLOW + '!' + RESET;
          else if (item.type === 'fix') icon = BLUE + String.fromCharCode(8594) + RESET;
          else icon = DIM + String.fromCharCode(183) + RESET;
          console.log('  ' + icon + ' ' + item.text);
        }
        console.log();
      }
    }
    process.exit(0);
  }

  // --- fix (PRO) ---
  if (command === 'fix') {
    if (!requirePro(cwd)) process.exit(1);
    var dryRun = args.includes('--dry-run');
    var results = await autoFix(cwd, { dryRun: dryRun });

    console.log();
    console.log(CYAN + BOLD + 'cursor-doctor fix' + RESET + (dryRun ? ' ' + DIM + '(dry run)' + RESET : ''));
    console.log();

    if (results.errors.length > 0) {
      for (var i = 0; i < results.errors.length; i++) {
        console.log('  ' + RED + String.fromCharCode(10007) + RESET + ' ' + results.errors[i]);
      }
      process.exit(1);
    }

    var totalActions = results.fixed.length + results.splits.length + results.merged.length + 
                       results.annotated.length + results.generated.length + results.deduped.length;

    if (totalActions === 0) {
      console.log('  ' + GREEN + String.fromCharCode(10003) + RESET + ' Nothing to fix. Setup looks clean.');
      console.log();
      process.exit(0);
    }

    for (var i = 0; i < results.fixed.length; i++) {
      console.log('  ' + GREEN + String.fromCharCode(10003) + RESET + ' ' + results.fixed[i].file + ': ' + results.fixed[i].change);
    }
    for (var i = 0; i < results.splits.length; i++) {
      console.log('  ' + BLUE + String.fromCharCode(9986) + RESET + ' Split ' + results.splits[i].file + ' -> ' + results.splits[i].parts.join(', '));
    }
    for (var i = 0; i < results.merged.length; i++) {
      console.log('  ' + CYAN + String.fromCharCode(8645) + RESET + ' Merged ' + results.merged[i].removed + ' into ' + results.merged[i].kept + ' (' + results.merged[i].overlapPct + '% overlap)');
    }
    for (var i = 0; i < results.annotated.length; i++) {
      console.log('  ' + YELLOW + String.fromCharCode(9888) + RESET + ' Annotated ' + results.annotated[i].file + ' (conflicts with ' + results.annotated[i].conflictsWith + ')');
    }
    for (var i = 0; i < results.generated.length; i++) {
      console.log('  ' + GREEN + String.fromCharCode(10010) + RESET + ' Generated ' + results.generated[i].file + ' (' + results.generated[i].reason + ')');
    }
    for (var i = 0; i < results.deduped.length; i++) {
      console.log('  ' + YELLOW + '!' + RESET + ' ' + results.deduped[i].fileA + ' + ' + results.deduped[i].fileB + ': ' + results.deduped[i].overlapPct + '% overlap (manual review)');
    }
    console.log();
    process.exit(0);
  }

  // --- unknown ---
  console.log('Unknown command: ' + command);
  console.log('Run ' + DIM + 'cursor-doctor help' + RESET + ' for usage.');
  process.exit(1);
}

main().catch(function(err) {
  console.error(RED + 'Error:' + RESET + ' ' + err.message);
  process.exit(1);
});
