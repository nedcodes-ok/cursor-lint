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
const { analyzeTokenBudget, CONTEXT_WINDOW_TOKENS } = require('./token-budget');
const { crossConflictReport } = require('./cross-conflicts');

const VERSION = '1.4.1';

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
    '  npx cursor-doctor budget       # Smart token budget analysis',
    '',
    YELLOW + 'Pro Commands ($9 one-time key):' + RESET,
    '  npx cursor-doctor audit        # Full diagnostic report',
    '  npx cursor-doctor audit --md   # Export audit as markdown',
    '  npx cursor-doctor budget --pro # Per-file-type breakdown, waste detection, history',
    '  npx cursor-doctor conflicts    # Cross-format conflict detection',
    '  npx cursor-doctor fix          # Auto-fix issues',
    '  npx cursor-doctor fix --dry-run # Preview fixes',
    '',
    YELLOW + 'Other:' + RESET,
    '  npx cursor-doctor activate <key>  # Activate license',
    '',
    DIM + 'Get a Pro key: ' + PURCHASE_URL + '?utm_source=cli&utm_medium=npx&utm_campaign=help' + RESET,
    '',
  ];
  console.log(lines.join('\n'));
}

function requirePro(dir) {
  if (isLicensed(dir)) return true;
  console.log();
  console.log(YELLOW + BOLD + 'Pro feature — $9 one-time, no subscription.' + RESET);
  console.log();
  console.log('  Includes: audit (full diagnostics), fix (auto-repair),');
  console.log('  conflict detection, redundancy cleanup, stack templates.');
  console.log();
  console.log('  ' + CYAN + PURCHASE_URL + '?utm_source=cli&utm_medium=npx&utm_campaign=paywall' + RESET);
  console.log('  Then: ' + DIM + 'cursor-doctor activate <your-key>' + RESET);
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
    var gradeEmoji = { A: String.fromCharCode(11088), B: String.fromCharCode(10004), C: String.fromCharCode(9888), D: String.fromCharCode(9881), F: String.fromCharCode(128680) };
    var gc = gradeColors[report.grade] || RESET;

    console.log();
    console.log('  ' + gc + BOLD + String.fromCharCode(9618).repeat(2) + ' Cursor Health: ' + report.grade + ' ' + String.fromCharCode(9618).repeat(2) + RESET);
    console.log();

    // Progress bar
    var barWidth = 30;
    var filled = Math.round((report.percentage / 100) * barWidth);
    var empty = barWidth - filled;
    var bar = gc + String.fromCharCode(9608).repeat(filled) + RESET + DIM + String.fromCharCode(9617).repeat(empty) + RESET;
    console.log('  ' + bar + '  ' + gc + BOLD + report.percentage + '%' + RESET);
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

    var passes = report.checks.filter(function(c) { return c.status === 'pass'; }).length;
    var fixable = report.checks.filter(function(c) { return c.status === 'fail' || c.status === 'warn'; }).length;
    console.log('  ' + GREEN + passes + ' passed' + RESET + '  ' + (fixable > 0 ? YELLOW + fixable + ' fixable' + RESET : ''));
    console.log();

    if (fixable > 0) {
      console.log('  ' + CYAN + 'Auto-fix:' + RESET + ' npx cursor-doctor fix');
      console.log('  ' + CYAN + 'Full diagnostic:' + RESET + ' npx cursor-doctor audit');
      console.log('  ' + DIM + 'Pro ($9 one-time) ' + PURCHASE_URL + '?utm_source=cli&utm_medium=npx&utm_campaign=scan' + RESET);
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

  // --- budget (free basic, pro detailed) ---
  if (command === 'budget') {
    var isPro = args.includes('--pro');
    if (isPro && !requirePro(cwd)) process.exit(1);

    var analysis = analyzeTokenBudget(cwd, { pro: isPro });

    if (asJson) {
      console.log(JSON.stringify(analysis, null, 2));
      process.exit(0);
    }

    console.log();
    console.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- token budget');
    console.log();

    // Context window visualization
    var pctAlways = Math.round((analysis.alwaysLoadedTokens / CONTEXT_WINDOW_TOKENS) * 100);
    var pctCond = Math.round((analysis.conditionalTokens / CONTEXT_WINDOW_TOKENS) * 100);
    var barWidth = 40;
    var filledAlways = Math.max(0, Math.round((pctAlways / 100) * barWidth));
    var filledCond = Math.max(0, Math.min(barWidth - filledAlways, Math.round((pctCond / 100) * barWidth)));
    var empty = Math.max(0, barWidth - filledAlways - filledCond);

    var barColor = pctAlways < 5 ? GREEN : pctAlways < 15 ? YELLOW : RED;
    var bar = barColor + String.fromCharCode(9608).repeat(filledAlways) + RESET +
              BLUE + String.fromCharCode(9608).repeat(filledCond) + RESET +
              DIM + String.fromCharCode(9617).repeat(empty) + RESET;

    console.log('  ' + CYAN + BOLD + 'Context Window Usage' + RESET);
    console.log('  ' + bar + '  ' + barColor + BOLD + analysis.contextWindowPct + '%' + RESET + ' always loaded');
    console.log();

    console.log('  ' + CYAN + 'Always loaded:' + RESET + '  ~' + analysis.alwaysLoadedTokens + ' tokens (' + analysis.contextWindowPct + '% of ' + (CONTEXT_WINDOW_TOKENS / 1000) + 'K context window)');
    console.log('  ' + CYAN + 'Conditional:' + RESET + '    ~' + analysis.conditionalTokens + ' tokens (loaded when matching files are open)');
    console.log('  ' + CYAN + 'Total:' + RESET + '          ~' + analysis.totalTokens + ' tokens');
    console.log();

    // Context files
    if (analysis.contextFiles.length > 0) {
      console.log('  ' + CYAN + 'Context Files:' + RESET);
      for (var i = 0; i < analysis.contextFiles.length; i++) {
        var cf = analysis.contextFiles[i];
        console.log('    ' + cf.file.padEnd(25) + ' ~' + String(cf.tokens).padStart(5) + ' tokens');
      }
      console.log();
    }

    // Top rules by cost (free: top 5, pro: all)
    var showCount = isPro ? analysis.rankedRules.length : Math.min(5, analysis.rankedRules.length);
    if (analysis.rankedRules.length > 0) {
      console.log('  ' + CYAN + (isPro ? 'All Rules by Cost:' : 'Biggest Rules:') + RESET);
      for (var i = 0; i < showCount; i++) {
        var r = analysis.rankedRules[i];
        var pct = analysis.totalTokens > 0 ? Math.round((r.tokens / analysis.totalTokens) * 100) : 0;
        var tierIcon = r.tier === 'always' ? RED + String.fromCharCode(9679) + RESET : r.tier === 'glob' ? YELLOW + String.fromCharCode(9679) + RESET : DIM + String.fromCharCode(9675) + RESET;
        console.log('    ' + tierIcon + ' ' + r.file.padEnd(30) + ' ~' + String(r.tokens).padStart(5) + ' tokens (' + pct + '%)');
      }
      if (!isPro && analysis.rankedRules.length > 5) {
        console.log('    ' + DIM + '... and ' + (analysis.rankedRules.length - 5) + ' more. Use --pro for full breakdown.' + RESET);
      }
      console.log();
      console.log('    ' + RED + String.fromCharCode(9679) + RESET + ' always  ' + YELLOW + String.fromCharCode(9679) + RESET + ' glob  ' + DIM + String.fromCharCode(9675) + RESET + ' manual');
      console.log();
    }

    if (isPro) {
      // Per-file-type breakdown
      if (analysis.fileTypeGroups) {
        console.log('  ' + CYAN + BOLD + 'Token Cost by File Type:' + RESET);
        var sortedGroups = Object.entries(analysis.fileTypeGroups).sort(function(a, b) { return b[1].totalTokens - a[1].totalTokens; });
        for (var i = 0; i < sortedGroups.length; i++) {
          var group = sortedGroups[i];
          var name = group[0];
          var data = group[1];
          var pct = analysis.totalTokens > 0 ? Math.round((data.totalTokens / analysis.totalTokens) * 100) : 0;
          var miniBar = CYAN + String.fromCharCode(9608).repeat(Math.max(1, Math.round(pct / 5))) + RESET;
          console.log('    ' + name.padEnd(15) + ' ~' + String(data.totalTokens).padStart(5) + ' tokens (' + pct + '%) ' + miniBar);
          for (var j = 0; j < data.rules.length; j++) {
            console.log('      ' + DIM + data.rules[j].file + ' (' + data.rules[j].tokens + ')' + RESET);
          }
        }
        console.log();
      }

      // Waste detection
      if (analysis.waste && analysis.waste.length > 0) {
        console.log('  ' + YELLOW + BOLD + String.fromCharCode(9888) + ' Token Waste Detected:' + RESET);
        for (var i = 0; i < analysis.waste.length; i++) {
          var w = analysis.waste[i];
          console.log('    ' + YELLOW + String.fromCharCode(9888) + RESET + ' ' + w.file + ' (' + w.tokens + ' tokens, ' + w.confidence + ' confidence)');
          console.log('      ' + DIM + w.reason + RESET);
          console.log('      ' + CYAN + 'Fix:' + RESET + ' Add globs: ' + w.suggestedGlob + ' to frontmatter');
        }
        console.log();
        console.log('    ' + GREEN + 'Potential savings: ~' + analysis.totalWasteTokens + ' tokens/request' + RESET);
        console.log();
      } else {
        console.log('  ' + GREEN + String.fromCharCode(10003) + ' No token waste detected.' + RESET);
        console.log();
      }

      // Historical trend
      if (analysis.trend) {
        console.log('  ' + CYAN + BOLD + 'Trend (vs last snapshot):' + RESET);
        var arrow = analysis.trend.direction === 'up' ? RED + String.fromCharCode(9650) : analysis.trend.direction === 'down' ? GREEN + String.fromCharCode(9660) : YELLOW + '=';
        console.log('    ' + arrow + RESET + ' Tokens: ' + (analysis.trend.tokenDelta > 0 ? '+' : '') + analysis.trend.tokenDelta);
        console.log('    Rules: ' + (analysis.trend.ruleDelta > 0 ? '+' : '') + analysis.trend.ruleDelta);
        console.log();
      }
    } else {
      // Free teaser
      console.log('  ' + DIM + 'Want per-file-type breakdown, waste detection, and history?' + RESET);
      console.log('  ' + CYAN + 'npx cursor-doctor budget --pro' + RESET + '  ' + DIM + '($9 one-time)' + RESET);
      console.log('  ' + DIM + PURCHASE_URL + '?utm_source=cli&utm_medium=npx&utm_campaign=budget' + RESET);
      console.log();
    }

    process.exit(0);
  }

  // --- conflicts (PRO) ---
  if (command === 'conflicts') {
    if (!requirePro(cwd)) process.exit(1);

    var report = crossConflictReport(cwd);

    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    }

    console.log();
    console.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- cross-format conflicts');
    console.log();

    if (report.clean) {
      console.log('  ' + GREEN + String.fromCharCode(10003) + ' ' + report.summary + RESET);
      console.log();
      console.log('  ' + DIM + 'Checked: .cursor/rules/*.mdc, CLAUDE.md, AGENTS.md, .cursorrules, hooks.json' + RESET);
      console.log();
    } else {
      console.log('  ' + RED + BOLD + report.summary + RESET);
      console.log();

      var groups = report.groups;
      for (var key in groups) {
        console.log('  ' + BOLD + key + RESET);
        var groupConflicts = groups[key];
        for (var i = 0; i < groupConflicts.length; i++) {
          var c = groupConflicts[i];
          console.log('    ' + RED + String.fromCharCode(10007) + RESET + ' ' + c.directiveA + ' ' + DIM + '(line ' + c.lineA + ')' + RESET);
          console.log('      vs ' + c.directiveB + ' ' + DIM + '(line ' + c.lineB + ')' + RESET);
        }
        console.log();
      }

      console.log('  ' + CYAN + 'Files with conflicts:' + RESET);
      for (var i = 0; i < report.filesCovered.length; i++) {
        console.log('    ' + report.filesCovered[i]);
      }
      console.log();
      console.log('  ' + DIM + 'Fix: align the directives across files, or remove the contradictory instruction.' + RESET);
      console.log();
    }

    process.exit(report.clean ? 0 : 1);
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
