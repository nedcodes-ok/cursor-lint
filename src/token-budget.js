const fs = require('fs');
const path = require('path');
const { showStats } = require('./stats');

// Cursor's approximate context window size in tokens
const CONTEXT_WINDOW_TOKENS = 120000;

function estimateTokens(text) {
  // ~4 chars per token for English, +10% for frontmatter/metadata overhead
  return Math.ceil(text.length / 4 * 1.1);
}

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
    const trimmed = globVal.trim();
    if (trimmed.startsWith('[')) {
      return trimmed.slice(1, -1).split(',').map(function(g) { return g.trim().replace(/^["']|["']$/g, ''); }).filter(Boolean);
    }
    return trimmed.split(',').map(function(g) { return g.trim().replace(/^["']|["']$/g, ''); }).filter(Boolean);
  }
  if (Array.isArray(globVal)) return globVal;
  return [];
}

function getBody(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!match) return content;
  return content.slice(match[0].length);
}

// Map glob patterns to human-readable file type categories
function classifyGlobs(globs) {
  var categories = new Set();
  for (var i = 0; i < globs.length; i++) {
    var g = globs[i].toLowerCase();
    if (/\.(ts|tsx)/.test(g)) categories.add('TypeScript');
    else if (/\.(js|jsx|mjs|cjs)/.test(g)) categories.add('JavaScript');
    else if (/\.py/.test(g)) categories.add('Python');
    else if (/\.rb/.test(g)) categories.add('Ruby');
    else if (/\.go/.test(g)) categories.add('Go');
    else if (/\.rs/.test(g)) categories.add('Rust');
    else if (/\.java/.test(g)) categories.add('Java');
    else if (/\.kt/.test(g)) categories.add('Kotlin');
    else if (/\.swift/.test(g)) categories.add('Swift');
    else if (/\.php/.test(g)) categories.add('PHP');
    else if (/\.(vue|svelte)/.test(g)) categories.add('Frontend');
    else if (/\.(css|scss|sass|less)/.test(g)) categories.add('Styles');
    else if (/\.(json|yaml|yml|toml)/.test(g)) categories.add('Config');
    else if (/\.(md|mdx|txt|rst)/.test(g)) categories.add('Docs');
    else if (/\.(test|spec|_test|_spec)/.test(g)) categories.add('Tests');
    else if (/\.(sql|prisma|drizzle)/.test(g)) categories.add('Database');
    else if (/docker|compose/.test(g)) categories.add('Docker');
    else categories.add('Other');
  }
  return Array.from(categories);
}

// Infer file type from rule filename when no globs
function classifyByFilename(filename) {
  var name = filename.replace('.mdc', '').toLowerCase();
  var map = {
    'typescript': 'TypeScript', 'ts': 'TypeScript', 'tsx': 'TypeScript',
    'javascript': 'JavaScript', 'js': 'JavaScript', 'jsx': 'JavaScript', 'node': 'JavaScript',
    'react': 'React', 'nextjs': 'React', 'next': 'React',
    'vue': 'Frontend', 'svelte': 'Frontend', 'angular': 'Frontend',
    'python': 'Python', 'django': 'Python', 'fastapi': 'Python', 'flask': 'Python',
    'ruby': 'Ruby', 'rails': 'Ruby',
    'go': 'Go', 'golang': 'Go',
    'rust': 'Rust', 'cargo': 'Rust',
    'java': 'Java', 'spring': 'Java',
    'kotlin': 'Kotlin',
    'swift': 'Swift',
    'php': 'PHP', 'laravel': 'PHP',
    'css': 'Styles', 'tailwind': 'Styles', 'styling': 'Styles',
    'test': 'Tests', 'testing': 'Tests', 'jest': 'Tests', 'vitest': 'Tests',
    'sql': 'Database', 'prisma': 'Database', 'drizzle': 'Database', 'database': 'Database',
    'docker': 'Docker', 'ci': 'CI/CD', 'github': 'CI/CD',
    'api': 'API', 'rest': 'API', 'graphql': 'API',
    'security': 'Security', 'auth': 'Security',
    'error': 'Error Handling', 'logging': 'Error Handling',
  };
  
  for (var key in map) {
    if (name.includes(key)) return map[key];
  }
  return 'General';
}

// Detect waste: alwaysApply rules that target specific file types
function detectWaste(rules) {
  var waste = [];
  
  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    if (!rule.alwaysApply) continue;
    if (rule.globs.length > 0) continue; // already has globs, user is aware
    
    var body = rule.body.toLowerCase();
    
    // Check if the rule body is clearly about specific file types
    var fileTypeSignals = [
      { pattern: /\b(\.py|python|django|flask|fastapi|pip|pytest)\b/g, type: 'Python', glob: '*.py' },
      { pattern: /\b(\.ts|\.tsx|typescript|interface\s|type\s\w+\s*=|generic|angular)\b/g, type: 'TypeScript', glob: '["*.ts", "*.tsx"]' },
      { pattern: /\b(\.js|\.jsx|javascript|require\(|module\.exports)\b/g, type: 'JavaScript', glob: '["*.js", "*.jsx"]' },
      { pattern: /\b(\.rb|ruby|rails|gemfile|bundle)\b/g, type: 'Ruby', glob: '*.rb' },
      { pattern: /\b(\.go|golang|goroutine|chan\s|go\s+func)\b/g, type: 'Go', glob: '*.go' },
      { pattern: /\b(\.rs|rust|cargo|unsafe\s*\{|impl\s|fn\s\w+|let\s+mut)\b/g, type: 'Rust', glob: '*.rs' },
      { pattern: /\b(\.java|java\b|spring|@autowired|@component)\b/g, type: 'Java', glob: '*.java' },
      { pattern: /\b(\.css|\.scss|tailwind|styled-components|emotion)\b/g, type: 'Styles', glob: '["*.css", "*.scss"]' },
      { pattern: /\b(\.sql|prisma|drizzle|sequelize|typeorm|knex)\b/g, type: 'Database', glob: '["*.sql", "*.prisma"]' },
      { pattern: /\b(react|jsx|usestate|useeffect|component|props)\b/g, type: 'React', glob: '["*.tsx", "*.jsx"]' },
      { pattern: /\b(vue|\.vue|v-bind|v-model|composition\s*api)\b/g, type: 'Vue', glob: '*.vue' },
      { pattern: /\b(svelte|\.svelte|\$:|on:click)\b/g, type: 'Svelte', glob: '*.svelte' },
      { pattern: /\b(\.test\.|\.spec\.|jest|vitest|mocha|cypress|playwright|describe\(|it\(|expect\()\b/g, type: 'Tests', glob: '["*.test.*", "*.spec.*"]' },
    ];
    
    var matchCounts = {};
    var totalMatches = 0;
    
    for (var j = 0; j < fileTypeSignals.length; j++) {
      var signal = fileTypeSignals[j];
      var matches = body.match(signal.pattern);
      if (matches && matches.length >= 2) { // Need at least 2 mentions to be confident
        matchCounts[signal.type] = { count: matches.length, glob: signal.glob };
        totalMatches += matches.length;
      }
    }
    
    var types = Object.keys(matchCounts);
    
    // Also count mentions of OTHER file types that didn't hit the threshold
    // to detect multi-language rules
    var allMentionedTypes = 0;
    for (var j = 0; j < fileTypeSignals.length; j++) {
      var signal = fileTypeSignals[j];
      var matches = body.match(signal.pattern);
      if (matches && matches.length >= 1) allMentionedTypes++;
    }
    
    // If the rule mentions 3+ different file types (even with 1 match each),
    // it's a multi-language rule — don't flag as waste
    if (allMentionedTypes >= 3) continue;
    
    // If rule is clearly about 1-2 specific file types
    if (types.length >= 1 && types.length <= 2) {
      var dominantType = types[0];
      var dominant = matchCounts[dominantType];
      
      // Make sure it's not just an incidental mention
      if (dominant.count >= 3 || (types.length === 1 && dominant.count >= 2)) {
        var savings = rule.tokens; // They'd save these tokens on every non-matching request
        
        waste.push({
          file: rule.file,
          tokens: rule.tokens,
          detectedType: dominantType,
          suggestedGlob: dominant.glob,
          confidence: dominant.count >= 5 ? 'high' : dominant.count >= 3 ? 'medium' : 'low',
          savings: savings,
          reason: 'alwaysApply rule appears to target ' + dominantType + ' files — add globs to save ~' + savings + ' tokens/request on non-' + dominantType + ' files',
        });
      }
    }
  }
  
  return waste;
}

// Group rules by file type category
function groupByFileType(rules) {
  var groups = {};
  
  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    var category;
    
    if (rule.globs.length > 0) {
      var categories = classifyGlobs(rule.globs);
      category = categories.length > 0 ? categories[0] : 'General';
    } else {
      category = classifyByFilename(rule.file);
    }
    
    if (!groups[category]) {
      groups[category] = { rules: [], totalTokens: 0 };
    }
    groups[category].rules.push(rule);
    groups[category].totalTokens += rule.tokens;
  }
  
  return groups;
}

// Load all rule files with full metadata
function loadRulesWithTokens(dir) {
  var rules = [];
  var rulesDir = path.join(dir, '.cursor', 'rules');
  
  if (!fs.existsSync(rulesDir)) return rules;
  
  var entries = fs.readdirSync(rulesDir).filter(function(f) { return f.endsWith('.mdc'); });
  
  for (var i = 0; i < entries.length; i++) {
    var file = entries[i];
    var filePath = path.join(rulesDir, file);
    var content = fs.readFileSync(filePath, 'utf-8');
    var fm = parseFrontmatter(content);
    var body = getBody(content);
    var tokens = estimateTokens(content);
    var globs = fm.data ? parseGlobs(fm.data.globs) : [];
    var alwaysApply = fm.data && fm.data.alwaysApply === true;
    
    rules.push({
      file: file,
      tokens: tokens,
      bodyTokens: estimateTokens(body),
      fmTokens: tokens - estimateTokens(body),
      globs: globs,
      alwaysApply: alwaysApply,
      tier: alwaysApply ? 'always' : (globs.length > 0 ? 'glob' : 'manual'),
      body: body,
      description: fm.data && fm.data.description ? fm.data.description : null,
    });
  }
  
  return rules;
}

// Load context files (CLAUDE.md, AGENTS.md, .cursorrules)
function loadContextFiles(dir) {
  var files = [];
  var contextFileNames = ['CLAUDE.md', 'AGENTS.md', '.cursorrules', 'COPILOT.md', 'CURSOR.md', 'CONVENTIONS.md'];
  
  for (var i = 0; i < contextFileNames.length; i++) {
    var name = contextFileNames[i];
    var filePath = path.join(dir, name);
    if (fs.existsSync(filePath)) {
      var content = fs.readFileSync(filePath, 'utf-8');
      files.push({
        file: name,
        tokens: estimateTokens(content),
        type: 'context',
      });
    }
  }
  
  return files;
}

// Save stats snapshot for historical tracking
function saveSnapshot(dir, analysis) {
  var historyDir = path.join(dir, '.cursor', '.doctor-history');
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }
  
  var now = new Date();
  var dateStr = now.toISOString().split('T')[0];
  var snapshot = {
    date: now.toISOString(),
    totalTokens: analysis.totalTokens,
    alwaysLoadedTokens: analysis.alwaysLoadedTokens,
    conditionalTokens: analysis.conditionalTokens,
    contextWindowPct: analysis.contextWindowPct,
    ruleCount: analysis.rules.length,
    contextFileTokens: analysis.contextFileTokens,
    wasteTokens: analysis.waste.reduce(function(sum, w) { return sum + w.savings; }, 0),
  };
  
  // Load existing history or start fresh
  var historyPath = path.join(historyDir, 'token-history.json');
  var history = [];
  if (fs.existsSync(historyPath)) {
    try { history = JSON.parse(fs.readFileSync(historyPath, 'utf-8')); } catch (e) { history = []; }
  }
  
  // Don't add duplicate entries for the same date
  history = history.filter(function(h) { return !h.date.startsWith(dateStr); });
  history.push(snapshot);
  
  // Keep only last 90 days
  if (history.length > 90) {
    history = history.slice(history.length - 90);
  }
  
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
  
  return history;
}

// Load historical snapshots
function loadHistory(dir) {
  var historyPath = path.join(dir, '.cursor', '.doctor-history', 'token-history.json');
  if (!fs.existsSync(historyPath)) return [];
  try { return JSON.parse(fs.readFileSync(historyPath, 'utf-8')); } catch (e) { return []; }
}

// Main analysis function
function analyzeTokenBudget(dir, options) {
  options = options || {};
  var isPro = !!options.pro;
  
  var rules = loadRulesWithTokens(dir);
  var contextFiles = loadContextFiles(dir);
  
  // Basic totals
  var alwaysLoadedTokens = 0;
  var conditionalTokens = 0;
  
  for (var i = 0; i < rules.length; i++) {
    if (rules[i].tier === 'always') {
      alwaysLoadedTokens += rules[i].tokens;
    } else {
      conditionalTokens += rules[i].tokens;
    }
  }
  
  var contextFileTokens = 0;
  for (var i = 0; i < contextFiles.length; i++) {
    contextFileTokens += contextFiles[i].tokens;
    alwaysLoadedTokens += contextFiles[i].tokens; // Context files are always loaded
  }
  
  var totalTokens = alwaysLoadedTokens + conditionalTokens;
  var contextWindowPct = Math.round((alwaysLoadedTokens / CONTEXT_WINDOW_TOKENS) * 1000) / 10;
  var totalWindowPct = Math.round((totalTokens / CONTEXT_WINDOW_TOKENS) * 1000) / 10;
  
  var analysis = {
    totalTokens: totalTokens,
    alwaysLoadedTokens: alwaysLoadedTokens,
    conditionalTokens: conditionalTokens,
    contextFileTokens: contextFileTokens,
    contextWindowPct: contextWindowPct,
    totalWindowPct: totalWindowPct,
    contextWindowSize: CONTEXT_WINDOW_TOKENS,
    rules: rules,
    contextFiles: contextFiles,
    ruleCount: rules.length,
    tiers: {
      always: rules.filter(function(r) { return r.tier === 'always'; }).length,
      glob: rules.filter(function(r) { return r.tier === 'glob'; }).length,
      manual: rules.filter(function(r) { return r.tier === 'manual'; }).length,
    },
  };
  
  // FREE: Basic summary is always included
  // Sort rules by token cost for ranking
  analysis.rankedRules = rules.slice().sort(function(a, b) { return b.tokens - a.tokens; });
  
  // PRO features
  if (isPro) {
    // Per-file-type breakdown
    analysis.fileTypeGroups = groupByFileType(rules);
    
    // Waste detection
    analysis.waste = detectWaste(rules);
    analysis.totalWasteTokens = analysis.waste.reduce(function(sum, w) { return sum + w.savings; }, 0);
    
    // Historical tracking
    analysis.history = saveSnapshot(dir, analysis);
    
    // Trend analysis
    if (analysis.history.length >= 2) {
      var prev = analysis.history[analysis.history.length - 2];
      var curr = analysis.history[analysis.history.length - 1];
      analysis.trend = {
        tokenDelta: curr.totalTokens - prev.totalTokens,
        ruleDelta: curr.ruleCount - prev.ruleCount,
        wasteDelta: curr.wasteTokens - prev.wasteTokens,
        direction: curr.totalTokens > prev.totalTokens ? 'up' : curr.totalTokens < prev.totalTokens ? 'down' : 'flat',
      };
    }
  } else {
    analysis.waste = [];
    analysis.totalWasteTokens = 0;
  }
  
  return analysis;
}

module.exports = { analyzeTokenBudget, loadHistory, CONTEXT_WINDOW_TOKENS, detectWaste, groupByFileType };
