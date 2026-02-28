const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

var ACTIVITY_FILE = 'rule-activity.json';
var HISTORY_DIR = '.doctor-history';

function parseFrontmatter(content) {
  var normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  var match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { found: false, data: null };
  var data = {};
  var lines = match[1].split('\n');
  var currentKey = null;
  var currentList = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.match(/^\s+-\s+/)) {
      if (currentKey && currentList) {
        var itemVal = line.replace(/^\s+-\s+/, '').trim();
        if (itemVal.startsWith('"') && itemVal.endsWith('"')) itemVal = itemVal.slice(1, -1);
        else if (itemVal.startsWith("'") && itemVal.endsWith("'")) itemVal = itemVal.slice(1, -1);
        currentList.push(itemVal);
      }
      continue;
    }
    if (currentKey && currentList) { data[currentKey] = currentList; currentKey = null; currentList = null; }
    var colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    var key = line.slice(0, colonIdx).trim();
    var rawVal = line.slice(colonIdx + 1).trim();
    if (rawVal === '') { currentKey = key; currentList = []; }
    else if (rawVal === 'true') data[key] = true;
    else if (rawVal === 'false') data[key] = false;
    else if (rawVal.startsWith('"') && rawVal.endsWith('"')) data[key] = rawVal.slice(1, -1);
    else data[key] = rawVal;
  }
  if (currentKey && currentList) { data[currentKey] = currentList; }
  return { found: true, data: data };
}

function parseGlobs(globVal) {
  if (!globVal) return [];
  if (typeof globVal === 'string') {
    var trimmed = globVal.trim();
    if (trimmed.startsWith('[')) {
      return trimmed.slice(1, -1).split(',').map(function(g) { return g.trim().replace(/^["']|["']$/g, ''); }).filter(Boolean);
    }
    return trimmed.split(',').map(function(g) { return g.trim().replace(/^["']|["']$/g, ''); }).filter(Boolean);
  }
  if (Array.isArray(globVal)) return globVal;
  return [];
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// Load all rules with metadata
function loadRules(dir) {
  var rules = [];
  var rulesDir = path.join(dir, '.cursor', 'rules');
  if (!fs.existsSync(rulesDir)) return rules;
  
  var entries = fs.readdirSync(rulesDir).filter(function(f) { return f.endsWith('.mdc'); });
  for (var i = 0; i < entries.length; i++) {
    var file = entries[i];
    var content = fs.readFileSync(path.join(rulesDir, file), 'utf-8');
    var fm = parseFrontmatter(content);
    var globs = fm.data ? parseGlobs(fm.data.globs) : [];
    var alwaysApply = fm.data && fm.data.alwaysApply === true;
    
    rules.push({
      file: file,
      tokens: estimateTokens(content),
      globs: globs,
      alwaysApply: alwaysApply,
      description: fm.data && fm.data.description ? fm.data.description : '',
    });
  }
  return rules;
}

// Get recently modified files from git
function getGitActivity(dir, days) {
  days = days || 30;
  try {
    var since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    var output = execSync(
      'git log --since="' + since + '" --name-only --pretty=format: --diff-filter=AMRC',
      { cwd: dir, encoding: 'utf-8', timeout: 10000, maxBuffer: 10 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    
    // Count frequency per file
    var files = {};
    var lines = output.split('\n').filter(function(l) { return l.trim().length > 0; });
    for (var i = 0; i < lines.length; i++) {
      var file = lines[i].trim();
      if (!files[file]) files[file] = 0;
      files[file]++;
    }
    return files;
  } catch (e) {
    return null; // Not a git repo or git not available
  }
}

// Get files from filesystem (fallback when no git)
function getFilesystemActivity(dir) {
  var files = {};
  var ignoreDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cursor', '__pycache__', '.venv', 'venv', '.turbo', 'coverage']);
  
  function walk(d, depth) {
    if (depth > 4) return;
    try {
      var entries = fs.readdirSync(d);
      for (var i = 0; i < entries.length; i++) {
        if (ignoreDirs.has(entries[i])) continue;
        var full = path.join(d, entries[i]);
        try {
          var stat = fs.statSync(full);
          if (stat.isDirectory()) {
            walk(full, depth + 1);
          } else {
            var rel = path.relative(dir, full);
            files[rel] = 1;
          }
        } catch (e) {}
      }
    } catch (e) {}
  }
  walk(dir, 0);
  return files;
}

// Simple glob matching (supports *.ext, **/*.ext, dir/*.ext)
function globMatch(pattern, filePath) {
  // Normalize
  pattern = pattern.replace(/\\/g, '/');
  filePath = filePath.replace(/\\/g, '/');
  
  // Brace expansion FIRST: *.{ts,tsx} or **/*.{ts,tsx}
  var braceMatch = pattern.match(/\*\.\{([^}]+)\}/);
  if (braceMatch) {
    var exts = braceMatch[1].split(',').map(function(e) { return e.trim(); });
    for (var i = 0; i < exts.length; i++) {
      if (filePath.endsWith('.' + exts[i])) return true;
    }
    return false;
  }
  
  // *.ext — matches any file with that extension
  if (pattern.startsWith('*.')) {
    var ext = pattern.slice(1); // .ext
    return filePath.endsWith(ext);
  }
  
  // **/*.ext — matches any file at any depth with that extension
  if (pattern.startsWith('**/')) {
    var rest = pattern.slice(3);
    if (rest.startsWith('*.')) {
      var ext = rest.slice(1);
      return filePath.endsWith(ext);
    }
    return filePath.includes(rest) || filePath.endsWith(rest);
  }
  
  // dir/*.ext — matches files in specific directory
  if (pattern.includes('/') && pattern.includes('*')) {
    var parts = pattern.split('*');
    if (parts.length === 2) {
      return filePath.startsWith(parts[0]) && filePath.endsWith(parts[1]);
    }
  }
  
  // Exact match
  return filePath === pattern || filePath.endsWith('/' + pattern);
}

// Match files against rule globs
function matchRuleToFiles(rule, files) {
  if (rule.alwaysApply) {
    // alwaysApply rules fire on every file interaction
    return { matched: true, matchedFiles: Object.keys(files), matchCount: Object.keys(files).length };
  }
  
  if (rule.globs.length === 0) {
    // No globs, no alwaysApply — manual activation only
    return { matched: false, matchedFiles: [], matchCount: 0, manual: true };
  }
  
  var matchedFiles = [];
  var fileNames = Object.keys(files);
  
  for (var i = 0; i < fileNames.length; i++) {
    for (var j = 0; j < rule.globs.length; j++) {
      if (globMatch(rule.globs[j], fileNames[i])) {
        matchedFiles.push(fileNames[i]);
        break;
      }
    }
  }
  
  return { matched: matchedFiles.length > 0, matchedFiles: matchedFiles, matchCount: matchedFiles.length };
}

// Load VS Code extension activity data (if available)
function loadExtensionActivity(dir) {
  var activityPath = path.join(dir, '.cursor', HISTORY_DIR, ACTIVITY_FILE);
  if (!fs.existsSync(activityPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(activityPath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

// Record a rule activation event (called by VS Code extension)
function recordActivation(dir, ruleFile, triggerFile) {
  var histDir = path.join(dir, '.cursor', HISTORY_DIR);
  if (!fs.existsSync(histDir)) {
    fs.mkdirSync(histDir, { recursive: true });
  }
  
  var activityPath = path.join(histDir, ACTIVITY_FILE);
  var activity = {};
  if (fs.existsSync(activityPath)) {
    try { activity = JSON.parse(fs.readFileSync(activityPath, 'utf-8')); } catch (e) { activity = {}; }
  }
  
  if (!activity[ruleFile]) {
    activity[ruleFile] = { activations: 0, lastActivated: null, files: {} };
  }
  
  activity[ruleFile].activations++;
  activity[ruleFile].lastActivated = new Date().toISOString();
  
  if (triggerFile) {
    if (!activity[ruleFile].files[triggerFile]) {
      activity[ruleFile].files[triggerFile] = 0;
    }
    activity[ruleFile].files[triggerFile]++;
  }
  
  fs.writeFileSync(activityPath, JSON.stringify(activity, null, 2), 'utf-8');
}

// ─── Main Analysis ─────────────────────────────────────────────────────────

function analyzePerformance(dir, options) {
  options = options || {};
  var days = options.days || 30;
  
  var rules = loadRules(dir);
  if (rules.length === 0) {
    return { error: 'No rules found in .cursor/rules/' };
  }
  
  // Get file activity
  var gitActivity = getGitActivity(dir, days);
  var usingGit = !!gitActivity;
  var files = gitActivity || getFilesystemActivity(dir);
  var totalFiles = Object.keys(files).length;
  
  // Get VS Code extension activity (if available)
  var extensionActivity = loadExtensionActivity(dir);
  var hasExtensionData = !!extensionActivity;
  
  // Analyze each rule
  var ruleStats = [];
  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    var match = matchRuleToFiles(rule, files);
    
    // Calculate activation frequency from git
    var totalActivations = 0;
    if (usingGit && match.matchedFiles.length > 0) {
      for (var j = 0; j < match.matchedFiles.length; j++) {
        totalActivations += (gitActivity[match.matchedFiles[j]] || 0);
      }
    } else {
      totalActivations = match.matchCount;
    }
    
    // Merge with extension data if available
    var extensionActivations = 0;
    var lastActivated = null;
    if (extensionActivity && extensionActivity[rule.file]) {
      extensionActivations = extensionActivity[rule.file].activations;
      lastActivated = extensionActivity[rule.file].lastActivated;
    }
    
    // Calculate status
    var status;
    if (match.manual) {
      status = 'manual';
    } else if (rule.alwaysApply) {
      status = 'always';
    } else if (totalActivations === 0 && extensionActivations === 0) {
      status = 'dead';
    } else if (totalActivations <= 2 && extensionActivations <= 2) {
      status = 'low';
    } else {
      status = 'active';
    }
    
    ruleStats.push({
      file: rule.file,
      description: rule.description,
      tokens: rule.tokens,
      globs: rule.globs,
      alwaysApply: rule.alwaysApply,
      status: status,
      gitActivations: totalActivations,
      extensionActivations: extensionActivations,
      totalActivations: totalActivations + extensionActivations,
      matchedFileCount: match.matchCount,
      lastActivated: lastActivated,
      wastedTokensPerDay: status === 'dead' ? rule.tokens : 0,
    });
  }
  
  // Sort: dead rules first (most wasteful), then by activation count
  ruleStats.sort(function(a, b) {
    if (a.status === 'dead' && b.status !== 'dead') return -1;
    if (b.status === 'dead' && a.status !== 'dead') return 1;
    return b.totalActivations - a.totalActivations;
  });
  
  // Summary stats
  var dead = ruleStats.filter(function(r) { return r.status === 'dead'; });
  var active = ruleStats.filter(function(r) { return r.status === 'active'; });
  var low = ruleStats.filter(function(r) { return r.status === 'low'; });
  var always = ruleStats.filter(function(r) { return r.status === 'always'; });
  var manual = ruleStats.filter(function(r) { return r.status === 'manual'; });
  
  var wastedTokens = dead.reduce(function(sum, r) { return sum + r.tokens; }, 0);
  
  return {
    rules: ruleStats,
    summary: {
      total: rules.length,
      active: active.length,
      always: always.length,
      low: low.length,
      dead: dead.length,
      manual: manual.length,
      wastedTokens: wastedTokens,
    },
    period: days + ' days',
    dataSource: usingGit ? 'git' : 'filesystem',
    hasExtensionData: hasExtensionData,
    totalFilesAnalyzed: totalFiles,
  };
}

module.exports = { analyzePerformance, recordActivation, loadExtensionActivity, globMatch, ACTIVITY_FILE, HISTORY_DIR };
