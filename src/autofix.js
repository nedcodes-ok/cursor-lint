const fs = require('fs');
const path = require('path');
const { lintProject, parseFrontmatter } = require('./index');
const { loadRules, findRedundancy, findConflicts } = require('./audit');
const { getTemplate } = require('./templates');
const { showStats } = require('./stats');

// ═══════════════════════════════════════════════════════════════════════════
// FRONTMATTER FIXES (7)
// ═══════════════════════════════════════════════════════════════════════════

// 1. Fix boolean strings: "true" → true, "false" → false
function fixBooleanStrings(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found || !fm.data) return { content, changes };
  
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { content, changes };
  
  let yaml = match[1];
  let modified = false;
  
  // Fix alwaysApply: "true" or "false" (case-insensitive)
  if (fm.data.alwaysApply && typeof fm.data.alwaysApply === 'string') {
    const lowerValue = fm.data.alwaysApply.toLowerCase();
    if (lowerValue === 'true' || lowerValue === 'false') {
      const properValue = lowerValue === 'true' ? 'true' : 'false';
      // Case-insensitive replacement - match any case variation
      yaml = yaml.replace(/^alwaysApply:\s*["']?(true|false)["']?$/im, `alwaysApply: ${properValue}`);
      changes.push('Fixed boolean string in alwaysApply');
      modified = true;
    }
  }
  
  if (modified) {
    content = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
  }
  
  return { content, changes };
}

// 2. Fix frontmatter tabs: replace tabs with spaces (preserving key: value format)
function fixFrontmatterTabs(content) {
  const changes = [];
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  
  if (!match) return { content, changes };
  
  const yaml = match[1];
  if (yaml.includes('\t')) {
    // Replace tabs but normalize "key:\t+value" to "key: value" (single space)
    const lines = yaml.split('\n');
    const fixed = lines.map(line => {
      // For "key:\tvalue" pattern, normalize to "key: value"
      return line.replace(/^(\w+):\t+/g, '$1: ').replace(/\t/g, '  ');
    }).join('\n');
    content = content.replace(/^---\n[\s\S]*?\n---/, `---\n${fixed}\n---`);
    changes.push('Replaced tabs with spaces in frontmatter');
  }
  
  return { content, changes };
}

// 3. Fix comma-separated globs: convert to YAML array
function fixCommaSeparatedGlobs(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found || !fm.data) return { content, changes };
  
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { content, changes };
  
  let yaml = match[1];
  
  // Match globs: "*.ts, *.tsx" pattern (comma-separated string)
  const globMatch = yaml.match(/^globs:\s*["']([^"']*,\s*[^"']*)["']\s*$/m);
  if (globMatch) {
    const globString = globMatch[1];
    const globs = globString.split(',').map(g => g.trim()).filter(g => g.length > 0);
    
    const yamlArray = globs.map(g => `  - "${g}"`).join('\n');
    yaml = yaml.replace(/^globs:.*$/m, `globs:\n${yamlArray}`);
    content = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
    changes.push('Converted comma-separated globs to YAML array');
  }
  
  return { content, changes };
}

// 4. Fix empty globs array: remove the globs line
function fixEmptyGlobsArray(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found || !fm.data) return { content, changes };
  
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { content, changes };
  
  let yaml = match[1];
  
  // Match globs: [] pattern
  if (/^globs:\s*\[\s*\]\s*$/m.test(yaml)) {
    yaml = yaml.replace(/^globs:\s*\[\s*\]\s*\n?/m, '');
    content = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
    changes.push('Removed empty globs array');
  }
  
  return { content, changes };
}

// 5. Fix description with markdown: strip *, _, `, #, [, ]
function fixDescriptionMarkdown(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found || !fm.data || !fm.data.description) return { content, changes };
  
  const desc = fm.data.description;
  if (/[*_`#\[\]]/.test(desc)) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return { content, changes };
    
    let yaml = match[1];
    const cleanDesc = desc.replace(/[*_`#\[\]]/g, '');
    
    // Replace the description line
    yaml = yaml.replace(/^description:.*$/m, `description: ${cleanDesc}`);
    content = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
    changes.push('Removed markdown formatting from description');
  }
  
  return { content, changes };
}

// 6. Fix unknown frontmatter keys: remove unknown keys
function fixUnknownFrontmatterKeys(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found || !fm.data) return { content, changes };
  
  const validKeys = ['description', 'globs', 'alwaysApply'];
  const unknownKeys = Object.keys(fm.data).filter(k => !validKeys.includes(k));
  
  if (unknownKeys.length === 0) return { content, changes };
  
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { content, changes };
  
  let yaml = match[1];
  const lines = yaml.split('\n');
  const filteredLines = [];
  
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      filteredLines.push(line);
      continue;
    }
    
    const key = line.slice(0, colonIdx).trim();
    if (validKeys.includes(key) || !key) {
      filteredLines.push(line);
    } else {
      changes.push(`Removed unknown frontmatter key: ${key}`);
    }
  }
  
  yaml = filteredLines.join('\n');
  content = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
  
  return { content, changes };
}

// 7. Fix description contains "rule": strip "Rule for " or "Rules for "
function fixDescriptionRule(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found || !fm.data || !fm.data.description) return { content, changes };
  
  const desc = fm.data.description;
  const patterns = [/^Rules?\s+for\s+/i, /^Rules?:\s*/i];
  
  for (const pattern of patterns) {
    if (pattern.test(desc)) {
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (!match) return { content, changes };
      
      let yaml = match[1];
      const cleanDesc = desc.replace(pattern, '');
      
      yaml = yaml.replace(/^description:.*$/m, `description: ${cleanDesc}`);
      content = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
      changes.push('Removed redundant "Rule for" from description');
      break;
    }
  }
  
  return { content, changes };
}

// ═══════════════════════════════════════════════════════════════════════════
// BODY FIXES (7)
// ═══════════════════════════════════════════════════════════════════════════

// 8. Fix excessive blank lines: collapse 3+ to 2
function fixExcessiveBlankLines(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found) return { content, changes };
  
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!fmMatch) return { content, changes };
  
  const frontmatter = fmMatch[0];
  let body = content.slice(frontmatter.length);
  
  if (/\n\n\n\n/.test(body)) {
    body = body.replace(/\n\n\n+/g, '\n\n');
    content = frontmatter + body;
    changes.push('Collapsed excessive blank lines');
  }
  
  return { content, changes };
}

// 9. Fix trailing whitespace: trim trailing spaces/tabs from each line
function fixTrailingWhitespace(content) {
  const changes = [];
  const lines = content.split('\n');
  let modified = false;
  
  const fixedLines = lines.map(line => {
    if (line !== line.trimEnd()) {
      modified = true;
      return line.trimEnd();
    }
    return line;
  });
  
  if (modified) {
    content = fixedLines.join('\n');
    changes.push('Removed trailing whitespace');
  }
  
  return { content, changes };
}

// 10. Fix please/thank you: remove polite language
function fixPleaseThankYou(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found) return { content, changes };
  
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!fmMatch) return { content, changes };
  
  const frontmatter = fmMatch[0];
  let body = content.slice(frontmatter.length);
  let modified = false;
  
  const lines = body.split('\n');
  const fixedLines = lines.map(line => {
    const trimmed = line.trim();
    
    // Lines starting with "Thank you" / "Thanks" — remove entirely
    if (/^thank\s*(you|s)\b/i.test(trimmed)) {
      modified = true;
      return null;
    }
    
    // "Please X" at start of line → "X" (capitalize first word)
    if (/^please\s+/i.test(trimmed)) {
      modified = true;
      const rest = trimmed.replace(/^please\s+/i, '');
      return line.replace(trimmed, rest.charAt(0).toUpperCase() + rest.slice(1));
    }
    
    // "X please" at end → "X"
    if (/\s+please[.!]?\s*$/i.test(trimmed)) {
      modified = true;
      return line.replace(/,?\s+please([.!]?)\s*$/i, '$1');
    }
    
    return line;
  }).filter(l => l !== null);
  
  if (modified) {
    body = fixedLines.join('\n');
    content = frontmatter + body;
    changes.push('Removed please/thank you');
  }
  
  return { content, changes };
}

// 11. Fix first person: "I want you to use X" → "Use X"
function fixFirstPerson(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found) return { content, changes };
  
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!fmMatch) return { content, changes };
  
  const frontmatter = fmMatch[0];
  let body = content.slice(frontmatter.length);
  let modified = false;
  
  const lines = body.split('\n');
  const fixedLines = lines.map(line => {
    const patterns = [
      /^(\s*)I want you to\s+/i,
      /^(\s*)I need you to\s+/i,
      /^(\s*)I'd like you to\s+/i,
      /^(\s*)My preference is (to\s+)?/i,
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        modified = true;
        const indent = match[1] || '';
        const rest = line.slice(match[0].length);
        // Capitalize the first letter of the remaining text
        return indent + rest.charAt(0).toUpperCase() + rest.slice(1);
      }
    }
    return line;
  });
  
  if (modified) {
    body = fixedLines.join('\n');
    content = frontmatter + body;
    changes.push('Removed first person language');
  }
  
  return { content, changes };
}

// 12. Fix commented-out HTML: remove <!-- --> blocks
function fixCommentedHTML(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found) return { content, changes };
  
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!fmMatch) return { content, changes };
  
  const frontmatter = fmMatch[0];
  let body = content.slice(frontmatter.length);
  
  if (/<!--[\s\S]*?-->/.test(body)) {
    body = body.replace(/<!--[\s\S]*?-->/g, '');
    content = frontmatter + body;
    changes.push('Removed commented-out HTML sections');
  }
  
  return { content, changes };
}

// 13. Fix unclosed code blocks: add closing ``` if odd count
function fixUnclosedCodeBlocks(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found) return { content, changes };
  
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!fmMatch) return { content, changes };
  
  const frontmatter = fmMatch[0];
  let body = content.slice(frontmatter.length);
  
  const markers = body.match(/```/g);
  if (markers && markers.length % 2 !== 0) {
    body += '\n```';
    content = frontmatter + body;
    changes.push('Added closing code block marker');
  }
  
  return { content, changes };
}

// 14. Fix inconsistent list markers: normalize to -
function fixInconsistentListMarkers(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found) return { content, changes };
  
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!fmMatch) return { content, changes };
  
  const frontmatter = fmMatch[0];
  let body = content.slice(frontmatter.length);
  let modified = false;
  
  // Check if mixing -, *, +
  const hasDash = /^\s*-\s+/m.test(body);
  const hasStar = /^\s*\*\s+/m.test(body);
  const hasPlus = /^\s*\+\s+/m.test(body);
  
  const markerCount = [hasDash, hasStar, hasPlus].filter(Boolean).length;
  
  if (markerCount > 1) {
    // Normalize all to -
    body = body.replace(/^(\s*)\*(\s+)/gm, '$1-$2');
    body = body.replace(/^(\s*)\+(\s+)/gm, '$1-$2');
    content = frontmatter + body;
    changes.push('Normalized list markers to -');
  }
  
  return { content, changes };
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOB FIXES (4)
// ═══════════════════════════════════════════════════════════════════════════

// 15. Fix backslashes in globs: replace \ with /
function fixGlobBackslashes(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found || !fm.data || !fm.data.globs) return { content, changes };
  
  const globs = Array.isArray(fm.data.globs) ? fm.data.globs : [fm.data.globs];
  const hasBackslash = globs.some(g => typeof g === 'string' && g.includes('\\'));
  
  if (!hasBackslash) return { content, changes };
  
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { content, changes };
  
  let yaml = match[1];
  
  // Replace backslashes in glob patterns with forward slashes
  const lines = yaml.split('\n');
  const fixedLines = lines.map(line => {
    if (line.trim().startsWith('-') && line.includes('\\')) {
      // Replace all backslashes with forward slashes
      let fixed = line.replace(/\\/g, '/');
      // Clean up any double slashes that might result (but preserve :// for URLs)
      // Use negative lookbehind to avoid matching ://
      fixed = fixed.replace(/(?<!:)\/\//g, '/');
      return fixed;
    }
    return line;
  });
  
  yaml = fixedLines.join('\n');
  content = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
  changes.push('Replaced backslashes with forward slashes in globs');
  
  return { content, changes };
}

// 16. Fix trailing slash in globs: remove trailing /
function fixGlobTrailingSlash(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found || !fm.data || !fm.data.globs) return { content, changes };
  
  const globs = Array.isArray(fm.data.globs) ? fm.data.globs : [fm.data.globs];
  const hasTrailing = globs.some(g => typeof g === 'string' && g.endsWith('/'));
  
  if (!hasTrailing) return { content, changes };
  
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { content, changes };
  
  let yaml = match[1];
  // Fix YAML array items: - "path/" → - "path"
  yaml = yaml.replace(/^(\s*-\s*"[^"]*?)\/("\s*)$/gm, '$1$2');
  // Fix inline array items: "path/" → "path"
  yaml = yaml.replace(/("[^"]*?)\/("[\s,\]])/g, '$1$2');
  
  content = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
  changes.push('Removed trailing slashes from globs');
  
  return { content, changes };
}

// 17. Fix ./ prefix in globs: remove leading ./
function fixGlobDotSlash(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found || !fm.data || !fm.data.globs) return { content, changes };
  
  const globs = Array.isArray(fm.data.globs) ? fm.data.globs : [fm.data.globs];
  const hasDotSlash = globs.some(g => typeof g === 'string' && g.startsWith('./'));
  
  if (!hasDotSlash) return { content, changes };
  
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { content, changes };
  
  let yaml = match[1];
  // Fix YAML array items: - "./src/*.ts" → - "src/*.ts"
  yaml = yaml.replace(/^(\s*-\s*")\.\//gm, '$1');
  // Fix inline string: globs: "./src/*.ts" → globs: "src/*.ts"
  yaml = yaml.replace(/(globs:\s*")\.\//g, '$1');
  
  content = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
  changes.push('Removed ./ prefix from globs');
  
  return { content, changes };
}

// 18. Fix regex syntax in globs: \.ts$ → *.ts
function fixGlobRegexSyntax(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found || !fm.data || !fm.data.globs) return { content, changes };
  
  const globs = Array.isArray(fm.data.globs) ? fm.data.globs : [fm.data.globs];
  // Check if any glob looks like regex (has \. or $ or ^)
  const hasRegex = globs.some(g => typeof g === 'string' && (/\\\./.test(g) || /\$$/.test(g) || /^\^/.test(g)));
  
  if (!hasRegex) return { content, changes };
  
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { content, changes };
  
  let yaml = match[1];
  let modified = false;
  
  // Replace regex-style glob patterns within quoted strings in YAML
  // Match: "\.ext$" and convert to "*.ext"
  const lines = yaml.split('\n');
  const fixedLines = lines.map(line => {
    // Only process lines that contain glob values
    if (!line.includes('"') || (!line.includes('\\.') && !line.includes('$'))) return line;
    
    return line.replace(/"([^"]+)"/g, (fullMatch, glob) => {
      let fixed = glob;
      // \.ext$ → *.ext
      fixed = fixed.replace(/^\\\.([\w]+)\$?$/, '*.$1');
      // ^something → something
      fixed = fixed.replace(/^\^/, '');
      // trailing $ → remove
      fixed = fixed.replace(/\$$/, '');
      
      if (fixed !== glob) {
        modified = true;
        return `"${fixed}"`;
      }
      return fullMatch;
    });
  });
  
  if (modified) {
    yaml = fixedLines.join('\n');
    content = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
    changes.push('Converted regex syntax to glob syntax');
  }
  
  return { content, changes };
}

// Legacy fixFrontmatter (kept for backward compatibility)
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
  
  // All fixers in order (simple fixers that don't need filename)
  const fixers = [
    fixBooleanStrings,
    fixFrontmatterTabs,
    fixCommaSeparatedGlobs,
    fixEmptyGlobsArray,
    fixDescriptionMarkdown,
    fixUnknownFrontmatterKeys,
    fixDescriptionRule,
    fixDescriptionSentence,
    fixExcessiveBlankLines,
    fixTrailingWhitespace,
    fixPleaseThankYou,
    fixFirstPerson,
    fixCommentedHTML,
    fixUnclosedCodeBlocks,
    fixInconsistentListMarkers,
    fixGlobRegexSyntax,
    fixGlobBackslashes,
    fixGlobTrailingSlash,
    fixGlobDotSlash,
    fixOldCursorrules,
    fixTodoComments,
    fixNumberedLists,
    fixInconsistentHeadings,
    fixDeeplyNestedHeadings,
    fixMissingAlwaysApply,
    fixAlwaysApplyWithSpecificGlobs,
    fixWillNeverLoad,
    fixBodyStartsWithDescription,
    fixRepeatedInstruction,
    fixBrokenMarkdownLinks,
  ];
  
  // Fixers that need filename
  const filenameFixers = [
    fixMissingFrontmatter,
    fixMissingDescription,
    fixDescriptionIdenticalToFilename,
  ];
  
  // 1. Apply all fixers to each .mdc file
  const entries = fs.readdirSync(rulesDir);
  
  for (const entry of entries) {
    if (!entry.endsWith('.mdc')) continue;
    
    const filePath = path.join(rulesDir, entry);
    let content = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const original = content;
    const allChanges = [];
    
    // Apply each simple fixer in sequence
    for (const fixer of fixers) {
      const result = fixer(content);
      content = result.content;
      allChanges.push(...result.changes);
    }
    
    // Apply filename-aware fixers
    for (const fixer of filenameFixers) {
      const result = fixer(content, entry);
      content = result.content;
      allChanges.push(...result.changes);
    }
    
    // Legacy frontmatter fixer (for cases not covered by new fixers)
    const legacyFixed = fixFrontmatter(content);
    if (legacyFixed !== content) {
      content = legacyFixed;
      allChanges.push('frontmatter repaired');
    }
    
    if (content !== original) {
      if (!options.dryRun) {
        fs.writeFileSync(filePath, content, 'utf-8');
      }
      results.fixed.push({ file: entry, changes: allChanges });
    }
  }
  
  // 1b. Fix non-kebab filenames (rename files)
  for (const entry of entries) {
    if (!entry.endsWith('.mdc')) continue;
    
    const basename = entry.replace(/\.mdc$/, '');
    
    // Check if filename is not kebab-case
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(basename)) {
      // Convert to kebab-case
      let kebab = basename
        .replace(/([A-Z])/g, '-$1')  // CamelCase → -camel-case
        .replace(/_/g, '-')           // snake_case → snake-case
        .toLowerCase()
        .replace(/^-/, '')            // Remove leading dash
        .replace(/-+/g, '-');         // Collapse multiple dashes
      
      const newName = kebab + '.mdc';
      
      if (newName !== entry && !fs.existsSync(path.join(rulesDir, newName))) {
        if (!options.dryRun) {
          fs.renameSync(path.join(rulesDir, entry), path.join(rulesDir, newName));
        }
        results.fixed.push({ file: entry, changes: [`Renamed to ${newName} (kebab-case)`] });
      }
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
    
    if (r.overlapPct >= 90) {
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

// Helper: kebab-case to Title Case
function kebabToTitleCase(str) {
  return str.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

// Helper: get filename without extension
function getFilenameFromContent(content, filename) {
  if (filename) {
    return filename.replace(/\.mdc$/, '');
  }
  return 'rule';
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW FIXERS (v1.10.0+)
// ═══════════════════════════════════════════════════════════════════════════

// 19. Fix missing frontmatter: add default frontmatter if none exists
function fixMissingFrontmatter(content, filename) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (fm.found) return { content, changes };
  
  // No frontmatter - add default
  const basename = filename ? filename.replace(/\.mdc$/, '') : 'rule';
  const description = kebabToTitleCase(basename);
  
  content = `---\ndescription: ${description}\nalwaysApply: true\n---\n${content}`;
  changes.push('Added missing frontmatter with default values');
  
  return { content, changes };
}

// 20. Fix missing description: add description based on filename
function fixMissingDescription(content, filename) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found || !fm.data) return { content, changes };
  if (fm.data.description && typeof fm.data.description === 'string' && fm.data.description.trim().length > 0) return { content, changes };
  
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { content, changes };
  
  let yaml = match[1];
  const basename = filename ? filename.replace(/\.mdc$/, '') : 'rule';
  const description = kebabToTitleCase(basename);
  
  // Add or replace description
  if (/^description:/m.test(yaml)) {
    yaml = yaml.replace(/^description:.*$/m, `description: ${description}`);
  } else {
    // Add description as first line
    yaml = `description: ${description}\n${yaml}`;
  }
  
  content = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
  changes.push('Added missing description from filename');
  
  return { content, changes };
}

// 21. Fix missing alwaysApply: add alwaysApply: true if no globs
function fixMissingAlwaysApply(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found || !fm.data) return { content, changes };
  if (fm.data.alwaysApply !== undefined) return { content, changes };
  
  // Check if globs exist
  const hasGlobs = fm.data.globs && (
    Array.isArray(fm.data.globs) ? fm.data.globs.length > 0 : fm.data.globs.trim().length > 0
  );
  
  if (hasGlobs) return { content, changes };
  
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { content, changes };
  
  let yaml = match[1];
  yaml = yaml + '\nalwaysApply: true';
  
  content = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
  changes.push('Added alwaysApply: true (no globs specified)');
  
  return { content, changes };
}

// 22. Fix description sentence: remove trailing period
function fixDescriptionSentence(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found || !fm.data || !fm.data.description) return { content, changes };
  
  const desc = fm.data.description;
  if (typeof desc !== 'string') return { content, changes };
  
  // Skip entirely if description ends with ellipsis
  if (desc.endsWith('...')) return { content, changes };
  
  // Only process if it ends with a period (but not ellipsis)
  if (!desc.endsWith('.')) return { content, changes };
  
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { content, changes };
  
  let yaml = match[1];
  const cleanDesc = desc.slice(0, -1);
  
  yaml = yaml.replace(/^description:.*$/m, `description: ${cleanDesc}`);
  content = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
  changes.push('Removed trailing period from description');
  
  return { content, changes };
}

// 23. Fix old .cursorrules reference: replace with .cursor/rules/
function fixOldCursorrules(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found) return { content, changes };
  
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!fmMatch) return { content, changes };
  
  const frontmatter = fmMatch[0];
  let body = content.slice(frontmatter.length);
  
  if (!/\.cursorrules\b/.test(body)) return { content, changes };
  
  // Track whether we're inside a code block
  const lines = body.split('\n');
  let inCodeBlock = false;
  let modified = false;
  
  const fixedLines = lines.map(line => {
    // Check for code block delimiters
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      return line;
    }
    
    // Skip replacement inside code blocks
    if (inCodeBlock) {
      return line;
    }
    
    // Replace outside code blocks
    if (/\.cursorrules\b/.test(line)) {
      modified = true;
      return line.replace(/\.cursorrules\b/g, '.cursor/rules/');
    }
    
    return line;
  });
  
  if (modified) {
    body = fixedLines.join('\n');
    content = frontmatter + body;
    changes.push('Replaced .cursorrules with .cursor/rules/');
  }
  
  return { content, changes };
}

// 24. Fix TODO comments: remove lines with TODO/FIXME/HACK
function fixTodoComments(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found) return { content, changes };
  
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!fmMatch) return { content, changes };
  
  const frontmatter = fmMatch[0];
  let body = content.slice(frontmatter.length);
  
  const lines = body.split('\n');
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    
    // Keep list items (-, *, or numbered lists) even if they contain TODO
    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      return true;
    }
    
    // Remove lines that START with comment markers followed by TODO/FIXME/HACK
    // OR bare TODO:/FIXME:/HACK: lines (but not list items, already filtered above)
    const shouldRemove = (
      /^\/\/\s*(TODO|FIXME|HACK)/i.test(trimmed) ||
      /^#\s*(TODO|FIXME|HACK)/i.test(trimmed) ||
      /^<!--\s*(TODO|FIXME|HACK)/i.test(trimmed) ||
      /^(TODO|FIXME|HACK):/i.test(trimmed)
    );
    
    return !shouldRemove;
  });
  
  if (filteredLines.length !== lines.length) {
    body = filteredLines.join('\n');
    content = frontmatter + body;
    changes.push('Removed TODO/FIXME/HACK comments');
  }
  
  return { content, changes };
}

// 25. Fix numbered lists: convert 1. 2. 3. to - - -
function fixNumberedLists(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found) return { content, changes };
  
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!fmMatch) return { content, changes };
  
  const frontmatter = fmMatch[0];
  let body = content.slice(frontmatter.length);
  
  if (/^\s*\d+\.\s+/m.test(body)) {
    body = body.replace(/^(\s*)\d+\.\s+/gm, '$1- ');
    content = frontmatter + body;
    changes.push('Converted numbered lists to unordered lists');
  }
  
  return { content, changes };
}

// 26. Fix inconsistent headings: normalize heading levels
function fixInconsistentHeadings(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found) return { content, changes };
  
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!fmMatch) return { content, changes };
  
  const frontmatter = fmMatch[0];
  let body = content.slice(frontmatter.length);
  
  const headings = body.match(/^#{1,6}\s+.+$/gm);
  if (!headings || headings.length < 2) return { content, changes };
  
  const levels = headings.map(h => h.match(/^#+/)[0].length);
  let hasSkip = false;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) {
      hasSkip = true;
      break;
    }
  }
  
  if (!hasSkip) return { content, changes };
  
  // Normalize: ensure no skips (# followed by ### becomes # followed by ##)
  let currentLevel = 1;
  const levelMap = new Map();
  
  for (let i = 0; i < levels.length; i++) {
    const actualLevel = levels[i];
    if (i === 0) {
      levelMap.set(i, actualLevel);
      currentLevel = actualLevel;
    } else {
      const prevLevel = levelMap.get(i - 1);
      if (actualLevel > prevLevel + 1) {
        levelMap.set(i, prevLevel + 1);
      } else {
        levelMap.set(i, actualLevel);
      }
    }
  }
  
  // Replace headings with normalized levels
  let headingIndex = 0;
  body = body.replace(/^#{1,6}\s+(.+)$/gm, (match, text) => {
    const newLevel = levelMap.get(headingIndex);
    headingIndex++;
    return '#'.repeat(newLevel) + ' ' + text;
  });
  
  content = frontmatter + body;
  changes.push('Normalized inconsistent heading levels');
  
  return { content, changes };
}

// 27. Fix deeply nested headings: flatten headings deeper than ###
function fixDeeplyNestedHeadings(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found) return { content, changes };
  
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!fmMatch) return { content, changes };
  
  const frontmatter = fmMatch[0];
  let body = content.slice(frontmatter.length);
  
  if (/^#{4,}\s+/m.test(body)) {
    body = body.replace(/^#{4,}\s+(.+)$/gm, '### $1');
    content = frontmatter + body;
    changes.push('Flattened deeply nested headings to ###');
  }
  
  return { content, changes };
}

// 28. Fix description identical to filename: make it more descriptive
function fixDescriptionIdenticalToFilename(content, filename) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found || !fm.data || !fm.data.description || !filename) return { content, changes };
  
  const basename = filename.replace(/\.mdc$/, '');
  const descNorm = fm.data.description.toLowerCase().replace(/[^a-z0-9]/g, '');
  const filenameNorm = basename.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (descNorm !== filenameNorm) return { content, changes };
  
  // Generate the new description
  const newDescription = kebabToTitleCase(basename);
  
  // Check if new description equals current - if same, return null (no change needed)
  if (newDescription === fm.data.description) return { content, changes };
  
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { content, changes };
  
  let yaml = match[1];
  yaml = yaml.replace(/^description:.*$/m, `description: ${newDescription}`);
  content = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
  changes.push('Improved description (was identical to filename)');
  
  return { content, changes };
}

// 29. Fix alwaysApply true with specific globs: remove alwaysApply
function fixAlwaysApplyWithSpecificGlobs(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found || !fm.data) return { content, changes };
  if (fm.data.alwaysApply !== true || !fm.data.globs) return { content, changes };
  
  const globs = Array.isArray(fm.data.globs) ? fm.data.globs : [fm.data.globs];
  const verySpecific = globs.filter(g => 
    typeof g === 'string' && (
      !g.includes('*') || 
      g.split('/').length > 3 ||
      /\w+\.\w+/.test(g.replace(/\*/g, ''))
    )
  );
  
  if (verySpecific.length === 0) return { content, changes };
  
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { content, changes };
  
  let yaml = match[1];
  yaml = yaml.replace(/^alwaysApply:.*$\n?/m, '');
  
  content = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
  changes.push('Removed alwaysApply (contradicts specific globs)');
  
  return { content, changes };
}

// 30. Fix will-never-load: set alwaysApply to true if false with no globs
function fixWillNeverLoad(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found || !fm.data) return { content, changes };
  if (fm.data.alwaysApply !== false) return { content, changes };
  
  const hasGlobs = fm.data.globs && (
    Array.isArray(fm.data.globs) ? fm.data.globs.length > 0 : fm.data.globs.trim().length > 0
  );
  
  if (hasGlobs) return { content, changes };
  
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { content, changes };
  
  let yaml = match[1];
  yaml = yaml.replace(/^alwaysApply:\s*false\s*$/m, 'alwaysApply: true');
  
  content = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
  changes.push('Changed alwaysApply to true (was false with no globs)');
  
  return { content, changes };
}

// 31. Fix body starts with description: remove duplicate first line
function fixBodyStartsWithDescription(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found || !fm.data || !fm.data.description) return { content, changes };
  
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!fmMatch) return { content, changes };
  
  const frontmatter = fmMatch[0];
  let body = content.slice(frontmatter.length);
  
  const lines = body.split('\n');
  const firstNonEmptyLine = lines.find(line => line.trim().length > 0);
  
  if (firstNonEmptyLine && fm.data.description && typeof fm.data.description === 'string' && firstNonEmptyLine.trim() === fm.data.description.trim()) {
    // Find and remove the duplicate line
    const indexToRemove = lines.findIndex(line => line.trim() === fm.data.description.trim());
    if (indexToRemove !== -1) {
      lines.splice(indexToRemove, 1);
    }
    body = lines.join('\n');
    // Trim leading blank lines after removal
    body = body.replace(/^\n+/, '');
    content = frontmatter + body;
    changes.push('Removed duplicate description from body');
  }
  
  return { content, changes };
}

// 32. Fix repeated instruction: remove duplicate lines
function fixRepeatedInstruction(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found) return { content, changes };
  
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!fmMatch) return { content, changes };
  
  const frontmatter = fmMatch[0];
  let body = content.slice(frontmatter.length);
  
  const lines = body.split('\n');
  const seen = new Set();
  const uniqueLines = [];
  let hasDuplicates = false;
  
  for (const line of lines) {
    const normalized = line.trim().toLowerCase();
    if (normalized.length > 15 && seen.has(normalized)) {
      hasDuplicates = true;
      continue; // Skip duplicate
    }
    uniqueLines.push(line);
    if (normalized.length > 0) {
      seen.add(normalized);
    }
  }
  
  if (hasDuplicates) {
    body = uniqueLines.join('\n');
    content = frontmatter + body;
    changes.push('Removed repeated instructions');
  }
  
  return { content, changes };
}

// 33. Fix broken markdown links: remove broken [text]() links
function fixBrokenMarkdownLinks(content) {
  const changes = [];
  const fm = parseFrontmatter(content);
  
  if (!fm.found) return { content, changes };
  
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!fmMatch) return { content, changes };
  
  const frontmatter = fmMatch[0];
  let body = content.slice(frontmatter.length);
  
  // Match [text]() with empty href
  if (/\[[^\]]+\]\(\s*\)/.test(body)) {
    body = body.replace(/\[([^\]]+)\]\(\s*\)/g, '$1');
    content = frontmatter + body;
    changes.push('Removed broken markdown links (kept text)');
  }
  
  return { content, changes };
}

module.exports = {
  autoFix,
  fixFrontmatter,
  splitOversizedFile,
  // New fixers (v1.8.0+)
  fixBooleanStrings,
  fixFrontmatterTabs,
  fixCommaSeparatedGlobs,
  fixEmptyGlobsArray,
  fixDescriptionMarkdown,
  fixUnknownFrontmatterKeys,
  fixDescriptionRule,
  fixExcessiveBlankLines,
  fixTrailingWhitespace,
  fixPleaseThankYou,
  fixFirstPerson,
  fixCommentedHTML,
  fixUnclosedCodeBlocks,
  fixInconsistentListMarkers,
  fixGlobBackslashes,
  fixGlobTrailingSlash,
  fixGlobDotSlash,
  fixGlobRegexSyntax,
  // New fixers (v1.10.0+)
  fixMissingFrontmatter,
  fixMissingDescription,
  fixMissingAlwaysApply,
  fixDescriptionSentence,
  fixOldCursorrules,
  fixTodoComments,
  fixNumberedLists,
  fixInconsistentHeadings,
  fixDeeplyNestedHeadings,
  fixDescriptionIdenticalToFilename,
  fixAlwaysApplyWithSpecificGlobs,
  fixWillNeverLoad,
  fixBodyStartsWithDescription,
  fixRepeatedInstruction,
  fixBrokenMarkdownLinks,
};
