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
  return { found: true, data: data };
}

function parseGlobs(globVal) {
  if (!globVal) return [];
  if (Array.isArray(globVal)) return globVal;
  if (typeof globVal === 'string') {
    var trimmed = globVal.trim();
    if (trimmed.startsWith('[')) {
      return trimmed.slice(1, -1).split(',').map(function(g) { return g.trim().replace(/^["']|["']$/g, ''); }).filter(Boolean);
    }
    return trimmed.split(',').map(function(g) { return g.trim().replace(/^["']|["']$/g, ''); }).filter(Boolean);
  }
  return [];
}

function estimateTokens(text) {
  // Rough estimate: ~4 chars per token for English text
  return Math.ceil(text.length / 4);
}

function showLoadOrder(dir) {
  const results = {
    hasCursorrules: false,
    rules: [],
    warnings: [],
  };

  // Check for .cursorrules
  const cursorrules = path.join(dir, '.cursorrules');
  if (fs.existsSync(cursorrules)) {
    results.hasCursorrules = true;
    const content = fs.readFileSync(cursorrules, 'utf-8');
    const lines = content.split('\n').length;
    results.rules.push({
      file: '.cursorrules',
      tier: 'always',
      globs: [],
      description: '(legacy format)',
      alwaysApply: true,
      lines,
      tokens: estimateTokens(content),
      priority: 0, // lowest priority — overridden by .mdc
    });
  }

  // Check .cursor/rules/*.mdc
  const rulesDir = path.join(dir, '.cursor', 'rules');
  if (fs.existsSync(rulesDir) && fs.statSync(rulesDir).isDirectory()) {
    const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.mdc')).sort();

    for (const file of files) {
      const filePath = path.join(rulesDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const fm = parseFrontmatter(content);
      const lines = content.split('\n').length;
      const tokens = estimateTokens(content);

      if (!fm.found || !fm.data) {
        results.rules.push({
          file,
          tier: 'manual',
          globs: [],
          description: '(no frontmatter)',
          alwaysApply: false,
          lines,
          tokens,
        });
        results.warnings.push(`${file}: Missing frontmatter — rule may not load at all`);
        continue;
      }

      const globs = parseGlobs(fm.data.globs);
      const alwaysApply = fm.data.alwaysApply === true;
      const description = fm.data.description || '';

      let tier;
      if (alwaysApply) {
        tier = 'always';
      } else if (globs.length > 0) {
        tier = 'glob';
      } else {
        tier = 'manual';
        results.warnings.push(`${file}: No alwaysApply and no globs — this rule may never activate in agent mode`);
      }

      results.rules.push({
        file,
        tier,
        globs,
        description,
        alwaysApply,
        lines,
        tokens,
      });
    }
  }

  // Sort within tiers: always first, then glob, then manual
  // Within each tier, sort by filename (alphabetical = filesystem order)
  const tierOrder = { always: 0, glob: 1, manual: 2 };
  results.rules.sort((a, b) => {
    if (tierOrder[a.tier] !== tierOrder[b.tier]) return tierOrder[a.tier] - tierOrder[b.tier];
    // .cursorrules always last within 'always' tier (lowest priority)
    if (a.file === '.cursorrules') return 1;
    if (b.file === '.cursorrules') return -1;
    return a.file.localeCompare(b.file);
  });

  return results;
}

module.exports = { showLoadOrder };
