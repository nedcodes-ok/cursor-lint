const fs = require('fs');
const path = require('path');
const { lintProject, parseFrontmatter } = require('./index');
const { loadRules, findRedundancy, findConflicts } = require('./audit');
const { getTemplate } = require('./templates');
const { showStats } = require('./stats');

function fixFrontmatter(content) {
  const fm = parseFrontmatter(content);
  
  // No frontmatter at all — add minimal one
  if (!fm.found) {
    return `---\ndescription: \nalwaysApply: false\n---\n${content}`;
  }
  
  // Frontmatter has errors — try to repair
  if (fm.found && fm.error) {
    // Try to fix common YAML issues
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (match) {
      let yaml = match[1];
      // Fix missing spaces after colons
      yaml = yaml.replace(/^(\w+):([^\s])/gm, '$1: $2');
      // Fix inconsistent quoting
      yaml = yaml.replace(/globs:\s*\[([^\]]*)\]/g, (m, inner) => {
        const items = inner.split(',').map(i => {
          const trimmed = i.trim().replace(/^["']|["']$/g, '');
          return `"${trimmed}"`;
        });
        return `globs: [${items.join(', ')}]`;
      });
      return content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
    }
  }
  
  return content;
}

function splitOversizedFile(filePath, maxTokens = 1500) {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const tokens = Math.ceil(content.length / 4);
  
  if (tokens <= maxTokens) return null; // no split needed
  
  const fm = parseFrontmatter(content);
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
  
  // Split by sections (## headers)
  const sections = body.split(/(?=^## )/m).filter(s => s.trim());
  
  if (sections.length <= 1) {
    // No sections to split on — split by paragraph
    const paragraphs = body.split(/\n\n+/).filter(p => p.trim());
    const mid = Math.ceil(paragraphs.length / 2);
    return {
      original: filePath,
      parts: [
        { body: paragraphs.slice(0, mid).join('\n\n'), suffix: '-part1' },
        { body: paragraphs.slice(mid).join('\n\n'), suffix: '-part2' },
      ],
      frontmatter: fm,
    };
  }
  
  // Group sections to stay under token limit
  const parts = [];
  let current = [];
  let currentTokens = 0;
  
  for (const section of sections) {
    const sectionTokens = Math.ceil(section.length / 4);
    if (currentTokens + sectionTokens > maxTokens && current.length > 0) {
      parts.push(current.join('\n'));
      current = [section];
      currentTokens = sectionTokens;
    } else {
      current.push(section);
      currentTokens += sectionTokens;
    }
  }
  if (current.length > 0) parts.push(current.join('\n'));
  
  return {
    original: filePath,
    parts: parts.map((body, i) => ({ body, suffix: `-part${i + 1}` })),
    frontmatter: fm,
  };
}

async function autoFix(dir, options = {}) {
  const results = { fixed: [], splits: [], deduped: [], merged: [], annotated: [], generated: [], errors: [] };
  const rulesDir = path.join(dir, '.cursor', 'rules');
  
  if (!fs.existsSync(rulesDir)) {
    results.errors.push('No .cursor/rules/ directory found');
    return results;
  }
  
  // 1. Fix broken frontmatter
  for (const entry of fs.readdirSync(rulesDir)) {
    if (!entry.endsWith('.mdc')) continue;
    const filePath = path.join(rulesDir, entry);
    const original = fs.readFileSync(filePath, 'utf-8');
    const fixed = fixFrontmatter(original);
    
    if (fixed !== original) {
      if (!options.dryRun) {
        fs.writeFileSync(filePath, fixed, 'utf-8');
      }
      results.fixed.push({ file: entry, change: 'frontmatter repaired' });
    }
  }
  
  // 2. Split oversized files
  if (options.split !== false) {
    for (const entry of fs.readdirSync(rulesDir)) {
      if (!entry.endsWith('.mdc')) continue;
      const filePath = path.join(rulesDir, entry);
      const split = splitOversizedFile(filePath, options.maxTokens || 1500);
      
      if (split && split.parts.length > 1) {
        const baseName = entry.replace('.mdc', '');
        
        if (!options.dryRun) {
          for (let i = 0; i < split.parts.length; i++) {
            const part = split.parts[i];
            const newName = `${baseName}${part.suffix}.mdc`;
            const newPath = path.join(rulesDir, newName);
            
            // Rebuild with original frontmatter
            let newContent = '';
            if (split.frontmatter.found && split.frontmatter.data) {
              const fmLines = [];
              for (const [k, v] of Object.entries(split.frontmatter.data)) {
                if (typeof v === 'boolean') fmLines.push(`${k}: ${v}`);
                else if (typeof v === 'string' && (v.startsWith('[') || v === 'true' || v === 'false')) fmLines.push(`${k}: ${v}`);
                else fmLines.push(`${k}: ${v}`);
              }
              newContent = `---\n${fmLines.join('\n')}\n---\n${part.body}`;
            } else {
              newContent = part.body;
            }
            
            fs.writeFileSync(newPath, newContent, 'utf-8');
          }
          // Remove original
          fs.unlinkSync(filePath);
        }
        
        results.splits.push({
          file: entry,
          parts: split.parts.map((p, i) => `${baseName}${p.suffix}.mdc`),
        });
      }
    }
  }
  
  // 3. Auto-merge redundant rules (>60% overlap)
  const rules = loadRules(dir);
  const redundant = findRedundancy(rules);
  const merged = new Set(); // Track files we've already merged to avoid double-processing
  
  for (const r of redundant) {
    if (merged.has(r.fileA) || merged.has(r.fileB)) continue;
    
    if (r.overlapPct >= 60) {
      const ruleA = rules.find(rule => rule.file === r.fileA);
      const ruleB = rules.find(rule => rule.file === r.fileB);
      
      if (!ruleA || !ruleB) continue;
      
      // Determine which rule has broader scope
      const aBroader = isBroaderScope(ruleA, ruleB);
      const keepRule = aBroader ? ruleA : ruleB;
      const mergeRule = aBroader ? ruleB : ruleA;
      
      // Merge bodies: combine unique lines
      const mergedBody = mergeRuleBodies(keepRule.body, mergeRule.body);
      
      // Rebuild the kept file with merged content
      const newContent = rebuildRuleFile(keepRule.fm, mergedBody);
      
      if (!options.dryRun) {
        const keepPath = path.join(rulesDir, keepRule.file);
        const mergePath = path.join(rulesDir, mergeRule.file);
        fs.writeFileSync(keepPath, newContent, 'utf-8');
        fs.unlinkSync(mergePath);
      }
      
      results.merged.push({
        kept: keepRule.file,
        removed: mergeRule.file,
        overlapPct: r.overlapPct,
      });
      
      merged.add(keepRule.file);
      merged.add(mergeRule.file);
    } else {
      // Just flag for manual review
      results.deduped.push({
        fileA: r.fileA,
        fileB: r.fileB,
        overlapPct: r.overlapPct,
        action: 'manual review needed',
      });
    }
  }
  
  // 4. Annotate conflicting rules
  const conflicts = findConflicts(rules);
  const annotated = new Set();
  
  for (const conflict of conflicts) {
    const fileAPath = path.join(rulesDir, conflict.fileA);
    const fileBPath = path.join(rulesDir, conflict.fileB);
    
    if (!annotated.has(conflict.fileA)) {
      const content = fs.readFileSync(fileAPath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const annotatedContent = addConflictAnnotation(content, conflict.fileB, conflict.reason);
      if (annotatedContent !== content) {
        if (!options.dryRun) {
          fs.writeFileSync(fileAPath, annotatedContent, 'utf-8');
        }
        results.annotated.push({ file: conflict.fileA, conflictsWith: conflict.fileB });
        annotated.add(conflict.fileA);
      }
    }
    
    if (!annotated.has(conflict.fileB)) {
      const content = fs.readFileSync(fileBPath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const annotatedContent = addConflictAnnotation(content, conflict.fileA, conflict.reason);
      if (annotatedContent !== content) {
        if (!options.dryRun) {
          fs.writeFileSync(fileBPath, annotatedContent, 'utf-8');
        }
        results.annotated.push({ file: conflict.fileB, conflictsWith: conflict.fileA });
        annotated.add(conflict.fileB);
      }
    }
  }
  
  // 5. Generate missing rules for coverage gaps
  const stats = showStats(dir);
  const gaps = stats.coverageGaps || [];
  
  for (const gap of gaps) {
    for (const suggestedRule of gap.suggestedRules) {
      const template = getTemplate(suggestedRule);
      if (template) {
        const templatePath = path.join(rulesDir, template.name);
        // Only generate if it doesn't already exist
        if (!fs.existsSync(templatePath)) {
          if (!options.dryRun) {
            fs.writeFileSync(templatePath, template.content, 'utf-8');
          }
          results.generated.push({ file: template.name, reason: `coverage gap for ${gap.ext}` });
        }
      }
    }
  }
  
  return results;
}

function isBroaderScope(ruleA, ruleB) {
  // alwaysApply is broader than glob-targeted
  if (ruleA.alwaysApply && !ruleB.alwaysApply) return true;
  if (ruleB.alwaysApply && !ruleA.alwaysApply) return false;
  
  // More globs = broader scope
  const aGlobCount = (ruleA.globs || []).length;
  const bGlobCount = (ruleB.globs || []).length;
  if (aGlobCount > bGlobCount) return true;
  if (bGlobCount > aGlobCount) return false;
  
  // Default to first rule
  return true;
}

function mergeRuleBodies(bodyA, bodyB) {
  const linesA = bodyA.split('\n');
  const linesB = bodyB.split('\n');
  
  const merged = [...linesA];
  const seenLines = new Set(linesA.map(l => l.trim()));
  
  for (const line of linesB) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !seenLines.has(trimmed)) {
      merged.push(line);
      seenLines.add(trimmed);
    }
  }
  
  return merged.join('\n');
}

function rebuildRuleFile(frontmatter, body) {
  if (!frontmatter.found || !frontmatter.data) {
    return body;
  }
  
  const fmLines = [];
  for (const [k, v] of Object.entries(frontmatter.data)) {
    if (typeof v === 'boolean') fmLines.push(`${k}: ${v}`);
    else if (typeof v === 'string' && (v.startsWith('[') || v === 'true' || v === 'false')) fmLines.push(`${k}: ${v}`);
    else fmLines.push(`${k}: ${v}`);
  }
  
  return `---\n${fmLines.join('\n')}\n---\n${body}`;
}

function addConflictAnnotation(content, conflictFile, reason) {
  const annotation = `<!-- cursor-doctor: conflicts with ${conflictFile} — review manually -->\n`;
  
  // Check if already annotated
  if (content.includes('cursor-doctor: conflicts with')) {
    return content;
  }
  
  // Add after frontmatter if present
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n/);
  if (fmMatch) {
    const fm = fmMatch[0];
    const rest = content.slice(fm.length);
    return fm + annotation + rest;
  }
  
  // Otherwise add at top
  return annotation + content;
}

module.exports = { autoFix, fixFrontmatter, splitOversizedFile };
