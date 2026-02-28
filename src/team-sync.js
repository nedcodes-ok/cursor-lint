const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

var TEAM_CONFIG_FILE = '.cursor-doctor-team.json';

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

function getBody(content) {
  var normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  var match = normalized.match(/^---\n[\s\S]*?\n---\n?/);
  if (!match) return content;
  return content.slice(match[0].length);
}

function hashContent(content) {
  // Simple hash for drift detection (no crypto dependency needed for this)
  var hash = 0;
  for (var i = 0; i < content.length; i++) {
    var chr = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ─── Export ────────────────────────────────────────────────────────────────

function exportRules(dir, options) {
  options = options || {};
  var rulesDir = path.join(dir, '.cursor', 'rules');
  
  if (!fs.existsSync(rulesDir)) {
    return { error: 'No .cursor/rules/ directory found' };
  }
  
  var mdcFiles = fs.readdirSync(rulesDir).filter(function(f) { return f.endsWith('.mdc'); });
  
  if (mdcFiles.length === 0) {
    return { error: 'No .mdc rule files found' };
  }
  
  var rules = [];
  for (var i = 0; i < mdcFiles.length; i++) {
    var file = mdcFiles[i];
    var filePath = path.join(rulesDir, file);
    var content = fs.readFileSync(filePath, 'utf-8');
    var fm = parseFrontmatter(content);
    var body = getBody(content);
    
    rules.push({
      file: file,
      frontmatter: fm.data || {},
      body: body,
      hash: hashContent(content),
    });
  }
  
  // Also capture context files if they exist
  var contextFiles = {};
  var contextNames = ['CLAUDE.md', 'AGENTS.md', '.cursorrules'];
  for (var i = 0; i < contextNames.length; i++) {
    var cfPath = path.join(dir, contextNames[i]);
    if (fs.existsSync(cfPath)) {
      var content = fs.readFileSync(cfPath, 'utf-8');
      contextFiles[contextNames[i]] = {
        content: content,
        hash: hashContent(content),
      };
    }
  }
  
  var config = {
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedFrom: path.basename(dir),
    ruleCount: rules.length,
    rules: rules,
    contextFiles: contextFiles,
  };
  
  if (options.name) config.name = options.name;
  if (options.description) config.description = options.description;
  
  return { config: config };
}

// ─── Import ────────────────────────────────────────────────────────────────

function importRules(dir, config, options) {
  options = options || {};
  var dryRun = !!options.dryRun;
  var overwrite = !!options.overwrite;
  
  if (!config || !config.rules || !Array.isArray(config.rules)) {
    return { error: 'Invalid config: missing rules array' };
  }
  
  var rulesDir = path.join(dir, '.cursor', 'rules');
  if (!dryRun) {
    if (!fs.existsSync(rulesDir)) {
      fs.mkdirSync(rulesDir, { recursive: true });
    }
  }
  
  var results = { created: [], updated: [], skipped: [], errors: [] };
  
  for (var i = 0; i < config.rules.length; i++) {
    var rule = config.rules[i];
    // Path traversal guard: only allow simple filenames
    var safeFile = path.basename(rule.file);
    var filePath = path.resolve(rulesDir, safeFile);
    if (!filePath.startsWith(path.resolve(rulesDir))) {
      results.errors.push({ file: rule.file, error: 'Invalid filename' });
      continue;
    }
    var exists = fs.existsSync(filePath);
    
    if (exists && !overwrite) {
      results.skipped.push({ file: rule.file, reason: 'already exists (use --overwrite to replace)' });
      continue;
    }
    
    // Rebuild the .mdc file
    var content = '';
    if (rule.frontmatter && Object.keys(rule.frontmatter).length > 0) {
      var fmLines = [];
      for (var key in rule.frontmatter) {
        var val = rule.frontmatter[key];
        if (typeof val === 'boolean') fmLines.push(key + ': ' + val);
        else fmLines.push(key + ': ' + val);
      }
      content = '---\n' + fmLines.join('\n') + '\n---\n' + rule.body;
    } else {
      content = rule.body;
    }
    
    if (!dryRun) {
      fs.writeFileSync(filePath, content, 'utf-8');
    }
    
    if (exists) {
      results.updated.push({ file: rule.file });
    } else {
      results.created.push({ file: rule.file });
    }
  }
  
  // Import context files if requested
  if (config.contextFiles && options.includeContext) {
    for (var name in config.contextFiles) {
      // Path traversal guard: only allow known context files
      var safeName = path.basename(name);
      if (safeName !== name || name.includes('..')) {
        results.errors.push({ file: name, error: 'Invalid filename' });
        continue;
      }
      var cfPath = path.join(dir, safeName);
      var cfExists = fs.existsSync(cfPath);
      
      if (cfExists && !overwrite) {
        results.skipped.push({ file: name, reason: 'already exists' });
        continue;
      }
      
      if (!dryRun) {
        fs.writeFileSync(cfPath, config.contextFiles[name].content, 'utf-8');
      }
      
      if (cfExists) results.updated.push({ file: name });
      else results.created.push({ file: name });
    }
  }
  
  return results;
}

// ─── Drift Detection ───────────────────────────────────────────────────────

function setBaseline(dir, source) {
  var teamConfig = {
    baseline: source,
    setAt: new Date().toISOString(),
  };
  
  var configPath = path.join(dir, TEAM_CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(teamConfig, null, 2), 'utf-8');
  return { path: configPath };
}

function loadBaseline(dir) {
  var configPath = path.join(dir, TEAM_CONFIG_FILE);
  if (!fs.existsSync(configPath)) return null;
  
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function validateUrl(url) {
  try {
    var parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Only HTTP/HTTPS URLs allowed');
    }
    var host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0' ||
        host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith('.local') || host.endsWith('.internal')) {
      throw new Error('Private/internal URLs not allowed');
    }
  } catch (e) {
    if (e.message.includes('not allowed')) throw e;
    throw new Error('Invalid URL: ' + url);
  }
}

function fetchUrl(url) {
  validateUrl(url);
  return new Promise(function(resolve, reject) {
    var client = url.startsWith('https') ? https : http;
    var req = client.get(url, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode));
        return;
      }
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() { resolve(data); });
    }).on('error', reject);
    req.setTimeout(15000, function() { req.destroy(new Error('Request timeout')); });
  });
}

async function loadBaselineConfig(dir) {
  var teamConfig = loadBaseline(dir);
  if (!teamConfig || !teamConfig.baseline) return null;
  
  var source = teamConfig.baseline;
  
  // File path
  if (fs.existsSync(source)) {
    try {
      return JSON.parse(fs.readFileSync(source, 'utf-8'));
    } catch (e) {
      return null;
    }
  }
  
  // URL
  if (source.startsWith('http://') || source.startsWith('https://')) {
    try {
      var data = await fetchUrl(source);
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }
  
  return null;
}

async function detectDrift(dir) {
  var baseline = await loadBaselineConfig(dir);
  if (!baseline) {
    return { error: 'No baseline configured. Run: cursor-doctor team baseline <file-or-url>' };
  }
  
  // Load current rules
  var currentExport = exportRules(dir);
  if (currentExport.error) {
    return { error: currentExport.error };
  }
  var current = currentExport.config;
  
  var drifts = [];
  
  // Index baseline rules by filename
  var baselineByFile = {};
  for (var i = 0; i < baseline.rules.length; i++) {
    baselineByFile[baseline.rules[i].file] = baseline.rules[i];
  }
  
  // Index current rules by filename
  var currentByFile = {};
  for (var i = 0; i < current.rules.length; i++) {
    currentByFile[current.rules[i].file] = current.rules[i];
  }
  
  // Find modified rules
  for (var file in baselineByFile) {
    var baseRule = baselineByFile[file];
    var currRule = currentByFile[file];
    
    if (!currRule) {
      drifts.push({
        file: file,
        type: 'deleted',
        detail: 'Rule exists in baseline but was deleted locally',
      });
    } else if (baseRule.hash !== currRule.hash) {
      // Find what changed
      var changes = [];
      
      // Compare frontmatter
      var baseFm = baseRule.frontmatter || {};
      var currFm = currRule.frontmatter || {};
      for (var key in baseFm) {
        if (String(baseFm[key]) !== String(currFm[key])) {
          changes.push(key + ': ' + baseFm[key] + ' -> ' + (currFm[key] || '(removed)'));
        }
      }
      for (var key in currFm) {
        if (!(key in baseFm)) {
          changes.push(key + ': (added) ' + currFm[key]);
        }
      }
      
      // Compare body
      if (baseRule.body.trim() !== currRule.body.trim()) {
        var baseLines = baseRule.body.trim().split('\n').length;
        var currLines = currRule.body.trim().split('\n').length;
        var lineDelta = currLines - baseLines;
        changes.push('body: ' + (lineDelta > 0 ? '+' : '') + lineDelta + ' lines');
      }
      
      drifts.push({
        file: file,
        type: 'modified',
        detail: changes.join(', ') || 'content changed',
        changes: changes,
      });
    }
    // else: unchanged, no drift
  }
  
  // Find added rules (not in baseline)
  for (var file in currentByFile) {
    if (!baselineByFile[file]) {
      drifts.push({
        file: file,
        type: 'added',
        detail: 'Rule exists locally but not in baseline (personal override)',
      });
    }
  }
  
  // Context file drift
  if (baseline.contextFiles) {
    var contextNames = Object.keys(baseline.contextFiles);
    for (var i = 0; i < contextNames.length; i++) {
      var name = contextNames[i];
      var cfPath = path.join(dir, name);
      if (!fs.existsSync(cfPath)) {
        drifts.push({ file: name, type: 'deleted', detail: 'Context file in baseline but missing locally' });
      } else {
        var localContent = fs.readFileSync(cfPath, 'utf-8');
        var localHash = hashContent(localContent);
        if (localHash !== baseline.contextFiles[name].hash) {
          drifts.push({ file: name, type: 'modified', detail: 'Context file differs from baseline' });
        }
      }
    }
  }
  
  // Sort: deleted first, then modified, then added
  var typeOrder = { deleted: 0, modified: 1, added: 2 };
  drifts.sort(function(a, b) { return (typeOrder[a.type] || 3) - (typeOrder[b.type] || 3); });
  
  return {
    drifts: drifts,
    baselineSource: loadBaseline(dir).baseline,
    baselineDate: baseline.exportedAt || loadBaseline(dir).setAt,
    totalRulesBaseline: baseline.rules.length,
    totalRulesLocal: current.rules.length,
    driftCount: drifts.length,
    clean: drifts.length === 0,
  };
}

module.exports = { exportRules, importRules, detectDrift, setBaseline, loadBaseline, loadBaselineConfig, TEAM_CONFIG_FILE };
