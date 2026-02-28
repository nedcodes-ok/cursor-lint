/**
 * agents-lint.js — CLAUDE.md + AGENTS.md validation
 * FREE: Structure, length, common mistakes
 * PRO: Cross-format conflict detection (via cross-conflicts.js)
 */

const fs = require('fs');
const path = require('path');

// Max recommended sizes (bytes)
var MAX_CLAUDE_SIZE = 32000;   // ~8k tokens
var MAX_AGENTS_SIZE = 32000;
var MAX_AGENT_FILE_SIZE = 16000;

// Common structural patterns for CLAUDE.md
var CLAUDE_SECTIONS = [
  { pattern: /^#+\s*(project|overview|about)/mi, name: 'Project overview' },
  { pattern: /^#+\s*(build|development|setup|install)/mi, name: 'Build/setup instructions' },
  { pattern: /^#+\s*(test|testing)/mi, name: 'Testing instructions' },
  { pattern: /^#+\s*(style|coding|conventions?|format)/mi, name: 'Code style/conventions' },
];

// Anti-patterns to flag
var ANTIPATTERNS = [
  { regex: /you are an? (helpful|expert|senior|skilled|experienced)/i, message: 'Persona instruction detected — AI agent files should contain project facts, not persona prompts', severity: 'warning' },
  { regex: /^(please|try to|you should|i want you to)\b/mi, message: 'Conversational phrasing detected — use direct instructions instead', severity: 'info' },
  { regex: /\b(gpt-?4|claude|sonnet|opus|gemini|copilot)\b/i, message: 'Model name reference — instructions should be model-agnostic', severity: 'info' },
  { regex: /```[\s\S]{2000,}?```/m, message: 'Large code block (>2KB) — consider referencing a file instead of inlining', severity: 'warning' },
  { regex: /\b(always|never)\b[\s\S]{0,30}\b(always|never)\b/i, message: 'Contradictory absolutes near each other — check for conflicting instructions', severity: 'warning' },
];

// Checks for .cursor/agents/*.md files
var AGENT_CHECKS = [
  { regex: /^#+\s*(role|identity|purpose|goal)/mi, name: 'Agent role definition' },
  { regex: /^#+\s*(tools?|capabilities|permissions?)/mi, name: 'Tool/capability scope' },
  { regex: /^#+\s*(constraints?|limits?|boundaries|don.?t)/mi, name: 'Constraints/boundaries' },
];

function lintClaudeMd(dir) {
  var issues = [];
  var filePath = path.join(dir, 'CLAUDE.md');

  if (!fs.existsSync(filePath)) {
    return { file: 'CLAUDE.md', exists: false, issues: [] };
  }

  var content = fs.readFileSync(filePath, 'utf-8');
  var lines = content.split('\n');
  var size = Buffer.byteLength(content, 'utf-8');

  // Size check
  if (size > MAX_CLAUDE_SIZE) {
    issues.push({
      severity: 'warning',
      message: 'CLAUDE.md is very large (' + Math.round(size / 1024) + 'KB) — may hit context limits',
      hint: 'Split into CLAUDE.md (core) + .cursor/rules/*.mdc (specific rules)',
    });
  }

  if (size === 0) {
    issues.push({
      severity: 'error',
      message: 'CLAUDE.md is empty',
      hint: 'Add project overview, build commands, testing instructions, and code style guidelines',
    });
    return { file: 'CLAUDE.md', exists: true, size: size, issues: issues };
  }

  // Check for heading structure
  var hasH1 = lines.some(function(l) { return /^# /.test(l); });
  var hasH2 = lines.some(function(l) { return /^## /.test(l); });

  if (!hasH1 && !hasH2) {
    issues.push({
      severity: 'warning',
      message: 'No markdown headings found — file may be hard for AI to parse',
      hint: 'Use ## sections to organize instructions',
    });
  }

  // Check for recommended sections
  var missingSections = [];
  for (var i = 0; i < CLAUDE_SECTIONS.length; i++) {
    if (!CLAUDE_SECTIONS[i].pattern.test(content)) {
      missingSections.push(CLAUDE_SECTIONS[i].name);
    }
  }

  if (missingSections.length > 2) {
    issues.push({
      severity: 'info',
      message: 'Missing common sections: ' + missingSections.join(', '),
      hint: 'Consider adding these to help Claude understand your project',
    });
  }

  // Anti-pattern checks
  for (var i = 0; i < ANTIPATTERNS.length; i++) {
    var ap = ANTIPATTERNS[i];
    if (ap.regex.test(content)) {
      // Find line number
      var lineNum = 0;
      for (var j = 0; j < lines.length; j++) {
        if (ap.regex.test(lines[j])) {
          lineNum = j + 1;
          break;
        }
      }
      issues.push({
        severity: ap.severity,
        message: ap.message,
        line: lineNum,
      });
    }
  }

  // Check for duplicate headings
  var headings = {};
  for (var i = 0; i < lines.length; i++) {
    var hMatch = lines[i].match(/^(#{1,4})\s+(.+)/);
    if (hMatch) {
      var heading = hMatch[2].toLowerCase().trim();
      if (headings[heading]) {
        issues.push({
          severity: 'warning',
          message: 'Duplicate heading "' + hMatch[2] + '" (also at line ' + headings[heading] + ')',
          line: i + 1,
          hint: 'Merge duplicate sections to avoid confusion',
        });
      } else {
        headings[heading] = i + 1;
      }
    }
  }

  // Check for very long lines (>500 chars) — hard for AI to parse
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].length > 500 && !lines[i].startsWith('```') && !lines[i].startsWith('|')) {
      issues.push({
        severity: 'info',
        message: 'Very long line (' + lines[i].length + ' chars) — may be hard to parse',
        line: i + 1,
        hint: 'Break into shorter paragraphs or bullet points',
      });
      break; // Only flag once
    }
  }

  // Check for empty sections (heading followed by heading)
  for (var i = 0; i < lines.length - 1; i++) {
    if (/^#{1,4}\s+/.test(lines[i])) {
      // Look ahead for next non-empty line
      var nextContent = -1;
      for (var j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() !== '') {
          nextContent = j;
          break;
        }
      }
      if (nextContent >= 0 && /^#{1,4}\s+/.test(lines[nextContent])) {
        issues.push({
          severity: 'warning',
          message: 'Empty section — heading with no content',
          line: i + 1,
          hint: 'Add content or remove the empty section',
        });
      }
    }
  }

  return { file: 'CLAUDE.md', exists: true, size: size, lineCount: lines.length, issues: issues };
}

function lintAgentsMd(dir) {
  var issues = [];
  var filePath = path.join(dir, 'AGENTS.md');

  if (!fs.existsSync(filePath)) {
    return { file: 'AGENTS.md', exists: false, issues: [] };
  }

  var content = fs.readFileSync(filePath, 'utf-8');
  var lines = content.split('\n');
  var size = Buffer.byteLength(content, 'utf-8');

  if (size > MAX_AGENTS_SIZE) {
    issues.push({
      severity: 'warning',
      message: 'AGENTS.md is very large (' + Math.round(size / 1024) + 'KB)',
      hint: 'Split agent-specific instructions into .cursor/agents/*.md files',
    });
  }

  if (size === 0) {
    issues.push({
      severity: 'error',
      message: 'AGENTS.md is empty',
      hint: 'Add project-wide agent instructions or remove the file',
    });
    return { file: 'AGENTS.md', exists: true, size: size, issues: issues };
  }

  // Same structural checks
  var hasH1 = lines.some(function(l) { return /^# /.test(l); });
  var hasH2 = lines.some(function(l) { return /^## /.test(l); });

  if (!hasH1 && !hasH2) {
    issues.push({
      severity: 'warning',
      message: 'No markdown headings found',
      hint: 'Use ## sections to organize agent instructions',
    });
  }

  // Anti-pattern checks
  for (var i = 0; i < ANTIPATTERNS.length; i++) {
    var ap = ANTIPATTERNS[i];
    if (ap.regex.test(content)) {
      var lineNum = 0;
      for (var j = 0; j < lines.length; j++) {
        if (ap.regex.test(lines[j])) {
          lineNum = j + 1;
          break;
        }
      }
      issues.push({
        severity: ap.severity,
        message: ap.message,
        line: lineNum,
      });
    }
  }

  // Duplicate headings
  var headings = {};
  for (var i = 0; i < lines.length; i++) {
    var hMatch = lines[i].match(/^(#{1,4})\s+(.+)/);
    if (hMatch) {
      var heading = hMatch[2].toLowerCase().trim();
      if (headings[heading]) {
        issues.push({
          severity: 'warning',
          message: 'Duplicate heading "' + hMatch[2] + '"',
          line: i + 1,
        });
      } else {
        headings[heading] = i + 1;
      }
    }
  }

  return { file: 'AGENTS.md', exists: true, size: size, lineCount: lines.length, issues: issues };
}

function lintAgentFiles(dir) {
  var results = [];
  var agentsDir = path.join(dir, '.cursor', 'agents');

  if (!fs.existsSync(agentsDir) || !fs.statSync(agentsDir).isDirectory()) {
    return results;
  }

  var files = fs.readdirSync(agentsDir).filter(function(f) { return f.endsWith('.md'); });

  for (var i = 0; i < files.length; i++) {
    var issues = [];
    var filePath = path.join(agentsDir, files[i]);
    var content = fs.readFileSync(filePath, 'utf-8');
    var lines = content.split('\n');
    var size = Buffer.byteLength(content, 'utf-8');

    if (size > MAX_AGENT_FILE_SIZE) {
      issues.push({
        severity: 'warning',
        message: 'Agent file is large (' + Math.round(size / 1024) + 'KB)',
        hint: 'Keep agent definitions focused — split into separate files if needed',
      });
    }

    if (size === 0) {
      issues.push({
        severity: 'error',
        message: 'Agent file is empty',
        hint: 'Add agent role, tools, and constraints, or remove the file',
      });
      results.push({ file: '.cursor/agents/' + files[i], exists: true, size: size, issues: issues });
      continue;
    }

    // Check for recommended agent sections
    var missingSections = [];
    for (var j = 0; j < AGENT_CHECKS.length; j++) {
      if (!AGENT_CHECKS[j].regex.test(content)) {
        missingSections.push(AGENT_CHECKS[j].name);
      }
    }

    if (missingSections.length === AGENT_CHECKS.length) {
      issues.push({
        severity: 'info',
        message: 'No standard agent sections found (role, tools, constraints)',
        hint: 'Well-structured agent files typically define role, capabilities, and boundaries',
      });
    }

    // Anti-pattern checks
    for (var j = 0; j < ANTIPATTERNS.length; j++) {
      var ap = ANTIPATTERNS[j];
      if (ap.regex.test(content)) {
        issues.push({ severity: ap.severity, message: ap.message });
      }
    }

    results.push({ file: '.cursor/agents/' + files[i], exists: true, size: size, lineCount: lines.length, issues: issues });
  }

  return results;
}

// Main entry: lint all agent config files
function lintAgentConfigs(dir) {
  var results = [];

  var claudeResult = lintClaudeMd(dir);
  results.push(claudeResult);

  var agentsResult = lintAgentsMd(dir);
  results.push(agentsResult);

  var agentFiles = lintAgentFiles(dir);
  results = results.concat(agentFiles);

  return results;
}

// Format results for CLI output
function formatAgentLint(results, colors) {
  var RED = colors ? '\x1b[31m' : '';
  var YELLOW = colors ? '\x1b[33m' : '';
  var GREEN = colors ? '\x1b[32m' : '';
  var CYAN = colors ? '\x1b[36m' : '';
  var BOLD = colors ? '\x1b[1m' : '';
  var DIM = colors ? '\x1b[2m' : '';
  var RESET = colors ? '\x1b[0m' : '';

  var lines = [];
  var totalErrors = 0;
  var totalWarnings = 0;
  var totalInfo = 0;
  var filesFound = 0;

  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    if (!r.exists) continue;
    filesFound++;

    var fileIssues = r.issues;
    var errorCount = fileIssues.filter(function(x) { return x.severity === 'error'; }).length;
    var warnCount = fileIssues.filter(function(x) { return x.severity === 'warning'; }).length;
    var infoCount = fileIssues.filter(function(x) { return x.severity === 'info'; }).length;
    totalErrors += errorCount;
    totalWarnings += warnCount;
    totalInfo += infoCount;

    var statusIcon = errorCount > 0 ? RED + '\u2717' : warnCount > 0 ? YELLOW + '\u26A0' : GREEN + '\u2713';
    var sizeStr = r.size ? DIM + ' (' + Math.round(r.size / 1024) + 'KB, ' + r.lineCount + ' lines)' + RESET : '';
    lines.push('  ' + statusIcon + RESET + ' ' + BOLD + r.file + RESET + sizeStr);

    for (var j = 0; j < fileIssues.length; j++) {
      var issue = fileIssues[j];
      var icon = issue.severity === 'error' ? RED + '\u2717' : issue.severity === 'warning' ? YELLOW + '\u26A0' : CYAN + '\u2139';
      var lineRef = issue.line ? DIM + ':' + issue.line + RESET : '';
      lines.push('    ' + icon + RESET + lineRef + ' ' + issue.message);
      if (issue.hint) {
        lines.push('      ' + DIM + issue.hint + RESET);
      }
    }

    if (fileIssues.length === 0) {
      lines.push('    ' + GREEN + 'No issues found' + RESET);
    }
    lines.push('');
  }

  if (filesFound === 0) {
    lines.push('  ' + DIM + 'No CLAUDE.md, AGENTS.md, or .cursor/agents/ files found.' + RESET);
    lines.push('  ' + DIM + 'These files help AI agents understand your project.' + RESET);
    lines.push('');
  }

  // Summary
  if (filesFound > 0) {
    var summary = [];
    if (totalErrors > 0) summary.push(RED + totalErrors + ' error(s)' + RESET);
    if (totalWarnings > 0) summary.push(YELLOW + totalWarnings + ' warning(s)' + RESET);
    if (totalInfo > 0) summary.push(CYAN + totalInfo + ' info' + RESET);
    if (summary.length === 0) summary.push(GREEN + 'All clean' + RESET);
    lines.push('  ' + BOLD + 'Summary: ' + RESET + summary.join(', ') + ' across ' + filesFound + ' file(s)');
  }

  return lines.join('\n');
}

module.exports = { lintAgentConfigs, formatAgentLint };
