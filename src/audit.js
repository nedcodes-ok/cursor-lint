const fs = require('fs');
const path = require('path');
const { lintProject, parseFrontmatter } = require('./index');
const { showStats } = require('./stats');
const { analyzeTokenBudget } = require('./token-budget');
const { extractDirectives, findDirectiveConflicts, subjectsSimilar, normalizeSubject } = require('./directives');
const { detectCrossFormatConflicts } = require('./cross-conflicts');

function detectStack(dir) {
  const stack = { frameworks: [], languages: [], packageManager: null };
  
  const pkgPath = path.join(dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      if (allDeps.next) stack.frameworks.push(`Next.js ${allDeps.next}`);
      if (allDeps.react) stack.frameworks.push(`React ${allDeps.react}`);
      if (allDeps.vue) stack.frameworks.push(`Vue ${allDeps.vue}`);
      if (allDeps.svelte || allDeps['@sveltejs/kit']) stack.frameworks.push('SvelteKit');
      if (allDeps.express) stack.frameworks.push(`Express ${allDeps.express}`);
      if (allDeps['@nestjs/core']) stack.frameworks.push('NestJS');
      if (allDeps['@angular/core']) stack.frameworks.push('Angular');
      if (allDeps.tailwindcss) stack.frameworks.push('Tailwind CSS');
      if (allDeps.prisma || allDeps['@prisma/client']) stack.frameworks.push('Prisma');
      if (allDeps.drizzle || allDeps['drizzle-orm']) stack.frameworks.push('Drizzle');
      
      if (allDeps.typescript) stack.languages.push('TypeScript');
      stack.languages.push('JavaScript');
      
      if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) stack.packageManager = 'pnpm';
      else if (fs.existsSync(path.join(dir, 'yarn.lock'))) stack.packageManager = 'yarn';
      else if (fs.existsSync(path.join(dir, 'bun.lockb'))) stack.packageManager = 'bun';
      else stack.packageManager = 'npm';
    } catch {}
  }
  
  if (fs.existsSync(path.join(dir, 'requirements.txt')) || fs.existsSync(path.join(dir, 'pyproject.toml'))) {
    stack.languages.push('Python');
    if (fs.existsSync(path.join(dir, 'manage.py'))) stack.frameworks.push('Django');
  }
  if (fs.existsSync(path.join(dir, 'Gemfile'))) {
    stack.languages.push('Ruby');
    if (fs.existsSync(path.join(dir, 'config', 'routes.rb'))) stack.frameworks.push('Rails');
  }
  if (fs.existsSync(path.join(dir, 'go.mod'))) stack.languages.push('Go');
  if (fs.existsSync(path.join(dir, 'Cargo.toml'))) stack.languages.push('Rust');
  
  return stack;
}

function findConflicts(rules) {
  const conflicts = [];
  
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i];
      const b = rules[j];
      
      // Check glob overlap
      const aGlobs = a.globs || [];
      const bGlobs = b.globs || [];
      const overlapping = aGlobs.some(ag => bGlobs.some(bg => globsOverlap(ag, bg)));
      
      if (!overlapping && !a.alwaysApply && !b.alwaysApply) continue;
      
      // Extract directives from both rules
      const aDirectives = extractDirectives(a.body);
      const bDirectives = extractDirectives(b.body);
      
      // Find conflicting directives
      const contradictions = findDirectiveConflicts(aDirectives, bDirectives);
      if (contradictions.length > 0) {
        conflicts.push({
          fileA: a.file,
          fileB: b.file,
          reason: contradictions.join('; '),
          severity: 'warning',
        });
      }
    }
  }
  
  return conflicts;
}

function globsOverlap(a, b) {
  if (a === b) return true;
  if (a === '**/*' || b === '**/*') return true;
  // Extract extensions
  const extA = a.match(/\*\.(\w+)$/);
  const extB = b.match(/\*\.(\w+)$/);
  if (extA && extB && extA[1] === extB[1]) return true;
  return false;
}

function findRedundancy(rules) {
  const redundant = [];
  
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i];
      const b = rules[j];
      
      // Check for very similar bodies (>80% line overlap)
      const aLines = new Set(a.body.split('\n').map(l => l.trim()).filter(l => l.length > 10));
      const bLines = new Set(b.body.split('\n').map(l => l.trim()).filter(l => l.length > 10));
      
      if (aLines.size === 0 || bLines.size === 0) continue;
      
      let overlap = 0;
      for (const line of aLines) {
        if (bLines.has(line)) overlap++;
      }
      
      const overlapPct = overlap / Math.min(aLines.size, bLines.size);
      if (overlapPct > 0.6) {
        redundant.push({
          fileA: a.file,
          fileB: b.file,
          overlapPct: Math.round(overlapPct * 100),
          sharedLines: overlap,
        });
      }
    }
  }
  
  return redundant;
}

function tokenBudgetBreakdown(stats) {
  const breakdown = {
    alwaysLoaded: 0,
    conditionalMax: 0,
    total: stats.totalTokens,
    files: [],
  };
  
  for (const f of stats.mdcFiles) {
    const entry = { file: f.file, tokens: f.tokens, tier: f.tier };
    if (f.tier === 'always') {
      breakdown.alwaysLoaded += f.tokens;
    } else {
      breakdown.conditionalMax += f.tokens;
    }
    breakdown.files.push(entry);
  }
  
  if (stats.hasCursorrules) {
    breakdown.alwaysLoaded += stats.cursorrulesTokens;
    breakdown.files.unshift({ file: '.cursorrules', tokens: stats.cursorrulesTokens, tier: 'always' });
  }
  
  // Sort by tokens descending
  breakdown.files.sort((a, b) => b.tokens - a.tokens);
  
  return breakdown;
}

function loadRules(dir) {
  const rules = [];
  const rulesDir = path.join(dir, '.cursor', 'rules');
  if (!fs.existsSync(rulesDir)) return rules;
  
  for (const entry of fs.readdirSync(rulesDir)) {
    if (!entry.endsWith('.mdc')) continue;
    const filePath = path.join(rulesDir, entry);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content);
    const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
    
    let globs = [];
    let alwaysApply = false;
    if (fm.found && fm.data) {
      alwaysApply = fm.data.alwaysApply === true;
      const globVal = fm.data.globs;
      if (typeof globVal === 'string') {
        const trimmed = globVal.trim();
        if (trimmed.startsWith('[')) {
          globs = trimmed.slice(1, -1).split(',').map(g => g.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        } else {
          globs = [trimmed];
        }
      }
    }
    
    rules.push({ file: entry, content, body, globs, alwaysApply, fm });
  }
  
  return rules;
}

async function fullAudit(dir) {
  const report = { sections: [] };
  
  // 1. Stack detection
  const stack = detectStack(dir);
  report.sections.push({
    title: 'Detected Stack',
    items: [
      ...stack.frameworks.map(f => ({ text: f, type: 'info' })),
      ...stack.languages.map(l => ({ text: l, type: 'info' })),
      stack.packageManager ? { text: `Package manager: ${stack.packageManager}`, type: 'info' } : null,
    ].filter(Boolean),
  });
  
  // 2. Token budget breakdown (enhanced with smart analysis)
  const stats = showStats(dir);
  const budget = tokenBudgetBreakdown(stats);
  const tokenAnalysis = analyzeTokenBudget(dir, { pro: true });
  
  const budgetItems = [
    { text: `Always loaded: ~${tokenAnalysis.alwaysLoadedTokens} tokens (${tokenAnalysis.contextWindowPct}% of context window)`, type: tokenAnalysis.contextWindowPct > 15 ? 'warning' : 'info' },
    { text: `Conditional (max): ~${tokenAnalysis.conditionalTokens} tokens`, type: 'info' },
    { text: `Total: ~${tokenAnalysis.totalTokens} tokens`, type: tokenAnalysis.totalTokens > 5000 ? 'warning' : 'info' },
  ];
  
  // Per-file-type breakdown
  if (tokenAnalysis.fileTypeGroups) {
    const sortedGroups = Object.entries(tokenAnalysis.fileTypeGroups).sort((a, b) => b[1].totalTokens - a[1].totalTokens);
    for (const [name, data] of sortedGroups) {
      const pct = tokenAnalysis.totalTokens > 0 ? Math.round((data.totalTokens / tokenAnalysis.totalTokens) * 100) : 0;
      budgetItems.push({ text: `  ${name}: ~${data.totalTokens} tokens (${pct}%)`, type: 'info' });
    }
  }
  
  // Per-rule ranking
  budgetItems.push({ text: '', type: 'info' });
  budgetItems.push({ text: 'Per-rule cost ranking:', type: 'info' });
  for (const f of budget.files.slice(0, 10)) {
    budgetItems.push({
      text: `  ${f.file}: ~${f.tokens} tokens (${f.tier})`,
      type: f.tokens > 1500 ? 'warning' : 'info',
    });
  }
  
  // Waste detection
  if (tokenAnalysis.waste && tokenAnalysis.waste.length > 0) {
    budgetItems.push({ text: '', type: 'info' });
    for (const w of tokenAnalysis.waste) {
      budgetItems.push({
        text: `Waste: ${w.file} — ${w.reason}`,
        type: 'warning',
      });
    }
    budgetItems.push({
      text: `Total potential savings: ~${tokenAnalysis.totalWasteTokens} tokens/request`,
      type: 'fix',
    });
  }
  
  report.sections.push({
    title: 'Token Budget',
    items: budgetItems,
  });
  
  // 3. Lint issues
  const lintResults = await lintProject(dir);
  let errors = 0, warnings = 0;
  const issues = [];
  for (const r of lintResults) {
    for (const i of r.issues) {
      if (i.severity === 'error') errors++;
      else warnings++;
      issues.push({ file: r.file, ...i });
    }
  }
  report.sections.push({
    title: 'Lint Issues',
    items: issues.length === 0
      ? [{ text: 'No issues found', type: 'pass' }]
      : issues.map(i => ({ text: `${i.file}: ${i.message}`, type: i.severity })),
  });
  
  // 4. Conflicts
  const rules = loadRules(dir);
  const conflicts = findConflicts(rules);
  report.sections.push({
    title: 'Conflicts',
    items: conflicts.length === 0
      ? [{ text: 'No conflicts detected', type: 'pass' }]
      : conflicts.map(c => ({ text: `${c.fileA} vs ${c.fileB}: ${c.reason}`, type: c.severity })),
  });
  
  // 4b. Cross-format conflicts
  const crossConflicts = detectCrossFormatConflicts(dir);
  report.sections.push({
    title: 'Cross-Format Conflicts',
    items: crossConflicts.length === 0
      ? [{ text: 'No conflicts between .cursor/rules/, CLAUDE.md, AGENTS.md, .cursorrules, or hooks.json', type: 'pass' }]
      : crossConflicts.map(c => ({
        text: `${c.fileA} vs ${c.fileB}: "${c.directiveA}" conflicts with "${c.directiveB}"`,
        type: 'error',
      })),
  });

  // 5. Redundancy
  const redundant = findRedundancy(rules);
  report.sections.push({
    title: 'Redundancy',
    items: redundant.length === 0
      ? [{ text: 'No redundant rules found', type: 'pass' }]
      : redundant.map(r => ({
        text: `${r.fileA} and ${r.fileB}: ${r.overlapPct}% overlap (${r.sharedLines} shared lines)`,
        type: 'warning',
      })),
  });
  
  // 6. Coverage gaps
  report.sections.push({
    title: 'Coverage Gaps',
    items: stats.coverageGaps.length === 0
      ? [{ text: 'All detected file types have matching rules', type: 'pass' }]
      : stats.coverageGaps.map(g => ({
        text: `No rules for ${g.ext} files. Consider adding: ${g.suggestedRules.join(', ')}`,
        type: 'warning',
      })),
  });
  
  // 7. Fix suggestions
  const fixes = [];
  if (stats.hasCursorrules) fixes.push({ text: 'Run `cursor-doctor migrate` to convert .cursorrules to .mdc format', type: 'fix' });
  if (errors > 0) fixes.push({ text: 'Run `cursor-doctor fix` to auto-fix frontmatter and structural issues', type: 'fix' });
  for (const f of budget.files) {
    if (f.tokens > 2000) fixes.push({ text: `Split ${f.file} into smaller focused rules (~${f.tokens} tokens is heavy)`, type: 'fix' });
  }
  if (rules.filter(r => r.alwaysApply).length > 5) {
    fixes.push({ text: 'Too many alwaysApply rules. Convert some to glob-targeted rules to save tokens.', type: 'fix' });
  }
  for (const r of redundant) {
    fixes.push({ text: `Merge or deduplicate ${r.fileA} and ${r.fileB}`, type: 'fix' });
  }
  
  report.sections.push({
    title: 'Suggested Fixes',
    items: fixes.length === 0
      ? [{ text: 'No fixes needed. Setup looks good.', type: 'pass' }]
      : fixes,
  });
  
  report.stack = stack;
  report.stats = stats;
  report.budget = budget;
  report.conflicts = conflicts;
  report.redundant = redundant;
  report.lintErrors = errors;
  report.lintWarnings = warnings;
  
  return report;
}

function formatAuditMarkdown(report) {
  let md = '# cursor-doctor Audit Report\n\n';
  
  for (const section of report.sections) {
    md += `## ${section.title}\n\n`;
    for (const item of section.items) {
      const icon = item.type === 'pass' ? '✅' : item.type === 'error' ? '❌' : item.type === 'warning' ? '⚠️' : item.type === 'fix' ? '🔧' : 'ℹ️';
      md += `${icon} ${item.text}\n`;
    }
    md += '\n';
  }
  
  return md;
}

module.exports = { fullAudit, formatAuditMarkdown, detectStack, findConflicts, findRedundancy, tokenBudgetBreakdown, loadRules };
