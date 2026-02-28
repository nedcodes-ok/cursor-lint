const fs = require('fs');
const path = require('path');

const VAGUE_PATTERNS = [
  'write clean code',
  'follow best practices',
  'be consistent',
  'write maintainable code',
  'handle errors properly',
  'use proper naming',
  'keep it simple',
  'write readable code',
  'follow conventions',
  'use good patterns',
  'write efficient code',
  'be careful',
  'think before coding',
  'write good tests',
  'follow solid principles',
  'use common sense',
  'write quality code',
  'follow the style guide',
  'be thorough',
  'write robust code',
  'use good naming',
  'be helpful',
  'use appropriate patterns',
  'be concise',
];

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { found: false, data: null, error: null };

  try {
    const data = {};
    const lines = match[1].split('\n');
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const rawVal = line.slice(colonIdx + 1).trim();
      // Check for bad indentation (key starts with space = likely nested/broken YAML)
      if (line.match(/^\s+\S/) && !line.match(/^\s+-/)) {
        // Indented non-list line where we don't expect it
        const prevLine = lines[lines.indexOf(line) - 1];
        if (prevLine && !prevLine.endsWith(':')) {
          return { found: true, data: null, error: 'Invalid YAML indentation' };
        }
      }
      if (rawVal === 'true') data[key] = true;
      else if (rawVal === 'false') data[key] = false;
      else if (rawVal.startsWith('"') && rawVal.endsWith('"')) data[key] = rawVal.slice(1, -1);
      else data[key] = rawVal;
    }
    return { found: true, data, error: null };
  } catch (e) {
    return { found: true, data: null, error: e.message };
  }
}

// Helper: Get body content after frontmatter
function getBody(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!match) return content;
  return content.slice(match[0].length);
}

// Helper: Calculate similarity between two texts using Jaccard similarity
function similarity(textA, textB) {
  const normalize = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim();
  const normA = normalize(textA);
  const normB = normalize(textB);
  
  // Check if one is substring of the other
  if (normA.includes(normB) || normB.includes(normA)) {
    return 1.0;
  }
  
  // Word-based Jaccard similarity
  const wordsA = new Set(normA.split(/\s+/));
  const wordsB = new Set(normB.split(/\s+/));
  
  if (wordsA.size === 0 && wordsB.size === 0) return 1.0;
  if (wordsA.size === 0 || wordsB.size === 0) return 0.0;
  
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  
  return intersection.size / union.size;
}

async function lintMdcFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const issues = [];

  const fm = parseFrontmatter(content);

  if (!fm.found) {
    issues.push({ severity: 'error', message: 'Missing YAML frontmatter', hint: 'Add --- block with description and alwaysApply: true' });
  } else if (fm.error) {
    issues.push({ severity: 'error', message: `YAML frontmatter error: ${fm.error}`, hint: 'Fix frontmatter indentation/syntax' });
  } else {
    if (!fm.data.alwaysApply) {
      issues.push({ severity: 'error', message: 'Missing alwaysApply: true', hint: 'Add alwaysApply: true to frontmatter for agent mode' });
    }
    if (!fm.data.description) {
      issues.push({ severity: 'warning', message: 'Missing description in frontmatter', hint: 'Add a description so Cursor knows when to apply this rule' });
    }
    if (fm.data.globs && typeof fm.data.globs === 'string' && fm.data.globs.includes(',') && !fm.data.globs.trim().startsWith('[')) {
      issues.push({ severity: 'error', message: 'Globs should be YAML array, not comma-separated string', hint: 'Use globs:\\n  - "*.ts"\\n  - "*.tsx"' });
    }

    // NEW: Frontmatter has unknown keys
    const validKeys = ['description', 'globs', 'alwaysApply'];
    for (const key in fm.data) {
      if (!validKeys.includes(key)) {
        issues.push({
          severity: 'warning',
          message: `Unknown frontmatter key: ${key}`,
          hint: `Valid keys: ${validKeys.join(', ')}. Unknown keys are ignored by Cursor.`,
        });
      }
    }

    // NEW: Description contains markdown formatting
    if (fm.data.description && /[*_`#\[\]]/. test(fm.data.description)) {
      issues.push({
        severity: 'warning',
        message: 'Description contains markdown formatting',
        hint: 'Descriptions should be plain text. Save formatting for the rule body.',
      });
    }

    // NEW: alwaysApply is false with no globs
    if (fm.data.alwaysApply === false && (!fm.data.globs || parseGlobs(fm.data.globs).length === 0)) {
      issues.push({
        severity: 'error',
        message: 'alwaysApply is false with no globs — rule will never trigger',
        hint: 'Either set alwaysApply: true or add globs to specify when this rule applies.',
      });
    }
  }

  // Vague rules
  const contentLower = content.toLowerCase();
  for (const pattern of VAGUE_PATTERNS) {
    const idx = contentLower.indexOf(pattern);
    if (idx !== -1) {
      const lineNum = content.slice(0, idx).split('\n').length;
      issues.push({ severity: 'warning', message: `Vague rule detected: "${pattern}"`, line: lineNum });
    }
  }

  // Get body content for additional checks
  const body = getBody(content);

  // 1. Rule too long
  if (body.length > 2000) {
    issues.push({
      severity: 'warning',
      message: 'Rule body is very long (>2000 chars, ~500+ tokens)',
      hint: 'Shorter, specific rules outperform long generic ones. Consider splitting into focused rules.',
    });
  }

  // NEW: Rule body exceeds 5000 chars (hard error)
  if (body.length > 5000) {
    issues.push({
      severity: 'error',
      message: 'Rule body exceeds 5000 chars (~1250 tokens)',
      hint: 'Rules this long waste context and confuse the model. Split into multiple focused rules.',
    });
  }

  // 2. No examples
  const hasCodeBlocks = /```/.test(body) || /\n {4,}\S/.test(body);
  if (body.length > 200 && !hasCodeBlocks) {
    issues.push({
      severity: 'warning',
      message: 'Rule has no code examples',
      hint: 'Rules with examples get followed more reliably by the AI model.',
    });
  }

  // 3. Empty rule body
  if (fm.found && body.trim().length === 0) {
    issues.push({
      severity: 'error',
      message: 'Rule file has frontmatter but no instructions',
      hint: 'Add rule instructions after the --- frontmatter block.',
    });
  }

  // 4. Description too short
  if (fm.data && fm.data.description && fm.data.description.length < 10) {
    issues.push({
      severity: 'warning',
      message: 'Description is very short (<10 chars)',
      hint: 'A descriptive description helps Cursor decide when to apply this rule.',
    });
  }

  // 5. Description too long
  if (fm.data && fm.data.description && fm.data.description.length > 200) {
    issues.push({
      severity: 'warning',
      message: 'Description is very long (>200 chars)',
      hint: 'Keep descriptions concise. Put detailed instructions in the rule body, not the description.',
    });
  }

  // 6. Glob pattern issues
  if (fm.data && fm.data.globs) {
    const globs = parseGlobs(fm.data.globs);
    for (const glob of globs) {
      // Overly broad glob
      if (glob === '*' || glob === '**') {
        issues.push({
          severity: 'warning',
          message: 'Overly broad glob pattern',
          hint: 'This matches everything. Consider using more specific patterns or just alwaysApply: true.',
        });
      }
      // Glob contains spaces
      if (glob.includes(' ') && !glob.includes('"') && !glob.includes("'")) {
        issues.push({
          severity: 'warning',
          message: 'Glob pattern contains spaces',
          hint: 'Glob patterns with spaces may not match correctly.',
        });
      }
      // Glob is *.
      if (glob === '*.') {
        issues.push({
          severity: 'warning',
          message: 'Glob pattern has no file extension after dot',
        });
      }

      // NEW: Glob uses Windows backslashes
      if (glob.includes('\\')) {
        issues.push({
          severity: 'warning',
          message: `Glob pattern uses Windows backslashes: ${glob}`,
          hint: 'Use forward slashes for cross-platform compatibility.',
        });
      }

      // NEW: Glob has trailing slash
      if (glob.endsWith('/')) {
        issues.push({
          severity: 'warning',
          message: `Glob pattern has trailing slash: ${glob}`,
          hint: 'Trailing slashes are not valid glob syntax. Remove the trailing /.',
        });
      }

      // NEW: Glob starts with ./
      if (glob.startsWith('./')) {
        issues.push({
          severity: 'info',
          message: `Glob starts with ./: ${glob}`,
          hint: 'Cursor resolves globs from project root. The ./ prefix is unnecessary.',
        });
      }
    }

    // NEW: Multiple globs that could be simplified
    if (globs.length >= 2) {
      const extensions = globs.map(g => {
        const match = g.match(/^\*\.(\w+)$/);
        return match ? match[1] : null;
      }).filter(Boolean);
      
      if (extensions.length >= 2 && extensions.length === globs.length) {
        issues.push({
          severity: 'info',
          message: `Multiple globs could be simplified: ${globs.join(', ')}`,
          hint: `Consider using ["*.{${extensions.join(',')}}"] for cleaner syntax.`,
        });
      }
    }
  }

  // 7. alwaysApply + globs info
  if (fm.data && fm.data.alwaysApply === true && fm.data.globs) {
    const globs = parseGlobs(fm.data.globs);
    if (globs.length > 0) {
      issues.push({
        severity: 'info',
        message: 'alwaysApply is true with globs set',
        hint: 'When alwaysApply is true, globs serve as a hint to the model but don\'t filter. This is fine if intentional.',
      });
    }
  }

  // 8. Rule body is just a URL
  const bodyTrimmed = body.trim();
  const urlMatch = bodyTrimmed.match(/^https?:\/\//);
  if (urlMatch) {
    const lines = bodyTrimmed.split('\n').filter(line => line.trim().length > 0);
    const nonUrlLines = lines.filter(line => !line.trim().match(/^https?:\/\//));
    if (nonUrlLines.length < 2) {
      issues.push({
        severity: 'warning',
        message: 'Rule body appears to be just a URL',
        hint: 'Cursor cannot follow URLs. Put the actual instructions in the rule body.',
      });
    }
  }

  // NEW: Body/Content Rules
  
  // Rule body contains XML tags
  if (/<[^>]+>/.test(body) && !hasCodeBlocks) {
    const xmlTags = body.match(/<\w+[^>]*>/g);
    if (xmlTags && xmlTags.length > 0) {
      issues.push({
        severity: 'warning',
        message: 'Rule body contains XML/HTML tags',
        hint: 'Cursor doesn\'t process XML/HTML in rules. Use markdown or plain text instead.',
      });
    }
  }

  // Rule has broken markdown links
  if (/\]\[/.test(body) || /\[[^\]]*\]\([^\)]*$/.test(body)) {
    issues.push({
      severity: 'warning',
      message: 'Rule body has broken markdown links',
      hint: 'Fix link syntax: [text](url)',
    });
  }

  // Rule body starts with the description repeated
  if (fm.data && fm.data.description && body.trim().startsWith(fm.data.description)) {
    issues.push({
      severity: 'warning',
      message: 'Rule body starts with description repeated',
      hint: 'Redundant content wastes tokens. Remove the duplicate description from the body.',
    });
  }

  // Rule contains TODO/FIXME/HACK comments
  if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(body)) {
    issues.push({
      severity: 'warning',
      message: 'Rule contains TODO/FIXME/HACK comments',
      hint: 'Unfinished rules confuse the model. Finish the rule or remove it.',
    });
  }

  // Rule has inconsistent heading levels
  const headings = body.match(/^#{1,6}\s+.+/gm);
  if (headings && headings.length >= 2) {
    const levels = headings.map(h => h.match(/^#+/)[0].length);
    const firstLevel = levels[0];
    let hasSkip = false;
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] > firstLevel + 1 && levels[i - 1] < levels[i] - 1) {
        hasSkip = true;
        break;
      }
    }
    if (hasSkip) {
      issues.push({
        severity: 'warning',
        message: 'Rule has inconsistent heading levels (jumps from # to ###)',
        hint: 'Use consistent heading hierarchy for better structure.',
      });
    }
  }

  // Rule body has excessive blank lines
  if (/\n\n\n\n/.test(body)) {
    issues.push({
      severity: 'info',
      message: 'Rule body has excessive blank lines (>3 consecutive)',
      hint: 'Excessive whitespace wastes tokens. Use 1-2 blank lines for separation.',
    });
  }

  // Rule uses numbered lists where order doesn't matter
  const numberedLists = body.match(/\n\d+\.\s+/g);
  if (numberedLists && numberedLists.length >= 5) {
    // Check if the list seems unordered (no sequence words like "first", "then", "next")
    const listContext = body.toLowerCase();
    const hasSequenceWords = /\b(first|second|third|then|next|finally|after|before)\b/.test(listContext);
    if (!hasSequenceWords) {
      issues.push({
        severity: 'info',
        message: 'Rule uses numbered lists where order may not matter',
        hint: 'Bullet lists are more flexible for AI and clearer when order is unimportant.',
      });
    }
  }

  // NEW: Prompt Engineering Rules

  // Rule uses weak language
  const weakPatterns = [
    { pattern: /\b(try to|maybe|consider|perhaps|possibly|might want to)\b/i, example: 'try to/maybe/consider' },
  ];
  for (const { pattern, example } of weakPatterns) {
    if (pattern.test(body)) {
      issues.push({
        severity: 'warning',
        message: `Rule uses weak language: "${example}"`,
        hint: 'AI models follow commands better than suggestions. Use imperative mood: "Do X" instead of "try to do X".',
      });
    }
  }

  // Rule uses negations without alternatives
  const negationMatches = body.match(/\b(don't|do not|never|avoid)\s+(?:use|do|write)\s+\w+/gi);
  if (negationMatches && negationMatches.length > 0) {
    // Check if there's a corresponding "instead" or "use X instead"
    const hasAlternative = /instead|rather|prefer|use \w+ (?:rather|instead)/.test(body.toLowerCase());
    if (!hasAlternative) {
      issues.push({
        severity: 'warning',
        message: 'Rule uses negations without alternatives',
        hint: 'Instead of "don\'t use X", say "use Y instead of X" to give the model clear direction.',
      });
    }
  }

  // Rule has no clear actionable instructions
  const imperativeVerbs = /\b(use|write|create|add|remove|ensure|check|validate|follow|apply|implement)\b/i;
  if (body.length > 100 && !imperativeVerbs.test(body)) {
    issues.push({
      severity: 'warning',
      message: 'Rule has no clear actionable instructions',
      hint: 'Rules should contain clear commands. Use imperative verbs: use, write, create, ensure, etc.',
    });
  }

  // Rule uses first person
  if (/\b(I want|I need|I'd like|my preference)\b/i.test(body)) {
    issues.push({
      severity: 'info',
      message: 'Rule uses first person ("I want you to...")',
      hint: 'First person wastes tokens. Use direct commands: "Use X" instead of "I want you to use X".',
    });
  }

  // Rule uses please/thank you
  if (/\b(please|thank you|thanks)\b/i.test(body)) {
    issues.push({
      severity: 'info',
      message: 'Rule uses please/thank you',
      hint: 'Politeness wastes tokens. AI models don\'t need courtesy words. Be direct.',
    });
  }

  // NEW: Rule references a file path that doesn't exist
  const filePathMatches = body.match(/[\.\/\w-]+\.(ts|js|tsx|jsx|py|go|rs|java|md|json|yml|yaml|toml|config|conf)/g);
  if (filePathMatches) {
    const projectRoot = path.dirname(path.dirname(filePath)); // Assuming filePath is in .cursor/rules/
    for (const match of filePathMatches) {
      // Skip URLs and code examples
      if (match.startsWith('http') || /```/.test(body.substring(0, body.indexOf(match)))) continue;
      
      const potentialPath = path.join(projectRoot, match);
      if (!fs.existsSync(potentialPath) && match.includes('/')) {
        issues.push({
          severity: 'info',
          message: `Rule references file that may not exist: ${match}`,
          hint: 'Verify this file path is correct or remove the reference if outdated.',
        });
      }
    }
  }

  // NEW: Rule mixes multiple concerns
  const concernKeywords = {
    testing: /\b(test|spec|jest|mocha|vitest|cypress|playwright)\b/i,
    styling: /\b(css|style|styled|tailwind|emotion|sass|less)\b/i,
    naming: /\b(naming|name|identifier|variable name|function name)\b/i,
    types: /\b(type|interface|generic|typescript|type safety)\b/i,
    architecture: /\b(architecture|structure|organization|folder|directory)\b/i,
  };
  
  const matchedConcerns = [];
  for (const [concern, pattern] of Object.entries(concernKeywords)) {
    if (pattern.test(body)) {
      matchedConcerns.push(concern);
    }
  }
  
  if (matchedConcerns.length >= 3) {
    issues.push({
      severity: 'warning',
      message: `Rule mixes multiple concerns: ${matchedConcerns.join(', ')}`,
      hint: 'Rules that cover too many topics are harder for the AI to apply correctly. Split into focused rules.',
    });
  }

  // NEW: Rule has conflicting instructions within the same file
  const bodyLower = body.toLowerCase();
  const conflictPairs = [
    { a: 'always use semicolons', b: 'no semicolons', subject: 'semicolons' },
    { a: 'use single quotes', b: 'use double quotes', subject: 'quotes' },
    { a: 'prefer const', b: 'prefer let', subject: 'const vs let' },
    { a: 'use async/await', b: 'use promises', subject: 'async patterns' },
    { a: 'use function', b: 'use arrow function', subject: 'function syntax' },
  ];
  
  for (const { a, b, subject } of conflictPairs) {
    if (bodyLower.includes(a) && bodyLower.includes(b)) {
      issues.push({
        severity: 'error',
        message: `Rule has conflicting instructions about ${subject}`,
        hint: `Rule contains both "${a}" and "${b}". Choose one approach.`,
      });
    }
  }

  return { file: filePath, issues };
}

async function lintSkillFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const issues = [];

  const fm = parseFrontmatter(content);

  if (!fm.found) {
    issues.push({ severity: 'error', message: 'Missing YAML frontmatter', hint: 'Add --- block with name and description fields' });
  } else if (fm.error) {
    issues.push({ severity: 'error', message: `YAML frontmatter error: ${fm.error}`, hint: 'Fix frontmatter syntax' });
  } else {
    if (!fm.data.name) {
      issues.push({ severity: 'error', message: 'Missing name in frontmatter', hint: 'Add name: your-skill-name to frontmatter' });
    }
    if (!fm.data.description) {
      issues.push({ severity: 'error', message: 'Missing description in frontmatter', hint: 'Add a description so the agent knows when to use this skill' });
    }
    if (fm.data.description && fm.data.description.length < 20) {
      issues.push({ severity: 'warning', message: 'Description is very short', hint: 'A longer description helps agents understand when to invoke this skill' });
    }
  }

  // Check body content
  const body = fm.found ? content.replace(/^---\n[\s\S]*?\n---\n?/, '') : content;

  if (body.trim().length === 0) {
    issues.push({ severity: 'error', message: 'Skill file has no body content', hint: 'Add instructions for the agent after the frontmatter' });
  } else if (body.trim().length < 50) {
    issues.push({ severity: 'warning', message: 'Skill body is very short (< 50 chars)', hint: 'Skills with more detail produce better agent behavior' });
  }

  // Check for headings (structure)
  const headings = body.match(/^#{1,3}\s+.+/gm);
  if (body.trim().length > 500 && (!headings || headings.length === 0)) {
    issues.push({ severity: 'warning', message: 'Long skill with no headings', hint: 'Add ## sections to organize instructions for better agent comprehension' });
  }

  // Vague rules (same as .mdc)
  const contentLower = content.toLowerCase();
  for (const pattern of VAGUE_PATTERNS) {
    const idx = contentLower.indexOf(pattern);
    if (idx !== -1) {
      const lineNum = content.slice(0, idx).split('\n').length;
      issues.push({ severity: 'warning', message: `Vague instruction: "${pattern}"`, line: lineNum });
    }
  }

  return { file: filePath, issues };
}

function findSkillDirs(dir) {
  const skillDirs = [];
  // .claude/skills/ (Claude Code)
  const claudeSkills = path.join(dir, '.claude', 'skills');
  if (fs.existsSync(claudeSkills)) skillDirs.push(claudeSkills);
  // .cursor/skills/ (Cursor agent skills - future)
  const cursorSkills = path.join(dir, '.cursor', 'skills');
  if (fs.existsSync(cursorSkills)) skillDirs.push(cursorSkills);
  // skills/ at project root (skills.sh convention)
  const rootSkills = path.join(dir, 'skills');
  if (fs.existsSync(rootSkills) && fs.statSync(rootSkills).isDirectory()) {
    // Only if it looks like agent skills (has SKILL.md files in subdirs)
    try {
      const entries = fs.readdirSync(rootSkills);
      const hasSkillMd = entries.some(e => {
        const sub = path.join(rootSkills, e);
        return fs.statSync(sub).isDirectory() && fs.existsSync(path.join(sub, 'SKILL.md'));
      });
      if (hasSkillMd) skillDirs.push(rootSkills);
    } catch {}
  }
  return skillDirs;
}

function collectSkillFiles(skillDirs) {
  const files = [];
  for (const dir of skillDirs) {
    try {
      for (const entry of fs.readdirSync(dir)) {
        const sub = path.join(dir, entry);
        if (fs.statSync(sub).isDirectory()) {
          const skillMd = path.join(sub, 'SKILL.md');
          if (fs.existsSync(skillMd)) files.push(skillMd);
        }
        // Also handle flat SKILL.md files
        if (entry === 'SKILL.md') files.push(path.join(dir, entry));
      }
    } catch {}
  }
  return files;
}

async function lintCursorrules(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const issues = [];

  issues.push({
    severity: 'warning',
    message: '.cursorrules may be ignored in agent mode',
    hint: 'Use .cursor/rules/*.mdc with alwaysApply: true for agent mode compatibility',
  });

  // Vague rules
  const contentLower = content.toLowerCase();
  for (const pattern of VAGUE_PATTERNS) {
    const idx = contentLower.indexOf(pattern);
    if (idx !== -1) {
      const lineNum = content.slice(0, idx).split('\n').length;
      issues.push({ severity: 'warning', message: `Vague rule detected: "${pattern}"`, line: lineNum });
    }
  }

  return { file: filePath, issues };
}

// NEW: Project structure linting
async function lintProjectStructure(dir) {
  const issues = [];
  const rulesDir = path.join(dir, '.cursor', 'rules');
  
  if (!fs.existsSync(rulesDir) || !fs.statSync(rulesDir).isDirectory()) {
    return issues;
  }

  const mdcFiles = fs.readdirSync(rulesDir).filter(f => f.endsWith('.mdc'));
  
  // .cursor/rules/ has no subdirectory organization and >10 rules
  const subdirs = fs.readdirSync(rulesDir).filter(entry => {
    const fullPath = path.join(rulesDir, entry);
    return fs.statSync(fullPath).isDirectory();
  });
  
  if (mdcFiles.length > 10 && subdirs.length === 0) {
    issues.push({
      severity: 'warning',
      message: `${mdcFiles.length} rules with no subdirectory organization`,
      hint: 'Organize rules into subdirectories (e.g., .cursor/rules/typescript/, .cursor/rules/react/) for better maintainability.',
    });
  }

  // Rule filenames don't follow kebab-case
  for (const file of mdcFiles) {
    const basename = file.replace(/\.mdc$/, '');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(basename)) {
      issues.push({
        severity: 'info',
        message: `Filename not in kebab-case: ${file}`,
        hint: 'Use kebab-case for consistency: my-rule.mdc instead of MyRule.mdc or my_rule.mdc.',
      });
    }
  }

  // Rule filenames are too generic
  const genericNames = ['rules.mdc', 'general.mdc', 'misc.mdc', 'config.mdc', 'setup.mdc', 'default.mdc'];
  for (const generic of genericNames) {
    if (mdcFiles.includes(generic)) {
      issues.push({
        severity: 'warning',
        message: `Generic filename: ${generic}`,
        hint: 'Use descriptive names that indicate what the rule does (e.g., react-hooks.mdc, typescript-naming.mdc).',
      });
    }
  }

  // Multiple rules with nearly identical filenames
  const basenames = mdcFiles.map(f => f.replace(/\.mdc$/, ''));
  for (let i = 0; i < basenames.length; i++) {
    for (let j = i + 1; j < basenames.length; j++) {
      const a = basenames[i];
      const b = basenames[j];
      // Check if one is a substring of the other or they differ by just a suffix
      if (a.startsWith(b) || b.startsWith(a) || a.replace(/-rules?$/, '') === b.replace(/-rules?$/, '')) {
        issues.push({
          severity: 'warning',
          message: `Similar filenames: ${mdcFiles[i]} and ${mdcFiles[j]}`,
          hint: 'These filenames are very similar. Consider consolidating or renaming for clarity.',
        });
      }
    }
  }

  // .cursor/ directory has files that don't belong
  const cursorDir = path.join(dir, '.cursor');
  if (fs.existsSync(cursorDir)) {
    const entries = fs.readdirSync(cursorDir);
    for (const entry of entries) {
      const fullPath = path.join(cursorDir, entry);
      const stat = fs.statSync(fullPath);
      
      if (stat.isFile() && !['hooks.json', 'environment.json', 'agents.json'].includes(entry)) {
        issues.push({
          severity: 'info',
          message: `Unexpected file in .cursor/: ${entry}`,
          hint: '.cursor/ should contain only rules/, hooks.json, environment.json, or agents.json.',
        });
      }
      
      if (entry === 'rules' && stat.isDirectory()) {
        // Check for non-.mdc files in rules/
        const checkDir = (dirPath) => {
          const items = fs.readdirSync(dirPath);
          for (const item of items) {
            const itemPath = path.join(dirPath, item);
            if (fs.statSync(itemPath).isDirectory()) {
              checkDir(itemPath);
            } else if (!item.endsWith('.mdc')) {
              issues.push({
                severity: 'warning',
                message: `Non-.mdc file in rules/: ${path.relative(rulesDir, itemPath)}`,
                hint: '.cursor/rules/ should only contain .mdc files.',
              });
            }
          }
        };
        checkDir(fullPath);
      }
    }
  }

  return issues;
}

// NEW: Context file linting
async function lintContextFiles(dir) {
  const issues = [];

  // Check AGENTS.md size
  const agentsMd = path.join(dir, 'AGENTS.md');
  if (fs.existsSync(agentsMd)) {
    const size = fs.statSync(agentsMd).size;
    if (size > 10000) {
      issues.push({
        severity: 'warning',
        message: `AGENTS.md is very large (${Math.round(size / 1000)}KB)`,
        hint: 'Context files over 10KB waste tokens. Consider splitting into smaller, more focused files.',
      });
    }
  }

  // Check CLAUDE.md size
  const claudeMd = path.join(dir, 'CLAUDE.md');
  if (fs.existsSync(claudeMd)) {
    const size = fs.statSync(claudeMd).size;
    if (size > 10000) {
      issues.push({
        severity: 'warning',
        message: `CLAUDE.md is very large (${Math.round(size / 1000)}KB)`,
        hint: 'Context files over 10KB waste tokens. Consider splitting into smaller, more focused files.',
      });
    }
  }

  // Both .cursorrules AND .cursor/rules/ exist
  const cursorrules = path.join(dir, '.cursorrules');
  const cursorRules = path.join(dir, '.cursor', 'rules');
  if (fs.existsSync(cursorrules) && fs.existsSync(cursorRules)) {
    issues.push({
      severity: 'error',
      message: 'Both .cursorrules and .cursor/rules/ exist',
      hint: 'This creates conflicts. Run "cursor-doctor migrate" to convert .cursorrules to .mdc files, then delete .cursorrules.',
    });
  }

  // Multiple context files with overlapping instructions
  if (fs.existsSync(agentsMd) && fs.existsSync(claudeMd)) {
    const agentsContent = fs.readFileSync(agentsMd, 'utf-8').toLowerCase();
    const claudeContent = fs.readFileSync(claudeMd, 'utf-8').toLowerCase();
    
    // Simple overlap detection: count shared unique words
    const agentsWords = new Set(agentsContent.split(/\s+/).filter(w => w.length > 4));
    const claudeWords = new Set(claudeContent.split(/\s+/).filter(w => w.length > 4));
    const intersection = new Set([...agentsWords].filter(w => claudeWords.has(w)));
    const overlapRatio = intersection.size / Math.min(agentsWords.size, claudeWords.size);
    
    if (overlapRatio > 0.3) {
      issues.push({
        severity: 'warning',
        message: 'AGENTS.md and CLAUDE.md have overlapping content',
        hint: 'Duplicated instructions across context files waste tokens. Consolidate into one file or clearly separate concerns.',
      });
    }
  }

  return issues;
}

// NEW: Cursor config linting
async function lintCursorConfig(dir) {
  const issues = [];

  // Check hooks.json
  const hooksJson = path.join(dir, '.cursor', 'hooks.json');
  if (fs.existsSync(hooksJson)) {
    try {
      const content = fs.readFileSync(hooksJson, 'utf-8');
      const hooks = JSON.parse(content);
      
      // Validate hook script references
      if (hooks && typeof hooks === 'object') {
        for (const [event, script] of Object.entries(hooks)) {
          if (typeof script === 'string') {
            // Check if script file exists
            const scriptPath = path.isAbsolute(script) ? script : path.join(dir, script);
            if (!fs.existsSync(scriptPath)) {
              issues.push({
                severity: 'error',
                message: `Hook "${event}" references missing script: ${script}`,
                hint: 'Create the script file or remove the hook reference.',
              });
            }
          }
        }
      }
    } catch (e) {
      issues.push({
        severity: 'error',
        message: `.cursor/hooks.json has syntax errors: ${e.message}`,
        hint: 'Fix JSON syntax errors in hooks.json.',
      });
    }
  }

  // Check environment.json
  const envJson = path.join(dir, '.cursor', 'environment.json');
  if (fs.existsSync(envJson)) {
    try {
      JSON.parse(fs.readFileSync(envJson, 'utf-8'));
    } catch (e) {
      issues.push({
        severity: 'error',
        message: `.cursor/environment.json has syntax errors: ${e.message}`,
        hint: 'Fix JSON syntax errors in environment.json.',
      });
    }
  }

  // Check .cursor/agents/*.md structure
  const agentsDir = path.join(dir, '.cursor', 'agents');
  if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
    const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    for (const file of agentFiles) {
      const filePath = path.join(agentsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Check for proper structure: frontmatter + body
      const fm = parseFrontmatter(content);
      if (!fm.found) {
        issues.push({
          severity: 'warning',
          message: `Agent file ${file} has no frontmatter`,
          hint: 'Agent files should have YAML frontmatter with name and description fields.',
        });
      } else if (!fm.data.name && !fm.data.description) {
        issues.push({
          severity: 'warning',
          message: `Agent file ${file} missing name or description`,
          hint: 'Add name and description to frontmatter for proper agent registration.',
        });
      }
      
      const body = getBody(content);
      if (body.trim().length === 0) {
        issues.push({
          severity: 'error',
          message: `Agent file ${file} has no instructions`,
          hint: 'Add agent behavior instructions after the frontmatter.',
        });
      }
    }
  }

  return issues;
}

async function lintProject(dir) {
  const results = [];

  const cursorrules = path.join(dir, '.cursorrules');
  if (fs.existsSync(cursorrules)) {
    results.push(await lintCursorrules(cursorrules));
  }

  const rulesDir = path.join(dir, '.cursor', 'rules');
  if (fs.existsSync(rulesDir) && fs.statSync(rulesDir).isDirectory()) {
    for (const entry of fs.readdirSync(rulesDir)) {
      if (entry.endsWith('.mdc')) {
        results.push(await lintMdcFile(path.join(rulesDir, entry)));
      }
    }
  }

  // Skill files (.claude/skills/, skills/, etc.)
  const skillDirs = findSkillDirs(dir);
  const skillFiles = collectSkillFiles(skillDirs);
  for (const sf of skillFiles) {
    results.push(await lintSkillFile(sf));
  }

  if (results.length === 0) {
    results.push({
      file: dir,
      issues: [{ severity: 'warning', message: 'No Cursor rules or agent skills found in this directory' }],
    });
  }

  // Conflict detection across .mdc files
  const conflicts = detectConflicts(dir);
  if (conflicts.length > 0) {
    results.push({
      file: path.join(dir, '.cursor/rules/'),
      issues: conflicts,
    });
  }

  // 9. Excessive rules count & 10. Duplicate rule content
  const rulesDirPath = path.join(dir, '.cursor', 'rules');
  if (fs.existsSync(rulesDirPath) && fs.statSync(rulesDirPath).isDirectory()) {
    const mdcFiles = fs.readdirSync(rulesDirPath).filter(f => f.endsWith('.mdc'));
    
    if (mdcFiles.length > 20) {
      results.push({
        file: rulesDirPath,
        issues: [{
          severity: 'warning',
          message: `Project has ${mdcFiles.length} rule files`,
          hint: 'More rules means more tokens consumed per request. Consider consolidating related rules.',
        }],
      });
    }

    // 10. Duplicate rule content
    if (mdcFiles.length > 1) {
      const parsed = [];
      for (const file of mdcFiles) {
        const filePath = path.join(rulesDirPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const body = getBody(content);
        const fm = parseFrontmatter(content);
        parsed.push({ file, filePath, body, description: fm.data?.description });
      }

      // Compare each pair
      for (let i = 0; i < parsed.length; i++) {
        for (let j = i + 1; j < parsed.length; j++) {
          const a = parsed[i];
          const b = parsed[j];
          const sim = similarity(a.body, b.body);
          
          if (sim > 0.8) {
            results.push({
              file: rulesDirPath,
              issues: [{
                severity: 'warning',
                message: `Possible duplicate rules: ${a.file} and ${b.file}`,
                hint: 'These rules have very similar content. Consider merging them.',
              }],
            });
          }
          
          // NEW: Check for duplicate descriptions
          if (a.description && b.description && a.description === b.description) {
            results.push({
              file: rulesDirPath,
              issues: [{
                severity: 'warning',
                message: `Duplicate descriptions: ${a.file} and ${b.file}`,
                hint: 'Each rule should have a unique description so Cursor can differentiate them.',
              }],
            });
          }
        }
      }
    }
  }

  // NEW: Run project structure checks
  const structureIssues = await lintProjectStructure(dir);
  if (structureIssues.length > 0) {
    results.push({
      file: path.join(dir, '.cursor/'),
      issues: structureIssues,
    });
  }

  // NEW: Run context file checks
  const contextIssues = await lintContextFiles(dir);
  if (contextIssues.length > 0) {
    results.push({
      file: dir,
      issues: contextIssues,
    });
  }

  // NEW: Run config checks
  const configIssues = await lintCursorConfig(dir);
  if (configIssues.length > 0) {
    results.push({
      file: path.join(dir, '.cursor/'),
      issues: configIssues,
    });
  }

  return results;
}

function parseGlobs(globVal) {
  if (!globVal) return [];
  if (typeof globVal === 'string') {
    // Handle both YAML array syntax and comma-separated
    const trimmed = globVal.trim();
    if (trimmed.startsWith('[')) {
      // ["*.ts", "*.tsx"] format
      return trimmed.slice(1, -1).split(',').map(g => g.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
    return trimmed.split(',').map(g => g.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  if (Array.isArray(globVal)) return globVal;
  return [];
}

function globsOverlap(globsA, globsB) {
  // If either has no globs (alwaysApply), they overlap with everything
  if (globsA.length === 0 || globsB.length === 0) return true;

  for (const a of globsA) {
    for (const b of globsB) {
      // Exact match
      if (a === b) return true;
      // Both are wildcards covering same extension
      const extA = a.match(/^\*\.(\w+)$/);
      const extB = b.match(/^\*\.(\w+)$/);
      if (extA && extB && extA[1] === extB[1]) return true;
      // One is a superset pattern like **/*.ts
      if (a.includes('**') || b.includes('**')) {
        const extA2 = a.match(/\*\.(\w+)$/);
        const extB2 = b.match(/\*\.(\w+)$/);
        if (extA2 && extB2 && extA2[1] === extB2[1]) return true;
      }
    }
  }
  return false;
}

function extractDirectives(content) {
  // Extract actionable instructions from rule body (after frontmatter)
  const body = content.replace(/^---[\s\S]*?---\n?/, '').toLowerCase();
  const directives = [];

  // Look for contradictory patterns: "always use X" vs "never use X"
  const alwaysMatch = body.match(/always\s+use\s+(\S+)/g) || [];
  const neverMatch = body.match(/never\s+use\s+(\S+)/g) || [];
  const preferMatch = body.match(/prefer\s+(\S+)/g) || [];
  const avoidMatch = body.match(/avoid\s+(\S+)/g) || [];
  const doNotMatch = body.match(/do\s+not\s+use\s+(\S+)/g) || [];

  for (const m of alwaysMatch) directives.push({ type: 'require', subject: m.replace(/^always\s+use\s+/, '') });
  for (const m of neverMatch) directives.push({ type: 'forbid', subject: m.replace(/^never\s+use\s+/, '') });
  for (const m of preferMatch) directives.push({ type: 'prefer', subject: m.replace(/^prefer\s+/, '') });
  for (const m of avoidMatch) directives.push({ type: 'avoid', subject: m.replace(/^avoid\s+/, '') });
  for (const m of doNotMatch) directives.push({ type: 'forbid', subject: m.replace(/^do\s+not\s+use\s+/, '') });

  return directives;
}

function detectConflicts(dir) {
  const rulesDir = path.join(dir, '.cursor', 'rules');
  if (!fs.existsSync(rulesDir) || !fs.statSync(rulesDir).isDirectory()) return [];

  const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.mdc'));
  if (files.length < 2) return [];

  const parsed = [];
  for (const file of files) {
    const filePath = path.join(rulesDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content);
    const globs = fm.data ? parseGlobs(fm.data.globs) : [];
    const alwaysApply = fm.data && fm.data.alwaysApply;
    const directives = extractDirectives(content);
    parsed.push({ file, filePath, globs, alwaysApply, directives, content });
  }

  const issues = [];

  // Check for duplicate alwaysApply rules with overlapping globs
  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const a = parsed[i];
      const b = parsed[j];

      // Check glob overlap
      const aGlobs = a.alwaysApply && a.globs.length === 0 ? [] : a.globs;
      const bGlobs = b.alwaysApply && b.globs.length === 0 ? [] : b.globs;
      const overlap = globsOverlap(aGlobs, bGlobs);

      if (!overlap) continue;

      // Check for contradictory directives
      for (const dA of a.directives) {
        for (const dB of b.directives) {
          if (dA.subject !== dB.subject) continue;

          const contradicts =
            (dA.type === 'require' && (dB.type === 'forbid' || dB.type === 'avoid')) ||
            (dA.type === 'forbid' && (dB.type === 'require' || dB.type === 'prefer')) ||
            (dA.type === 'prefer' && dB.type === 'forbid') ||
            (dA.type === 'avoid' && dB.type === 'require');

          if (contradicts) {
            issues.push({
              severity: 'error',
              message: `Conflicting rules: ${a.file} says "${dA.type} ${dA.subject}" but ${b.file} says "${dB.type} ${dB.subject}"`,
              hint: 'Conflicting directives confuse the model. Remove or reconcile one of these rules.',
            });
          }
        }
      }

      // Check for duplicate glob coverage (both alwaysApply targeting same files)
      if (a.alwaysApply && b.alwaysApply && a.globs.length > 0 && b.globs.length > 0) {
        const sharedGlobs = a.globs.filter(g => b.globs.includes(g));
        if (sharedGlobs.length > 0) {
          issues.push({
            severity: 'warning',
            message: `Overlapping globs: ${a.file} and ${b.file} both target ${sharedGlobs.join(', ')}`,
            hint: 'Multiple rules targeting the same files may cause unpredictable behavior. Consider merging them.',
          });
        }
      }
    }
  }

  return issues;
}

module.exports = { lintProject, lintMdcFile, lintCursorrules, detectConflicts, parseFrontmatter };
