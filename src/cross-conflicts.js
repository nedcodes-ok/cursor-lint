const fs = require('fs');
const path = require('path');

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
  return { found: true, data };
}

function getBody(content) {
  var normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  var match = normalized.match(/^---\n[\s\S]*?\n---\n?/);
  if (!match) return content;
  return content.slice(match[0].length);
}

// Extract style/behavior directives from any text
function extractDirectives(text) {
  var directives = [];
  var lines = text.split('\n');
  
  // Patterns that indicate a directive
  var patterns = [
    // "always use X" / "never use X"
    { regex: /\b(always)\s+(use|prefer|include|require|enable)\s+([^.\n,;]{3,60})/gi, action: 'require' },
    { regex: /\b(never|don't|do not|avoid)\s+(use|include|enable|add)\s+([^.\n,;]{3,60})/gi, action: 'forbid' },
    // "prefer X over Y"
    { regex: /\bprefer\s+([^.\n,;]{3,40})\s+over\s+([^.\n,;]{3,40})/gi, action: 'prefer-over' },
    // "use X" / "prefer X"
    { regex: /\b(use|prefer|require|enable)\s+([^.\n,;]{3,60})/gi, action: 'use' },
    // "avoid X" / "don't X" / "no X"
    { regex: /\b(avoid|disable|remove|exclude)\s+([^.\n,;]{3,60})/gi, action: 'avoid' },
    // Semicolon rules
    { regex: /\b(always|use|add|require|include)\s+(semicolons?)\b/gi, action: 'require-style' },
    { regex: /\b(no|never|avoid|don't|omit|remove)\s+(semicolons?)\b/gi, action: 'forbid-style' },
    // Quote style
    { regex: /\b(use|prefer|always)\s+(single\s+quotes?|double\s+quotes?)\b/gi, action: 'require-style' },
    // Indent style
    { regex: /\b(use|prefer)\s+(\d+)\s+(spaces?|tabs?)\b/gi, action: 'require-style' },
    { regex: /\b(use|prefer)\s+(tabs?|spaces?)\s+(for\s+indent|indent)/gi, action: 'require-style' },
    // Naming conventions
    { regex: /\b(use|prefer|follow)\s+(camelCase|snake_case|PascalCase|kebab-case|SCREAMING_SNAKE)/gi, action: 'require-style' },
    // Error handling
    { regex: /\b(always|must)\s+(catch|handle)\s+(errors?|exceptions?)/gi, action: 'require' },
    // Type safety
    { regex: /\b(use|prefer|enable)\s+(strict\s+mode|strict\s+type)/gi, action: 'require' },
    { regex: /\b(avoid|never|don't|no)\s+(any\s+type|any\b)/gi, action: 'forbid' },
    { regex: /\b(use|allow|prefer)\s+(any\s+type|any\b)\s+(when|for|if)/gi, action: 'use' },
  ];
  
  var inCodeBlock = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    // Track code block state
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    if (line.startsWith('#') || line.startsWith('<!--') || line.length < 5) continue;
    
    for (var j = 0; j < patterns.length; j++) {
      var p = patterns[j];
      p.regex.lastIndex = 0;
      var match;
      while ((match = p.regex.exec(line)) !== null) {
        var subject;
        if (p.action === 'prefer-over') {
          subject = normalizeSubject(match[1]);
          var over = normalizeSubject(match[2]);
          if (subject && over) {
            directives.push({ action: 'prefer', subject: subject, over: over, line: i + 1, text: line });
            directives.push({ action: 'avoid', subject: over, line: i + 1, text: line });
          }
        } else if (p.action === 'require-style' || p.action === 'forbid-style') {
          // Combine all matched groups after the verb
          subject = normalizeSubject(match.slice(2).filter(Boolean).join(' '));
          if (subject) {
            directives.push({ action: p.action.split('-')[0], subject: subject, line: i + 1, text: line, style: true });
          }
        } else {
          // Last capture group is the subject
          subject = normalizeSubject(match[match.length - 1]);
          if (subject) {
            directives.push({ action: p.action, subject: subject, line: i + 1, text: line });
          }
        }
      }
    }
  }
  
  return directives;
}

function normalizeSubject(text) {
  if (!text) return null;
  var normalized = text.toLowerCase().trim();
  normalized = normalized.replace(/[.,;:!?]+$/, '');
  normalized = normalized.replace(/^(the|a|an)\s+/i, '');
  normalized = normalized.replace(/\s+/g, ' ');
  if (normalized.length < 2 || normalized.length > 60) return null;
  return normalized;
}

function subjectsSimilar(a, b) {
  if (a === b) return true;
  
  // One contains the other entirely (short subject inside longer one)
  if (a.length > 4 && b.includes(a)) return true;
  if (b.length > 4 && a.includes(b)) return true;
  
  // Normalize further for comparison
  var cleanA = a.replace(/s$/, '').replace(/-/g, ' ');
  var cleanB = b.replace(/s$/, '').replace(/-/g, ' ');
  if (cleanA === cleanB) return true;
  
  // Strip language/framework qualifiers to compare the CORE subject
  // "semicolons in typescript files" -> "semicolons"
  // "single quotes" -> "single quotes"  
  var stripQualifiers = function(text) {
    return text
      .replace(/\b(in|for|of|with|on)\s+(typescript|javascript|python|ruby|go|rust|java|kotlin|swift|php|react|vue|svelte|angular|css|html|json|yaml|sql)\b.*/gi, '')
      .replace(/\b(typescript|javascript|python|ruby|go|rust|java|kotlin|swift|php|react|vue|svelte|angular)\s+(files?|code|modules?|projects?)\b/gi, '')
      .trim();
  };
  
  var coreA = stripQualifiers(cleanA);
  var coreB = stripQualifiers(cleanB);
  
  // If after stripping qualifiers, one is empty or too short, they're not comparable
  if (coreA.length < 5 || coreB.length < 5) return false;
  
  // Compare core subjects
  if (coreA === coreB) return true;
  if (coreA.length > 4 && coreB.includes(coreA)) return true;
  if (coreB.length > 4 && coreA.includes(coreB)) return true;
  
  // Check for key overlapping words (excluding language/framework names and common words)
  var stopWords = new Set(['typescript', 'javascript', 'python', 'ruby', 'rust', 'java', 'react', 
    'vue', 'svelte', 'angular', 'files', 'file', 'code', 'always', 'never', 'should', 'must',
    'that', 'this', 'with', 'from', 'when', 'your', 'each', 'every', 'their', 'have', 'been']);
  
  var wordsA = coreA.split(/\s+/).filter(function(w) { return w.length > 3 && !stopWords.has(w); });
  var wordsB = coreB.split(/\s+/).filter(function(w) { return w.length > 3 && !stopWords.has(w); });
  
  // Need at least one meaningful word match, AND both subjects should be short enough
  // that the shared word represents a significant overlap
  for (var i = 0; i < wordsA.length; i++) {
    for (var j = 0; j < wordsB.length; j++) {
      if (wordsA[i] === wordsB[j]) {
        // Only count as similar if the shared word is a substantial part of both subjects
        var wordLen = wordsA[i].length;
        if (wordLen >= coreA.length * 0.3 || wordLen >= coreB.length * 0.3) {
          return true;
        }
      }
    }
  }
  
  return false;
}

// Check if two directives conflict
function directivesConflict(a, b) {
  if (!subjectsSimilar(a.subject, b.subject)) return false;
  
  var opposites = {
    'require': ['forbid', 'avoid'],
    'use': ['forbid', 'avoid'],
    'prefer': ['forbid', 'avoid'],
    'forbid': ['require', 'use', 'prefer'],
    'avoid': ['require', 'use'],
  };
  
  var aOpposites = opposites[a.action];
  if (aOpposites && aOpposites.indexOf(b.action) !== -1) return true;
  
  var bOpposites = opposites[b.action];
  if (bOpposites && bOpposites.indexOf(a.action) !== -1) return true;
  
  // Special case: "use single quotes" vs "use double quotes"
  if (a.style && b.style && a.action === b.action) {
    if ((a.subject.includes('single') && b.subject.includes('double')) ||
        (a.subject.includes('double') && b.subject.includes('single'))) {
      return true;
    }
    if ((a.subject.includes('tabs') && b.subject.includes('spaces')) ||
        (a.subject.includes('spaces') && b.subject.includes('tabs'))) {
      return true;
    }
    // Different indent sizes
    var aIndent = a.subject.match(/(\d+)\s*spaces?/);
    var bIndent = b.subject.match(/(\d+)\s*spaces?/);
    if (aIndent && bIndent && aIndent[1] !== bIndent[1]) {
      return true;
    }
  }
  
  return false;
}

// Load all source files and their directives
function loadAllSources(dir) {
  var sources = [];
  
  // 1. .cursor/rules/*.mdc files
  var rulesDir = path.join(dir, '.cursor', 'rules');
  if (fs.existsSync(rulesDir)) {
    var mdcFiles = fs.readdirSync(rulesDir).filter(function(f) { return f.endsWith('.mdc'); });
    for (var i = 0; i < mdcFiles.length; i++) {
      var filePath = path.join(rulesDir, mdcFiles[i]);
      var content = fs.readFileSync(filePath, 'utf-8');
      var body = getBody(content);
      var fm = parseFrontmatter(content);
      sources.push({
        file: '.cursor/rules/' + mdcFiles[i],
        type: 'mdc',
        content: body,
        directives: extractDirectives(body),
        globs: fm.data ? parseGlobsLocal(fm.data.globs) : [],
        alwaysApply: fm.data && fm.data.alwaysApply === true,
      });
    }
  }
  
  // 2. CLAUDE.md
  var claudeMd = path.join(dir, 'CLAUDE.md');
  if (fs.existsSync(claudeMd)) {
    var content = fs.readFileSync(claudeMd, 'utf-8');
    sources.push({
      file: 'CLAUDE.md',
      type: 'claude',
      content: content,
      directives: extractDirectives(content),
    });
  }
  
  // 3. AGENTS.md
  var agentsMd = path.join(dir, 'AGENTS.md');
  if (fs.existsSync(agentsMd)) {
    var content = fs.readFileSync(agentsMd, 'utf-8');
    sources.push({
      file: 'AGENTS.md',
      type: 'agents',
      content: content,
      directives: extractDirectives(content),
    });
  }
  
  // 4. .cursorrules (legacy)
  var cursorrules = path.join(dir, '.cursorrules');
  if (fs.existsSync(cursorrules)) {
    var content = fs.readFileSync(cursorrules, 'utf-8');
    sources.push({
      file: '.cursorrules',
      type: 'legacy',
      content: content,
      directives: extractDirectives(content),
    });
  }
  
  // 5. .cursor/agents/*.md
  var agentsDir = path.join(dir, '.cursor', 'agents');
  if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
    var agentFiles = fs.readdirSync(agentsDir).filter(function(f) { return f.endsWith('.md'); });
    for (var i = 0; i < agentFiles.length; i++) {
      var filePath = path.join(agentsDir, agentFiles[i]);
      var content = fs.readFileSync(filePath, 'utf-8');
      sources.push({
        file: '.cursor/agents/' + agentFiles[i],
        type: 'agent',
        content: content,
        directives: extractDirectives(content),
      });
    }
  }
  
  // 6. hooks.json — extract behavior constraints
  var hooksJson = path.join(dir, '.cursor', 'hooks.json');
  if (fs.existsSync(hooksJson)) {
    try {
      var hooksContent = fs.readFileSync(hooksJson, 'utf-8');
      var hooks = JSON.parse(hooksContent);
      var hookDirectives = extractHookDirectives(hooks);
      if (hookDirectives.length > 0) {
        sources.push({
          file: '.cursor/hooks.json',
          type: 'hooks',
          content: hooksContent,
          directives: hookDirectives,
        });
      }
    } catch (e) {
      // Invalid JSON, skip
    }
  }
  
  return sources;
}

function parseGlobsLocal(globVal) {
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

// Extract behavioral constraints from hooks.json
function extractHookDirectives(hooks) {
  var directives = [];
  
  // hooks.json can have pre/post save hooks that enforce formatting
  // We look for common patterns in hook scripts
  if (hooks && typeof hooks === 'object') {
    for (var event in hooks) {
      var hookConfig = hooks[event];
      
      // Handle both string and object hook configs
      var commands = [];
      if (typeof hookConfig === 'string') {
        commands.push(hookConfig);
      } else if (Array.isArray(hookConfig)) {
        for (var i = 0; i < hookConfig.length; i++) {
          if (typeof hookConfig[i] === 'string') commands.push(hookConfig[i]);
          else if (hookConfig[i] && hookConfig[i].command) commands.push(hookConfig[i].command);
        }
      } else if (hookConfig && hookConfig.command) {
        commands.push(hookConfig.command);
      }
      
      for (var j = 0; j < commands.length; j++) {
        var cmd = commands[j].toLowerCase();
        
        // Detect formatter enforcement
        if (cmd.includes('prettier')) {
          directives.push({ action: 'require', subject: 'prettier formatting', line: 0, text: 'hooks.json: ' + event, hook: true });
        }
        if (cmd.includes('eslint')) {
          directives.push({ action: 'require', subject: 'eslint rules', line: 0, text: 'hooks.json: ' + event, hook: true });
        }
        if (cmd.includes('black') || cmd.includes('ruff')) {
          directives.push({ action: 'require', subject: 'python formatting', line: 0, text: 'hooks.json: ' + event, hook: true });
        }
        if (cmd.includes('rubocop')) {
          directives.push({ action: 'require', subject: 'rubocop formatting', line: 0, text: 'hooks.json: ' + event, hook: true });
        }
      }
    }
  }
  
  return directives;
}

// Main cross-format conflict detection
function detectCrossFormatConflicts(dir) {
  var sources = loadAllSources(dir);
  var conflicts = [];
  
  // Compare every pair of sources from DIFFERENT files
  for (var i = 0; i < sources.length; i++) {
    for (var j = i + 1; j < sources.length; j++) {
      var sourceA = sources[i];
      var sourceB = sources[j];
      
      // Skip comparing two rules that can't overlap (different glob targets, neither is alwaysApply)
      if (sourceA.type === 'mdc' && sourceB.type === 'mdc') {
        // Already handled by existing intra-mdc conflict detection
        continue;
      }
      
      // Compare directives
      for (var k = 0; k < sourceA.directives.length; k++) {
        for (var l = 0; l < sourceB.directives.length; l++) {
          var dA = sourceA.directives[k];
          var dB = sourceB.directives[l];
          
          if (directivesConflict(dA, dB)) {
            conflicts.push({
              severity: 'error',
              fileA: sourceA.file,
              fileB: sourceB.file,
              typeA: sourceA.type,
              typeB: sourceB.type,
              directiveA: dA.action + ' ' + dA.subject,
              directiveB: dB.action + ' ' + dB.subject,
              lineA: dA.line,
              lineB: dB.line,
              textA: dA.text,
              textB: dB.text,
              message: sourceA.file + ' says "' + dA.action + ' ' + dA.subject + '" but ' + sourceB.file + ' says "' + dB.action + ' ' + dB.subject + '"',
              hint: 'Cross-format conflict: these two files give contradictory instructions. Resolve by aligning them or removing one.',
            });
          }
        }
      }
    }
  }
  
  // Deduplicate conflicts (same pair of files, similar subjects)
  var seen = Object.create(null);
  var deduped = [];
  for (var i = 0; i < conflicts.length; i++) {
    var c = conflicts[i];
    var key = [c.fileA, c.fileB, c.directiveA, c.directiveB].sort().join('|||');
    if (!seen[key]) {
      seen[key] = true;
      deduped.push(c);
    }
  }
  
  return deduped;
}

// Generate a summary report
function crossConflictReport(dir) {
  var conflicts = detectCrossFormatConflicts(dir);
  
  if (conflicts.length === 0) {
    return {
      clean: true,
      conflicts: [],
      summary: 'No cross-format conflicts detected',
      filesCovered: [],
    };
  }
  
  // Group by file pair
  var groups = {};
  for (var i = 0; i < conflicts.length; i++) {
    var c = conflicts[i];
    var key = c.fileA + ' vs ' + c.fileB;
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }
  
  var filesCovered = new Set();
  for (var i = 0; i < conflicts.length; i++) {
    filesCovered.add(conflicts[i].fileA);
    filesCovered.add(conflicts[i].fileB);
  }
  
  return {
    clean: false,
    conflicts: conflicts,
    groups: groups,
    summary: conflicts.length + ' cross-format conflict(s) across ' + Object.keys(groups).length + ' file pair(s)',
    filesCovered: Array.from(filesCovered),
  };
}

module.exports = { detectCrossFormatConflicts, crossConflictReport, extractDirectives, loadAllSources };
