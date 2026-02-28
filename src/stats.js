const fs = require('fs');
const path = require('path');

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function parseFrontmatter(content) {
  var match = content.match(/^---\n([\s\S]*?)\n---/);
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
      return trimmed.slice(1, -1).split(',').map(g => g.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
    return trimmed.split(',').map(g => g.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  if (Array.isArray(globVal)) return globVal;
  return [];
}

function getProjectFileExtensions(dir) {
  const extensions = new Set();
  const ignoreDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cursor', '__pycache__', '.venv', 'venv']);
  
  function walk(d, depth) {
    if (depth > 3) return; // don't go too deep
    try {
      for (const entry of fs.readdirSync(d)) {
        if (ignoreDirs.has(entry)) continue;
        const full = path.join(d, entry);
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            walk(full, depth + 1);
          } else {
            const ext = path.extname(entry);
            if (ext) extensions.add(ext);
          }
        } catch {}
      }
    } catch {}
  }
  walk(dir, 0);
  return extensions;
}

// Map file extensions to what kind of rules would cover them
const EXT_TO_CATEGORY = {
  '.ts': ['typescript', 'react', 'nextjs', 'angular', 'nestjs'],
  '.tsx': ['typescript', 'react', 'nextjs'],
  '.js': ['javascript', 'react', 'nextjs', 'express', 'node'],
  '.jsx': ['javascript', 'react'],
  '.py': ['python', 'django', 'fastapi', 'flask'],
  '.rb': ['ruby', 'rails'],
  '.go': ['go'],
  '.rs': ['rust'],
  '.java': ['java', 'spring-boot'],
  '.kt': ['kotlin'],
  '.swift': ['swift'],
  '.php': ['php', 'laravel'],
  '.vue': ['vue', 'nuxt'],
  '.svelte': ['svelte', 'sveltekit'],
  '.css': ['tailwind-css'],
  '.scss': ['tailwind-css'],
  '.html': [],
  '.json': [],
  '.yaml': [],
  '.yml': [],
  '.md': [],
  '.mdc': [],
};

function showStats(dir) {
  const stats = {
    mdcFiles: [],
    hasCursorrules: false,
    cursorrulesTokens: 0,
    skillFiles: [],
    totalTokens: 0,
    tiers: { always: 0, glob: 0, manual: 0 },
    coverageGaps: [],
    projectExtensions: new Set(),
    coveredExtensions: new Set(),
  };

  // .cursorrules
  const cursorrules = path.join(dir, '.cursorrules');
  if (fs.existsSync(cursorrules)) {
    stats.hasCursorrules = true;
    const content = fs.readFileSync(cursorrules, 'utf-8');
    stats.cursorrulesTokens = estimateTokens(content);
    stats.totalTokens += stats.cursorrulesTokens;
  }

  // .cursor/rules/*.mdc
  const rulesDir = path.join(dir, '.cursor', 'rules');
  if (fs.existsSync(rulesDir) && fs.statSync(rulesDir).isDirectory()) {
    for (const entry of fs.readdirSync(rulesDir)) {
      if (!entry.endsWith('.mdc')) continue;
      const filePath = path.join(rulesDir, entry);
      const content = fs.readFileSync(filePath, 'utf-8');
      const tokens = estimateTokens(content);
      const fm = parseFrontmatter(content);
      
      let tier = 'manual';
      let globs = [];
      if (fm.found && fm.data) {
        globs = parseGlobs(fm.data.globs);
        if (fm.data.alwaysApply === true) tier = 'always';
        else if (globs.length > 0) tier = 'glob';
      }
      
      stats.tiers[tier]++;
      stats.totalTokens += tokens;
      stats.mdcFiles.push({ file: entry, tokens, tier, globs });
      
      // Track covered extensions from globs
      for (const g of globs) {
        const extMatch = g.match(/\*\.(\w+)$/);
        if (extMatch) stats.coveredExtensions.add('.' + extMatch[1]);
      }
    }
  }

  // Skill files
  const skillDirs = [
    path.join(dir, '.claude', 'skills'),
    path.join(dir, '.cursor', 'skills'),
    path.join(dir, 'skills'),
  ];
  for (const sd of skillDirs) {
    if (!fs.existsSync(sd)) continue;
    try {
      for (const entry of fs.readdirSync(sd)) {
        const sub = path.join(sd, entry);
        if (fs.statSync(sub).isDirectory()) {
          const skillMd = path.join(sub, 'SKILL.md');
          if (fs.existsSync(skillMd)) {
            const content = fs.readFileSync(skillMd, 'utf-8');
            stats.skillFiles.push({ file: path.relative(dir, skillMd), tokens: estimateTokens(content) });
            stats.totalTokens += estimateTokens(content);
          }
        }
      }
    } catch {}
  }

  // Coverage analysis
  stats.projectExtensions = getProjectFileExtensions(dir);
  
  // Find gaps: project has files of type X but no rule covers them
  const ruleNames = stats.mdcFiles.map(f => f.file.replace('.mdc', '').toLowerCase());
  for (const ext of stats.projectExtensions) {
    const categories = EXT_TO_CATEGORY[ext];
    if (!categories || categories.length === 0) continue;
    const covered = categories.some(cat => ruleNames.some(r => r.includes(cat)));
    if (!covered && !stats.coveredExtensions.has(ext)) {
      stats.coverageGaps.push({ ext, suggestedRules: categories });
    }
  }

  return stats;
}

module.exports = { showStats };
