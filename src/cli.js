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
const { analyzeTokenBudget, CONTEXT_WINDOW_TOKENS } = require('./token-budget');
const { crossConflictReport } = require('./cross-conflicts');
const { analyzePerformance } = require('./performance');
const { testRule, testAllRules, getProvider } = require('./rule-test');
const { exportRules, importRules, detectDrift, setBaseline } = require('./team-sync');
const { lintAgentConfigs, formatAgentLint } = require('./agents-lint');
const { lintMcpConfigs, formatMcpLint } = require('./mcp-lint');
const { initProject } = require('./init');
const { getPackNames, getPack, getAllPacks } = require('./registry');

const VERSION = require('../package.json').version;

var useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const RED = useColor ? '\x1b[31m' : '';
const YELLOW = useColor ? '\x1b[33m' : '';
const GREEN = useColor ? '\x1b[32m' : '';
const CYAN = useColor ? '\x1b[36m' : '';
const BLUE = useColor ? '\x1b[34m' : '';
const BOLD = useColor ? '\x1b[1m' : '';
const DIM = useColor ? '\x1b[2m' : '';
const RESET = useColor ? '\x1b[0m' : '';

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
    '  npx cursor-doctor init         # Generate rules based on your stack',
    '  npx cursor-doctor install      # Install community rule packs',
    '  npx cursor-doctor lint         # Detailed rule linting',
    '  npx cursor-doctor migrate      # Convert .cursorrules to .mdc (--dry-run, --force)',
    '  npx cursor-doctor stats        # Token usage dashboard',
    '  npx cursor-doctor budget       # Smart token budget analysis',
    '  npx cursor-doctor agents       # Lint CLAUDE.md, AGENTS.md, .cursor/agents/',
    '  npx cursor-doctor mcp          # Validate MCP config files',
    '',
    YELLOW + 'Pro Commands ($9 one-time key):' + RESET,
    '  npx cursor-doctor audit        # Full diagnostic report',
    '  npx cursor-doctor audit --md   # Export audit as markdown',
    '  npx cursor-doctor budget --pro # Per-file-type breakdown, waste detection, history',
    '  npx cursor-doctor conflicts    # Cross-format conflict detection',
    '  npx cursor-doctor perf         # Rule performance tracking',
    '  npx cursor-doctor test <file>  # Test rule adherence with AI',
    '  npx cursor-doctor test <rule> <code>  # Test single rule against code',
    '  npx cursor-doctor team export  # Export rules as shareable config',
    '  npx cursor-doctor team import <source>  # Import rules from file/URL',
    '  npx cursor-doctor team drift   # Detect drift from team baseline',
    '  npx cursor-doctor team baseline <source>  # Set team baseline',
    '  npx cursor-doctor fix          # Auto-fix issues',
    '  npx cursor-doctor fix --dry-run # Preview fixes',
    '',
    YELLOW + 'Other:' + RESET,
    '  npx cursor-doctor activate <key>  # Activate license',
    '  npx cursor-doctor-mcp              # MCP server (for AI assistants)',
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
  console.log('  Includes: audit, fix, conflicts, budget --pro,');
  console.log('  rule performance tracking, AI rule testing, team sync.');
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

  var asJson = args.includes('--json');
  var command = args.find(function(a) { return !a.startsWith('-'); }) || 'scan';
  
  // Parse path argument (first non-flag arg after command)
  // Exception: install command uses args for pack names, not paths
  var pathArg = null;
  if (command !== 'install') {
    var foundCommand = false;
    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg.startsWith('-')) continue;
      if (!foundCommand) {
        if (arg === command) foundCommand = true;
        continue;
      }
      // First non-flag arg after command is the path
      pathArg = arg;
      break;
    }
  }
  
  var cwd = pathArg ? path.resolve(pathArg) : process.cwd();

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

    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.grade === 'F' || report.grade === 'D' ? 1 : 0);
    }

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
    var results = await lintProject(cwd);

    if (asJson) {
      var jsonResults = results.map(function(r) {
        return { file: path.relative(cwd, r.file) || r.file, issues: r.issues };
      });
      console.log(JSON.stringify(jsonResults, null, 2));
      var hasJsonErrors = results.some(function(r) { return r.issues.some(function(i) { return i.severity === 'error'; }); });
      process.exit(hasJsonErrors ? 1 : 0);
    }

    console.log();
    console.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- lint');
    console.log();
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

  // --- init (free) ---
  if (command === 'init') {
    var dryRun = args.includes('--dry-run');
    var force = args.includes('--force');
    
    console.log();
    console.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- init' + (dryRun ? ' ' + DIM + '(dry run)' + RESET : ''));
    console.log();
    
    var result = await initProject(cwd, { dryRun: dryRun, force: force });
    
    if (result.error) {
      console.log(RED + String.fromCharCode(10007) + RESET + ' ' + result.error);
      console.log();
      console.log('  ' + CYAN + 'Use --force to overwrite existing rules' + RESET);
      console.log();
      process.exit(1);
    }
    
    if (result.created.length === 0 && result.skipped.length === 0) {
      console.log(YELLOW + 'No rules generated. Is this an empty project?' + RESET);
      console.log();
      process.exit(0);
    }
    
    if (result.created.length > 0) {
      console.log(GREEN + (dryRun ? 'Would create:' : 'Created:') + RESET);
      for (var i = 0; i < result.created.length; i++) {
        console.log('  ' + GREEN + String.fromCharCode(10003) + RESET + ' .cursor/rules/' + result.created[i]);
      }
      console.log();
    }
    
    if (result.skipped.length > 0) {
      console.log(YELLOW + 'Skipped (already exist):' + RESET);
      for (var i = 0; i < result.skipped.length; i++) {
        console.log('  ' + YELLOW + String.fromCharCode(9888) + RESET + ' .cursor/rules/' + result.skipped[i]);
      }
      console.log();
    }
    
    console.log(CYAN + BOLD + result.summary + RESET);
    console.log();
    
    if (!dryRun) {
      console.log(DIM + 'Next steps:' + RESET);
      console.log('  1. Review the generated rules in .cursor/rules/');
      console.log('  2. Customize them for your project');
      console.log('  3. Run ' + CYAN + 'cursor-doctor scan' + RESET + ' to verify');
      console.log();
    }
    
    process.exit(0);
  }

  // --- install (free) ---
  if (command === 'install') {
    var dryRun = args.includes('--dry-run');
    var force = args.includes('--force');
    var list = args.includes('--list');
    
    // List available packs
    if (list) {
      console.log();
      console.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- available rule packs');
      console.log();
      var allPacks = getAllPacks();
      var packNames = getPackNames();
      for (var i = 0; i < packNames.length; i++) {
        var packName = packNames[i];
        var pack = allPacks[packName];
        console.log('  ' + CYAN + BOLD + packName.padEnd(15) + RESET + DIM + pack.description + RESET);
        console.log('    ' + DIM + pack.rules.length + ' rules' + RESET);
      }
      console.log();
      console.log('  ' + DIM + 'Install: npx cursor-doctor install <pack-name>' + RESET);
      console.log('  ' + DIM + 'Example: npx cursor-doctor install react typescript' + RESET);
      console.log();
      process.exit(0);
    }
    
    // Get pack names from arguments
    var packNamesToInstall = args.filter(function(a) { return !a.startsWith('-') && a !== 'install'; });
    
    if (packNamesToInstall.length === 0) {
      console.log();
      console.log(BOLD + 'cursor-doctor install' + RESET + ' -- community rule packs');
      console.log();
      console.log(YELLOW + 'Usage:' + RESET);
      console.log('  npx cursor-doctor install <pack>         # Install a rule pack');
      console.log('  npx cursor-doctor install --list         # List available packs');
      console.log('  npx cursor-doctor install <pack> --dry-run   # Preview without writing');
      console.log('  npx cursor-doctor install <pack> --force     # Overwrite existing files');
      console.log();
      console.log(CYAN + 'Examples:' + RESET);
      console.log('  npx cursor-doctor install react');
      console.log('  npx cursor-doctor install react typescript testing');
      console.log();
      console.log(DIM + 'Run with --list to see all available packs' + RESET);
      console.log();
      process.exit(0);
    }
    
    console.log();
    console.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- install' + (dryRun ? ' ' + DIM + '(dry run)' + RESET : ''));
    console.log();
    
    var rulesDir = path.join(cwd, '.cursor', 'rules');
    
    // Create rules directory if it doesn't exist
    if (!dryRun && !fs.existsSync(rulesDir)) {
      fs.mkdirSync(rulesDir, { recursive: true });
    }
    
    var totalCreated = [];
    var totalSkipped = [];
    var errors = [];
    
    for (var i = 0; i < packNamesToInstall.length; i++) {
      var packName = packNamesToInstall[i];
      var pack = getPack(packName);
      
      if (!pack) {
        errors.push('Unknown pack: ' + packName);
        continue;
      }
      
      for (var j = 0; j < pack.rules.length; j++) {
        var rule = pack.rules[j];
        var rulePath = path.join(rulesDir, rule.filename);
        var exists = fs.existsSync(rulePath);
        
        if (exists && !force) {
          totalSkipped.push({ pack: packName, file: rule.filename });
        } else {
          if (!dryRun) {
            fs.writeFileSync(rulePath, rule.body, 'utf-8');
          }
          totalCreated.push({ pack: packName, file: rule.filename });
        }
      }
    }
    
    // Display errors
    if (errors.length > 0) {
      for (var i = 0; i < errors.length; i++) {
        console.log('  ' + RED + String.fromCharCode(10007) + RESET + ' ' + errors[i]);
      }
      console.log();
      console.log('  ' + DIM + 'Run --list to see available packs' + RESET);
      console.log();
      process.exit(1);
    }
    
    // Display created
    if (totalCreated.length > 0) {
      console.log(GREEN + (dryRun ? 'Would install:' : 'Installed:') + RESET);
      for (var i = 0; i < totalCreated.length; i++) {
        console.log('  ' + GREEN + String.fromCharCode(10003) + RESET + ' ' + totalCreated[i].file + ' ' + DIM + '(' + totalCreated[i].pack + ')' + RESET);
      }
      console.log();
    }
    
    // Display skipped
    if (totalSkipped.length > 0) {
      console.log(YELLOW + 'Skipped (already exist):' + RESET);
      for (var i = 0; i < totalSkipped.length; i++) {
        console.log('  ' + YELLOW + String.fromCharCode(9888) + RESET + ' ' + totalSkipped[i].file + ' ' + DIM + '(' + totalSkipped[i].pack + ')' + RESET);
      }
      console.log();
      if (!force) {
        console.log('  ' + DIM + 'Use --force to overwrite existing files' + RESET);
        console.log();
      }
    }
    
    // Summary
    if (totalCreated.length > 0 || totalSkipped.length > 0) {
      var packCount = packNamesToInstall.filter(function(p) { return getPack(p); }).length;
      var summary = 'Installed ' + totalCreated.length + ' rule' + (totalCreated.length === 1 ? '' : 's') + 
                    ' from ' + packCount + ' pack' + (packCount === 1 ? '' : 's');
      if (dryRun) {
        summary = 'Would install ' + totalCreated.length + ' rule' + (totalCreated.length === 1 ? '' : 's');
      }
      console.log(CYAN + BOLD + summary + RESET);
      console.log();
      
      if (!dryRun && totalCreated.length > 0) {
        console.log(DIM + 'Next:' + RESET + ' npx cursor-doctor lint' + DIM + ' to verify rules' + RESET);
        console.log();
      }
    }
    
    process.exit(0);
  }

  // --- migrate (free) ---
  if (command === 'migrate') {
    var dryRun = args.includes('--dry-run');
    var force = args.includes('--force');
    
    console.log();
    console.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- migrate' + (dryRun ? ' ' + DIM + '(dry run)' + RESET : ''));
    console.log();
    
    var result = migrate(cwd, { dryRun: dryRun, force: force });
    
    if (result.error) {
      console.log(RED + String.fromCharCode(10007) + RESET + ' ' + result.error);
      console.log();
      if (result.error.includes('existing .mdc')) {
        console.log('  ' + CYAN + 'Use --force to overwrite existing rules' + RESET);
        console.log();
      }
      process.exit(1);
    }
    
    console.log(CYAN + 'Migrated .cursorrules ' + String.fromCharCode(8594) + ' .cursor/rules/' + RESET);
    console.log();
    
    if (result.created.length > 0) {
      console.log(GREEN + (dryRun ? 'Would create:' : 'Created') + ' ' + result.created.length + ' file(s):' + RESET);
      for (var i = 0; i < result.created.length; i++) {
        var file = result.created[i];
        var globsText = '';
        if (file.globs && file.globs.length > 0) {
          globsText = ' (globs: ' + file.globs.join(', ') + ')';
        } else if (file.alwaysApply) {
          globsText = ' (alwaysApply: true)';
        }
        console.log('  ' + GREEN + String.fromCharCode(10003) + RESET + ' ' + file.file + globsText);
      }
      console.log();
    }
    
    if (result.skipped.length > 0) {
      console.log(YELLOW + 'Skipped:' + RESET);
      for (var i = 0; i < result.skipped.length; i++) {
        console.log('  ' + YELLOW + String.fromCharCode(9888) + RESET + ' ' + result.skipped[i].file + ' (' + result.skipped[i].reason + ')');
      }
      console.log();
    }
    
    // Lint warnings
    if (result.lintIssues > 0 && !dryRun) {
      console.log(YELLOW + result.lintIssues + ' lint warning(s) found ' + String.fromCharCode(8594) + ' run ' + CYAN + 'npx cursor-doctor fix' + YELLOW + ' to auto-fix' + RESET);
      console.log();
    }
    
    if (!dryRun && result.backupCreated) {
      console.log(DIM + 'Original .cursorrules backed up to ' + result.backupCreated + RESET);
      console.log();
    }
    
    if (dryRun) {
      console.log(DIM + 'This was a dry run. Run without --dry-run to apply changes.' + RESET);
      console.log();
    }
    
    process.exit(0);
  }

  // --- stats (free) ---
  if (command === 'stats') {
    var stats = showStats(cwd);

    if (asJson) {
      console.log(JSON.stringify(stats, null, 2));
      process.exit(0);
    }

    console.log();
    console.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- stats');
    console.log();
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

  // --- perf (PRO) ---
  if (command === 'perf' || command === 'performance') {
    if (!requirePro(cwd)) process.exit(1);

    var days = 30;
    var daysArg = args.find(function(a) { return a.startsWith('--days='); });
    if (daysArg) {
      var parsed = parseInt(daysArg.split('=')[1], 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 3650) {
        console.log(YELLOW + 'Invalid --days value, using default (30)' + RESET);
      } else {
        days = parsed;
      }
    }

    var analysis = analyzePerformance(cwd, { days: days });

    if (analysis.error) {
      console.log(RED + String.fromCharCode(10007) + RESET + ' ' + analysis.error);
      process.exit(1);
    }

    if (asJson) {
      console.log(JSON.stringify(analysis, null, 2));
      process.exit(0);
    }

    console.log();
    console.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- rule performance');
    console.log();
    console.log('  ' + DIM + 'Period: ' + analysis.period + ' | Source: ' + analysis.dataSource +
      (analysis.hasExtensionData ? ' + VS Code extension' : '') +
      ' | Files: ' + analysis.totalFilesAnalyzed + RESET);
    console.log();

    var s = analysis.summary;
    console.log('  ' + CYAN + BOLD + 'Summary' + RESET);
    console.log('    ' + GREEN + s.active + ' active' + RESET + '  ' +
      CYAN + s.always + ' always-on' + RESET + '  ' +
      YELLOW + s.low + ' low activity' + RESET + '  ' +
      RED + s.dead + ' dead' + RESET + '  ' +
      DIM + s.manual + ' manual' + RESET);
    console.log();

    if (s.dead > 0) {
      console.log('  ' + RED + BOLD + String.fromCharCode(9888) + ' Dead Rules (no matching files in ' + analysis.period + '):' + RESET);
      for (var i = 0; i < analysis.rules.length; i++) {
        var r = analysis.rules[i];
        if (r.status !== 'dead') continue;
        console.log('    ' + RED + String.fromCharCode(10007) + RESET + ' ' + r.file + ' (~' + r.tokens + ' tokens wasted)');
        if (r.globs.length > 0) {
          console.log('      ' + DIM + 'globs: ' + r.globs.join(', ') + ' — no matching files changed' + RESET);
        } else {
          console.log('      ' + DIM + 'no globs, not alwaysApply — requires manual @mention' + RESET);
        }
      }
      console.log();
      console.log('    ' + YELLOW + 'Wasted tokens: ~' + s.wastedTokens + '/request on dead rules' + RESET);
      console.log('    ' + DIM + 'Consider removing or converting to glob-targeted rules.' + RESET);
      console.log();
    }

    if (s.active > 0 || s.always > 0) {
      console.log('  ' + GREEN + BOLD + 'Active Rules:' + RESET);
      for (var i = 0; i < analysis.rules.length; i++) {
        var r = analysis.rules[i];
        if (r.status !== 'active' && r.status !== 'always') continue;
        var icon = r.status === 'always' ? CYAN + String.fromCharCode(9679) + RESET : GREEN + String.fromCharCode(9679) + RESET;
        var activationText = r.status === 'always'
          ? 'always-on (' + r.matchedFileCount + ' files)'
          : r.gitActivations + ' git changes, ' + r.matchedFileCount + ' files';
        if (r.extensionActivations > 0) {
          activationText += ', ' + r.extensionActivations + ' editor triggers';
        }
        console.log('    ' + icon + ' ' + r.file.padEnd(30) + ' ' + DIM + activationText + RESET);
      }
      console.log();
    }

    if (s.low > 0) {
      console.log('  ' + YELLOW + BOLD + 'Low Activity:' + RESET);
      for (var i = 0; i < analysis.rules.length; i++) {
        var r = analysis.rules[i];
        if (r.status !== 'low') continue;
        console.log('    ' + YELLOW + String.fromCharCode(9675) + RESET + ' ' + r.file + ' (' + r.totalActivations + ' activation(s) in ' + analysis.period + ')');
      }
      console.log();
    }

    process.exit(0);
  }

  // --- test (PRO) ---
  if (command === 'test') {
    if (!requirePro(cwd)) process.exit(1);

    var provider = getProvider();
    if (!provider) {
      console.log();
      console.log(RED + 'No API key found.' + RESET + ' Set one of:');
      console.log('  ' + CYAN + 'GEMINI_API_KEY' + RESET + '     (free tier available at ai.google.dev)');
      console.log('  ' + CYAN + 'OPENAI_API_KEY' + RESET + '     (requires billing)');
      console.log('  ' + CYAN + 'ANTHROPIC_API_KEY' + RESET + '  (requires billing)');
      console.log();
      console.log(DIM + 'Example: GEMINI_API_KEY=your-key npx cursor-doctor test src/app.tsx' + RESET);
      console.log();
      process.exit(1);
    }

    // Determine mode: test <code-file> (all rules) or test <rule-file> <code-file>
    var nonFlagArgs = args.filter(function(a) { return !a.startsWith('-') && a !== 'test'; });
    
    if (nonFlagArgs.length === 0) {
      console.log(RED + 'Usage:' + RESET);
      console.log('  cursor-doctor test <code-file>              # Test all rules against file');
      console.log('  cursor-doctor test <rule.mdc> <code-file>   # Test single rule');
      console.log('  cursor-doctor test <rule.mdc> --code "..."  # Test with inline code');
      process.exit(1);
    }

    if (!asJson) {
      console.log();
      console.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- rule testing (' + provider.name + ')');
      console.log();
    }

    if (nonFlagArgs.length === 1) {
      // Test all rules against a code file
      var codeFile = nonFlagArgs[0];
      if (!asJson) {
        console.log('  ' + DIM + 'Testing all rules against ' + codeFile + '...' + RESET);
        console.log();
      }

      var results = await testAllRules(cwd, codeFile, {});

      if (results.error) {
        console.log('  ' + RED + results.error + RESET);
        process.exit(1);
      }

      if (asJson) {
        console.log(JSON.stringify(results, null, 2));
        process.exit(0);
      }

      for (var i = 0; i < results.results.length; i++) {
        var r = results.results[i];
        if (r.error) {
          console.log('  ' + RED + String.fromCharCode(10007) + RESET + ' ' + r.file + ': ' + r.error);
          continue;
        }
        var icon = r.adherence ? GREEN + String.fromCharCode(10003) + RESET : RED + String.fromCharCode(10007) + RESET;
        var scoreText = r.score !== null ? ' (' + r.score + '/100)' : '';
        console.log('  ' + icon + ' ' + BOLD + r.file + RESET + scoreText);
        if (r.violations && r.violations.length > 0) {
          for (var j = 0; j < r.violations.length; j++) {
            console.log('    ' + RED + '-' + RESET + ' ' + r.violations[j]);
          }
        }
        if (r.improvements && r.improvements.length > 0) {
          for (var j = 0; j < r.improvements.length; j++) {
            console.log('    ' + GREEN + '+' + RESET + ' ' + r.improvements[j]);
          }
        }
        if (r.diff && r.diff.changeCount > 0) {
          console.log('    ' + DIM + r.diff.changeCount + ' line(s) changed' + RESET);
        }
      }

      console.log();
      var sum = results.summary;
      console.log('  ' + GREEN + sum.passed + ' passed' + RESET + '  ' +
        RED + sum.failed + ' failed' + RESET + '  ' +
        (sum.errors > 0 ? YELLOW + sum.errors + ' errors' + RESET + '  ' : '') +
        CYAN + 'Adherence: ' + sum.adherenceRate + '%' + RESET);
      console.log();
    } else {
      // Test single rule against code
      var ruleFile = nonFlagArgs[0];
      var codeSource = nonFlagArgs[1];
      
      // Load rule
      var rulePath = ruleFile;
      if (!path.isAbsolute(rulePath) && !fs.existsSync(rulePath)) {
        rulePath = path.join(cwd, '.cursor', 'rules', ruleFile);
      }
      if (!fs.existsSync(rulePath)) {
        console.log('  ' + RED + 'Rule file not found: ' + ruleFile + RESET);
        process.exit(1);
      }
      var ruleContent = fs.readFileSync(rulePath, 'utf-8');
      
      // Load code
      var codeSnippet;
      var inlineCode = args.find(function(a) { return a.startsWith('--code='); });
      if (inlineCode) {
        codeSnippet = inlineCode.slice(7);
      } else if (fs.existsSync(codeSource)) {
        codeSnippet = fs.readFileSync(codeSource, 'utf-8');
      } else {
        codeSnippet = codeSource;
      }
      
      if (!asJson) {
        console.log('  ' + DIM + 'Testing ' + path.basename(rulePath) + ' against code...' + RESET);
        console.log();
      }

      var result = await testRule(ruleContent, codeSnippet, { abTest: true });

      if (asJson) {
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      }

      if (result.error) {
        console.log('  ' + RED + result.error + RESET);
        process.exit(1);
      }

      var icon = result.adherence ? GREEN + String.fromCharCode(10003) + ' PASS' + RESET : RED + String.fromCharCode(10007) + ' FAIL' + RESET;
      console.log('  ' + icon + (result.score !== null ? '  Score: ' + BOLD + result.score + '/100' + RESET : ''));
      console.log();

      if (result.violations && result.violations.length > 0) {
        console.log('  ' + RED + 'Violations:' + RESET);
        for (var j = 0; j < result.violations.length; j++) {
          console.log('    ' + RED + String.fromCharCode(8226) + RESET + ' ' + result.violations[j]);
        }
        console.log();
      }

      if (result.improvements && result.improvements.length > 0) {
        console.log('  ' + GREEN + 'Improvements applied:' + RESET);
        for (var j = 0; j < result.improvements.length; j++) {
          console.log('    ' + GREEN + String.fromCharCode(8226) + RESET + ' ' + result.improvements[j]);
        }
        console.log();
      }

      if (result.diff && result.diff.changed) {
        console.log('  ' + CYAN + 'Changes (' + result.diff.changeCount + ' lines):' + RESET);
        for (var j = 0; j < Math.min(result.diff.changes.length, 15); j++) {
          var change = result.diff.changes[j];
          if (change.type === 'removed') {
            console.log('    ' + RED + '- ' + change.text + RESET);
          } else if (change.type === 'added') {
            console.log('    ' + GREEN + '+ ' + change.text + RESET);
          } else if (change.type === 'changed') {
            console.log('    ' + RED + '- ' + change.from + RESET);
            console.log('    ' + GREEN + '+ ' + change.to + RESET);
          }
        }
        if (result.diff.changes.length > 15) {
          console.log('    ' + DIM + '... and ' + (result.diff.changes.length - 15) + ' more' + RESET);
        }
        console.log();
      }

      if (result.abDiff && result.abDiff.changed) {
        console.log('  ' + CYAN + BOLD + 'A/B Comparison' + RESET + ' (with rule vs without):');
        console.log('    ' + DIM + result.abDiff.changeCount + ' lines differ between with-rule and without-rule output' + RESET);
        console.log('    ' + DIM + 'The rule IS making a measurable difference.' + RESET);
        console.log();
      } else if (result.abDiff && !result.abDiff.changed) {
        console.log('  ' + YELLOW + 'A/B: No difference' + RESET + ' — the model produces the same output with or without this rule.');
        console.log('    ' + DIM + 'This rule may not be effective for this code pattern.' + RESET);
        console.log();
      }
    }
    process.exit(0);
  }

  // --- team (PRO) ---
  if (command === 'team') {
    if (!requirePro(cwd)) process.exit(1);

    var subcommand = args.find(function(a) { return !a.startsWith('-') && a !== 'team'; });

    if (!subcommand) {
      console.log();
      console.log(BOLD + 'cursor-doctor team' + RESET + ' — Team Sync');
      console.log();
      console.log(CYAN + 'Commands:' + RESET);
      console.log('  team export              Export rules to shareable config');
      console.log('  team import <source>     Import rules from file or URL');
      console.log('  team baseline <source>   Set team baseline (file or URL)');
      console.log('  team drift               Detect drift from baseline');
      console.log();
      console.log(CYAN + 'Options:' + RESET);
      console.log('  --overwrite              Overwrite existing rules on import');
      console.log('  --include-context        Include CLAUDE.md/AGENTS.md in export/import');
      console.log('  --name="Config Name"     Name the exported config');
      console.log('  --out=<file>             Output file for export (default: stdout)');
      console.log();
      process.exit(0);
    }

    // --- team export ---
    if (subcommand === 'export') {
      var result = exportRules(cwd, {
        name: (args.find(function(a) { return a.startsWith('--name='); }) || '').slice(7) || undefined,
        includeContext: args.includes('--include-context'),
      });

      if (result.error) {
        console.log(RED + String.fromCharCode(10007) + RESET + ' ' + result.error);
        process.exit(1);
      }

      var outFile = (args.find(function(a) { return a.startsWith('--out='); }) || '').slice(6);
      var jsonOutput = JSON.stringify(result.config, null, 2);

      if (outFile) {
        fs.writeFileSync(outFile, jsonOutput, 'utf-8');
        console.log();
        console.log('  ' + GREEN + String.fromCharCode(10003) + RESET + ' Exported ' + result.config.ruleCount + ' rules to ' + BOLD + outFile + RESET);
        console.log('  ' + DIM + 'Share this file with your team, or host it at a URL for cursor-doctor team baseline.' + RESET);
        console.log();
      } else {
        process.stdout.write(jsonOutput + '\n');
      }
      process.exit(0);
    }

    // --- team import ---
    if (subcommand === 'import') {
      var source = args.filter(function(a) { return !a.startsWith('-') && a !== 'team' && a !== 'import'; })[0];
      if (!source) {
        console.log(RED + 'Usage: cursor-doctor team import <file-or-url>' + RESET);
        process.exit(1);
      }

      // Load config
      var config;
      if (source.startsWith('http://') || source.startsWith('https://')) {
        try {
          var { fetchUrl } = require('./team-sync');
          // Use inline fetch for URL imports
          var https = require('https');
          var http = require('http');
          var data = await new Promise(function(resolve, reject) {
            var client = source.startsWith('https') ? https : http;
            client.get(source, function(res) {
              if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
              var d = '';
              res.on('data', function(chunk) { d += chunk; });
              res.on('end', function() { resolve(d); });
            }).on('error', reject);
          });
          config = JSON.parse(data);
        } catch (e) {
          console.log(RED + 'Failed to fetch: ' + e.message + RESET);
          process.exit(1);
        }
      } else if (fs.existsSync(source)) {
        try {
          config = JSON.parse(fs.readFileSync(source, 'utf-8'));
        } catch (e) {
          console.log(RED + 'Failed to parse: ' + e.message + RESET);
          process.exit(1);
        }
      } else {
        console.log(RED + 'Source not found: ' + source + RESET);
        process.exit(1);
      }

      var dryRun = args.includes('--dry-run');
      var result = importRules(cwd, config, {
        dryRun: dryRun,
        overwrite: args.includes('--overwrite'),
        includeContext: args.includes('--include-context'),
      });

      if (result.error) {
        console.log(RED + String.fromCharCode(10007) + RESET + ' ' + result.error);
        process.exit(1);
      }

      console.log();
      console.log(BOLD + 'cursor-doctor team import' + RESET + (dryRun ? ' ' + DIM + '(dry run)' + RESET : ''));
      console.log();
      for (var i = 0; i < result.created.length; i++) {
        console.log('  ' + GREEN + String.fromCharCode(10003) + RESET + ' Created: ' + result.created[i].file);
      }
      for (var i = 0; i < result.updated.length; i++) {
        console.log('  ' + CYAN + String.fromCharCode(8635) + RESET + ' Updated: ' + result.updated[i].file);
      }
      for (var i = 0; i < result.skipped.length; i++) {
        console.log('  ' + YELLOW + String.fromCharCode(9888) + RESET + ' Skipped: ' + result.skipped[i].file + ' (' + result.skipped[i].reason + ')');
      }
      console.log();
      process.exit(0);
    }

    // --- team baseline ---
    if (subcommand === 'baseline') {
      var source = args.filter(function(a) { return !a.startsWith('-') && a !== 'team' && a !== 'baseline'; })[0];
      if (!source) {
        console.log(RED + 'Usage: cursor-doctor team baseline <file-or-url>' + RESET);
        console.log(DIM + 'Sets the team baseline for drift detection.' + RESET);
        process.exit(1);
      }

      var result = setBaseline(cwd, source);
      console.log();
      console.log('  ' + GREEN + String.fromCharCode(10003) + RESET + ' Baseline set: ' + BOLD + source + RESET);
      console.log('  ' + DIM + 'Saved to ' + result.path + RESET);
      console.log('  ' + DIM + 'Run "cursor-doctor team drift" to check for divergence.' + RESET);
      console.log();
      process.exit(0);
    }

    // --- team drift ---
    if (subcommand === 'drift') {
      var result = await detectDrift(cwd);

      if (result.error) {
        console.log();
        console.log('  ' + RED + String.fromCharCode(10007) + RESET + ' ' + result.error);
        console.log();
        process.exit(1);
      }

      if (asJson) {
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      }

      console.log();
      console.log(BOLD + 'cursor-doctor team drift' + RESET);
      console.log();
      console.log('  ' + DIM + 'Baseline: ' + result.baselineSource + ' (' + result.baselineDate + ')' + RESET);
      console.log('  ' + DIM + 'Rules: ' + result.totalRulesLocal + ' local / ' + result.totalRulesBaseline + ' baseline' + RESET);
      console.log();

      if (result.clean) {
        console.log('  ' + GREEN + String.fromCharCode(10003) + ' No drift detected. Local rules match baseline.' + RESET);
        console.log();
      } else {
        console.log('  ' + YELLOW + BOLD + result.driftCount + ' difference(s) found:' + RESET);
        console.log();

        for (var i = 0; i < result.drifts.length; i++) {
          var d = result.drifts[i];
          var icon;
          if (d.type === 'deleted') icon = RED + String.fromCharCode(10007) + ' DELETED' + RESET;
          else if (d.type === 'modified') icon = YELLOW + String.fromCharCode(9998) + ' MODIFIED' + RESET;
          else if (d.type === 'added') icon = GREEN + String.fromCharCode(10010) + ' ADDED' + RESET;
          else icon = DIM + '?' + RESET;

          console.log('  ' + icon + '  ' + BOLD + d.file + RESET);
          console.log('    ' + DIM + d.detail + RESET);
        }
        console.log();
        console.log('  ' + DIM + 'To sync: cursor-doctor team import <baseline> --overwrite' + RESET);
        console.log();
      }
      process.exit(result.clean ? 0 : 1);
    }

    console.log('Unknown team subcommand: ' + subcommand);
    console.log('Run ' + DIM + 'cursor-doctor team' + RESET + ' for usage.');
    process.exit(1);
  }

  // --- agents (FREE) ---
  if (command === 'agents') {
    var results = lintAgentConfigs(cwd);

    if (asJson) {
      console.log(JSON.stringify(results, null, 2));
      process.exit(0);
    }

    console.log();
    console.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- agent config validation');
    console.log();
    console.log(formatAgentLint(results, useColor));
    console.log();

    var hasConflictFiles = results.some(function(r) { return r.exists; });
    if (hasConflictFiles) {
      console.log('  ' + DIM + 'Pro tip: run ' + CYAN + 'cursor-doctor conflicts' + DIM + ' to detect cross-format contradictions' + RESET);
      console.log();
    }

    var hasErrors = results.some(function(r) { return r.issues && r.issues.some(function(i) { return i.severity === 'error'; }); });
    process.exit(hasErrors ? 1 : 0);
  }

  // --- mcp (FREE) ---
  if (command === 'mcp') {
    var report = lintMcpConfigs(cwd);

    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    }

    console.log();
    console.log(BOLD + 'cursor-doctor' + RESET + ' v' + VERSION + ' -- MCP config validation');
    console.log();
    console.log(formatMcpLint(report, useColor));
    console.log();

    var hasErrors = report.files.some(function(f) { return f.issues && f.issues.some(function(i) { return i.severity === 'error'; }); });
    process.exit(hasErrors ? 1 : 0);
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
  process.exit(2);
});
