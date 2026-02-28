/**
 * mcp-lint.js — MCP config validation
 * FREE: Syntax errors, missing fields, schema validation, hook conflicts
 */

const fs = require('fs');
const path = require('path');

// Known MCP config file patterns
var MCP_FILE_PATTERNS = [
  '.cursor/mcp.json',
  'mcp.json',
  '.mcp.json',
];

var VALID_SERVER_FIELDS = ['command', 'args', 'env', 'url', 'type', 'cwd', 'disabled'];
var VALID_TOP_LEVEL = ['mcpServers'];

// Known transport types
var VALID_TYPES = ['stdio', 'sse', 'streamable-http'];

function findMcpFiles(dir) {
  var found = [];

  for (var i = 0; i < MCP_FILE_PATTERNS.length; i++) {
    var filePath = path.join(dir, MCP_FILE_PATTERNS[i]);
    if (fs.existsSync(filePath)) {
      found.push({ pattern: MCP_FILE_PATTERNS[i], path: filePath });
    }
  }

  // Also check for *.mcp.json in project root
  try {
    var rootFiles = fs.readdirSync(dir);
    for (var i = 0; i < rootFiles.length; i++) {
      if (rootFiles[i].endsWith('.mcp.json') && rootFiles[i] !== '.mcp.json' && rootFiles[i] !== 'mcp.json') {
        var filePath = path.join(dir, rootFiles[i]);
        var alreadyFound = found.some(function(f) { return f.path === filePath; });
        if (!alreadyFound) {
          found.push({ pattern: rootFiles[i], path: filePath });
        }
      }
    }
  } catch (e) { /* ignore */ }

  return found;
}

function lintMcpFile(filePath, pattern) {
  var issues = [];
  var content;
  var parsed;

  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    issues.push({ severity: 'error', message: 'Cannot read file: ' + e.message });
    return { file: pattern, exists: true, issues: issues, servers: [] };
  }

  var size = Buffer.byteLength(content, 'utf-8');

  // Empty file
  if (content.trim() === '') {
    issues.push({
      severity: 'error',
      message: 'MCP config file is empty',
      hint: 'Add { "mcpServers": { } } or remove the file',
    });
    return { file: pattern, exists: true, size: size, issues: issues, servers: [] };
  }

  // JSON parse
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    // Try to give a helpful parse error
    var parseMsg = e.message;
    var posMatch = parseMsg.match(/position (\d+)/);
    if (posMatch) {
      var pos = parseInt(posMatch[1]);
      var before = content.substring(Math.max(0, pos - 20), pos);
      var after = content.substring(pos, pos + 20);
      issues.push({
        severity: 'error',
        message: 'JSON syntax error: ' + parseMsg,
        hint: 'Near: ...' + before + ' >>> HERE >>> ' + after + '...',
      });
    } else {
      issues.push({
        severity: 'error',
        message: 'JSON syntax error: ' + parseMsg,
        hint: 'Validate JSON at jsonlint.com',
      });
    }
    return { file: pattern, exists: true, size: size, issues: issues, servers: [] };
  }

  // Must be an object
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    issues.push({
      severity: 'error',
      message: 'MCP config must be a JSON object, got ' + (Array.isArray(parsed) ? 'array' : typeof parsed),
      hint: 'Expected: { "mcpServers": { ... } }',
    });
    return { file: pattern, exists: true, size: size, issues: issues, servers: [] };
  }

  // Check top-level keys
  var topKeys = Object.keys(parsed);
  for (var i = 0; i < topKeys.length; i++) {
    if (VALID_TOP_LEVEL.indexOf(topKeys[i]) === -1) {
      issues.push({
        severity: 'warning',
        message: 'Unknown top-level key "' + topKeys[i] + '"',
        hint: 'Expected: "mcpServers". Did you mean to nest this under mcpServers?',
      });
    }
  }

  // Must have mcpServers
  if (!parsed.mcpServers) {
    issues.push({
      severity: 'error',
      message: 'Missing "mcpServers" key',
      hint: 'MCP config should have: { "mcpServers": { "server-name": { "command": "..." } } }',
    });
    return { file: pattern, exists: true, size: size, issues: issues, servers: [] };
  }

  if (typeof parsed.mcpServers !== 'object' || Array.isArray(parsed.mcpServers)) {
    issues.push({
      severity: 'error',
      message: '"mcpServers" must be an object, got ' + (Array.isArray(parsed.mcpServers) ? 'array' : typeof parsed.mcpServers),
    });
    return { file: pattern, exists: true, size: size, issues: issues, servers: [] };
  }

  var serverNames = Object.keys(parsed.mcpServers);
  var servers = [];

  if (serverNames.length === 0) {
    issues.push({
      severity: 'info',
      message: 'No MCP servers configured',
      hint: 'Add server entries to "mcpServers" or remove the file',
    });
    return { file: pattern, exists: true, size: size, issues: issues, servers: servers };
  }

  // Validate each server
  for (var i = 0; i < serverNames.length; i++) {
    var name = serverNames[i];
    var server = parsed.mcpServers[name];
    servers.push(name);

    if (typeof server !== 'object' || Array.isArray(server) || server === null) {
      issues.push({
        severity: 'error',
        message: 'Server "' + name + '": must be an object',
      });
      continue;
    }

    var serverKeys = Object.keys(server);

    // Check for unknown fields
    for (var j = 0; j < serverKeys.length; j++) {
      if (VALID_SERVER_FIELDS.indexOf(serverKeys[j]) === -1) {
        issues.push({
          severity: 'warning',
          message: 'Server "' + name + '": unknown field "' + serverKeys[j] + '"',
          hint: 'Valid fields: ' + VALID_SERVER_FIELDS.join(', '),
        });
      }
    }

    // Must have command or url
    var hasCommand = server.command !== undefined;
    var hasUrl = server.url !== undefined;

    if (!hasCommand && !hasUrl) {
      issues.push({
        severity: 'error',
        message: 'Server "' + name + '": missing "command" or "url"',
        hint: 'stdio servers need "command", SSE/HTTP servers need "url"',
      });
    }

    // Validate command
    if (hasCommand) {
      if (typeof server.command !== 'string') {
        issues.push({
          severity: 'error',
          message: 'Server "' + name + '": "command" must be a string',
        });
      } else if (server.command.trim() === '') {
        issues.push({
          severity: 'error',
          message: 'Server "' + name + '": "command" is empty',
        });
      } else {
        // Warn about potentially dangerous command patterns
        var cmd = server.command.toLowerCase();
        if (/\brm\s+-rf\b/.test(cmd) || /\bformat\s+[a-z]:/.test(cmd) ||
            /\bcurl\b.*\|\s*(ba)?sh\b/.test(cmd) || /\bwget\b.*\|\s*(ba)?sh\b/.test(cmd) ||
            /\beval\s*\(/.test(cmd) || />\s*\/dev\//.test(cmd)) {
          issues.push({
            severity: 'warning',
            message: 'Server "' + name + '": command contains a potentially dangerous pattern',
            hint: 'Verify this command is safe: ' + server.command,
          });
        }
      }
    }

    // Validate url
    if (hasUrl) {
      if (typeof server.url !== 'string') {
        issues.push({
          severity: 'error',
          message: 'Server "' + name + '": "url" must be a string',
        });
      } else if (!server.url.match(/^https?:\/\//)) {
        issues.push({
          severity: 'warning',
          message: 'Server "' + name + '": URL doesn\'t start with http:// or https://',
          hint: 'SSE/HTTP endpoints typically need a full URL',
        });
      }
    }

    // Validate args
    if (server.args !== undefined) {
      if (!Array.isArray(server.args)) {
        issues.push({
          severity: 'error',
          message: 'Server "' + name + '": "args" must be an array',
          hint: 'Use: "args": ["--flag", "value"]',
        });
      } else {
        for (var j = 0; j < server.args.length; j++) {
          if (typeof server.args[j] !== 'string') {
            issues.push({
              severity: 'warning',
              message: 'Server "' + name + '": args[' + j + '] is not a string',
            });
          }
        }
      }
    }

    // Validate env
    if (server.env !== undefined) {
      if (typeof server.env !== 'object' || Array.isArray(server.env) || server.env === null) {
        issues.push({
          severity: 'error',
          message: 'Server "' + name + '": "env" must be an object',
          hint: 'Use: "env": { "KEY": "value" }',
        });
      } else {
        var envKeys = Object.keys(server.env);
        for (var j = 0; j < envKeys.length; j++) {
          var envVal = server.env[envKeys[j]];
          if (typeof envVal !== 'string') {
            issues.push({
              severity: 'warning',
              message: 'Server "' + name + '": env.' + envKeys[j] + ' is not a string',
            });
          }
          // Check for placeholder values
          if (typeof envVal === 'string' && (envVal === '' || envVal.match(/^(YOUR_|REPLACE_|TODO|xxx|placeholder)/i))) {
            issues.push({
              severity: 'warning',
              message: 'Server "' + name + '": env.' + envKeys[j] + ' looks like a placeholder',
              hint: 'Set actual value or use environment variable interpolation',
            });
          }
          // Check for leaked secrets in config
          if (typeof envVal === 'string' && envVal.length > 20 && envVal.match(/^(sk-|ghp_|ghu_|glpat-|xox[bpsr]-|AKIA)/)) {
            issues.push({
              severity: 'error',
              message: 'Server "' + name + '": env.' + envKeys[j] + ' appears to contain a hardcoded secret',
              hint: 'Use environment variables instead of hardcoding API keys in config files',
            });
          }
        }
      }
    }

    // Validate type
    if (server.type !== undefined) {
      if (typeof server.type !== 'string') {
        issues.push({
          severity: 'error',
          message: 'Server "' + name + '": "type" must be a string',
        });
      } else if (VALID_TYPES.indexOf(server.type) === -1) {
        issues.push({
          severity: 'warning',
          message: 'Server "' + name + '": unknown type "' + server.type + '"',
          hint: 'Known types: ' + VALID_TYPES.join(', '),
        });
      }

      // Type/field consistency
      if (server.type === 'sse' || server.type === 'streamable-http') {
        if (!hasUrl) {
          issues.push({
            severity: 'error',
            message: 'Server "' + name + '": type "' + server.type + '" requires "url"',
          });
        }
      }
    }

    // Validate disabled
    if (server.disabled !== undefined && typeof server.disabled !== 'boolean') {
      issues.push({
        severity: 'warning',
        message: 'Server "' + name + '": "disabled" should be boolean (true/false)',
      });
    }

    // Check for common naming issues
    if (name.match(/\s/)) {
      issues.push({
        severity: 'warning',
        message: 'Server name "' + name + '" contains spaces',
        hint: 'Use kebab-case or camelCase for server names',
      });
    }
  }

  // Check for duplicate commands (same binary, different names)
  var commandMap = {};
  for (var i = 0; i < serverNames.length; i++) {
    var server = parsed.mcpServers[serverNames[i]];
    if (server && typeof server.command === 'string') {
      var cmd = server.command;
      // Skip common launchers like npx/node/python — different args = different servers
      var commonLaunchers = ['npx', 'node', 'python', 'python3', 'uvx', 'bunx', 'deno'];
      if (commandMap[cmd] && commonLaunchers.indexOf(cmd) === -1) {
        issues.push({
          severity: 'info',
          message: 'Servers "' + commandMap[cmd] + '" and "' + serverNames[i] + '" use the same command: ' + cmd,
          hint: 'This may be intentional (different args) or a duplicate',
        });
      } else {
        commandMap[cmd] = serverNames[i];
      }
    }
  }

  return {
    file: pattern,
    exists: true,
    size: size,
    issues: issues,
    servers: servers,
    serverCount: serverNames.length,
  };
}

// Check for conflicts between MCP servers and Cursor hooks
function checkHookConflicts(dir, mcpResults) {
  var conflicts = [];
  var hooksPath = path.join(dir, '.cursor', 'hooks.json');

  if (!fs.existsSync(hooksPath)) return conflicts;

  var hooksContent;
  try {
    hooksContent = JSON.parse(fs.readFileSync(hooksPath, 'utf-8'));
  } catch (e) {
    return conflicts;
  }

  // Extract hook commands
  var hookCommands = [];
  if (hooksContent && typeof hooksContent === 'object') {
    var hookTypes = ['onSave', 'onOpen', 'onClose', 'onBuild', 'onTest'];
    for (var i = 0; i < hookTypes.length; i++) {
      var hooks = hooksContent[hookTypes[i]];
      if (Array.isArray(hooks)) {
        for (var j = 0; j < hooks.length; j++) {
          if (hooks[j] && hooks[j].command) {
            hookCommands.push({ type: hookTypes[i], command: hooks[j].command });
          }
        }
      }
    }
  }

  // Check if any MCP server command overlaps with hooks
  for (var i = 0; i < mcpResults.length; i++) {
    var mcpFile = mcpResults[i];
    if (!mcpFile.exists || !mcpFile.servers) continue;

    // We'd need parsed data — for now check if hooks reference MCP-related tools
    for (var j = 0; j < hookCommands.length; j++) {
      var hookCmd = hookCommands[j].command;
      if (hookCmd.match(/mcp|model.context.protocol/i)) {
        conflicts.push({
          severity: 'info',
          message: 'Hook "' + hookCommands[j].type + '" references MCP — ensure no circular invocations with MCP servers',
        });
      }
    }
  }

  return conflicts;
}

// Check for multiple MCP config files (potential confusion)
function checkMultipleConfigs(mcpResults) {
  var existing = mcpResults.filter(function(r) { return r.exists; });
  var issues = [];

  if (existing.length > 1) {
    var fileNames = existing.map(function(r) { return r.file; }).join(', ');
    issues.push({
      severity: 'warning',
      message: 'Multiple MCP config files found: ' + fileNames,
      hint: 'Cursor uses .cursor/mcp.json — other files may be for different tools',
    });
  }

  return issues;
}

function lintMcpConfigs(dir) {
  var mcpFiles = findMcpFiles(dir);
  var results = [];

  for (var i = 0; i < mcpFiles.length; i++) {
    results.push(lintMcpFile(mcpFiles[i].path, mcpFiles[i].pattern));
  }

  // Check for multi-file issues
  var multiIssues = checkMultipleConfigs(results);
  var hookConflicts = checkHookConflicts(dir, results);

  return {
    files: results,
    multiIssues: multiIssues,
    hookConflicts: hookConflicts,
    totalFiles: mcpFiles.length,
  };
}

// Format for CLI output
function formatMcpLint(report, colors) {
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

  if (report.totalFiles === 0) {
    lines.push('  ' + DIM + 'No MCP config files found (.cursor/mcp.json, mcp.json, *.mcp.json).' + RESET);
    lines.push('');
    return lines.join('\n');
  }

  for (var i = 0; i < report.files.length; i++) {
    var f = report.files[i];
    if (!f.exists) continue;

    var errorCount = f.issues.filter(function(x) { return x.severity === 'error'; }).length;
    var warnCount = f.issues.filter(function(x) { return x.severity === 'warning'; }).length;
    totalErrors += errorCount;
    totalWarnings += warnCount;

    var statusIcon = errorCount > 0 ? RED + '\u2717' : warnCount > 0 ? YELLOW + '\u26A0' : GREEN + '\u2713';
    var sizeStr = f.size ? DIM + ' (' + Math.round(f.size / 1024) + 'KB)' + RESET : '';
    var serverStr = f.serverCount ? DIM + ' — ' + f.serverCount + ' server(s)' + RESET : '';
    lines.push('  ' + statusIcon + RESET + ' ' + BOLD + f.file + RESET + sizeStr + serverStr);

    for (var j = 0; j < f.issues.length; j++) {
      var issue = f.issues[j];
      var icon = issue.severity === 'error' ? RED + '\u2717' : issue.severity === 'warning' ? YELLOW + '\u26A0' : CYAN + '\u2139';
      lines.push('    ' + icon + RESET + ' ' + issue.message);
      if (issue.hint) {
        lines.push('      ' + DIM + issue.hint + RESET);
      }
    }

    if (f.issues.length === 0) {
      lines.push('    ' + GREEN + 'Valid configuration' + RESET);
      if (f.servers && f.servers.length > 0) {
        lines.push('    ' + DIM + 'Servers: ' + f.servers.join(', ') + RESET);
      }
    }
    lines.push('');
  }

  // Multi-file warnings
  for (var i = 0; i < report.multiIssues.length; i++) {
    var issue = report.multiIssues[i];
    var icon = issue.severity === 'warning' ? YELLOW + '\u26A0' : CYAN + '\u2139';
    lines.push('  ' + icon + RESET + ' ' + issue.message);
    if (issue.hint) lines.push('    ' + DIM + issue.hint + RESET);
  }

  // Hook conflicts
  for (var i = 0; i < report.hookConflicts.length; i++) {
    var issue = report.hookConflicts[i];
    lines.push('  ' + CYAN + '\u2139' + RESET + ' ' + issue.message);
  }

  // Summary
  var totalFiles = report.files.filter(function(f) { return f.exists; }).length;
  var totalServers = 0;
  for (var i = 0; i < report.files.length; i++) {
    if (report.files[i].serverCount) totalServers += report.files[i].serverCount;
  }

  var summary = [];
  if (totalErrors > 0) summary.push(RED + totalErrors + ' error(s)' + RESET);
  if (totalWarnings > 0) summary.push(YELLOW + totalWarnings + ' warning(s)' + RESET);
  if (summary.length === 0) summary.push(GREEN + 'All valid' + RESET);
  lines.push('  ' + BOLD + 'Summary: ' + RESET + summary.join(', ') + ' — ' + totalServers + ' server(s) in ' + totalFiles + ' file(s)');

  return lines.join('\n');
}

module.exports = { lintMcpConfigs, formatMcpLint, findMcpFiles };
