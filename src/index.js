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

function findVagueRules(content) {
  const issues = [];
  const lines = content.split('\n');
  for (var vi = 0; vi < lines.length; vi++) {
    const lineLower = lines[vi].toLowerCase().trim();
    if (lineLower.startsWith('#') || lineLower.startsWith('```') || lineLower.length === 0) continue;
    for (const pattern of VAGUE_PATTERNS) {
      const idx = lineLower.indexOf(pattern);
      if (idx === -1) continue;
      // Skip if phrase is qualified by context words (not standalone vague advice)
      const after = lineLower.slice(idx + pattern.length).trim();
      if (after.startsWith('with ') || after.startsWith('for ') || after.startsWith('in ') ||
          after.startsWith('by ') || after.startsWith('using ') || after.startsWith('according to ') ||
          after.startsWith('and ')) continue;
      issues.push({ severity: 'warning', message: `Vague rule detected: "${pattern}"`, line: vi + 1 });
      break;
    }
  }
  return issues;
}

function parseFrontmatter(content) {
  var normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { found: false, data: null, error: null };

  try {
    const data = {};
    const lines = match[1].split('\n');
    var currentKey = null;
    var currentList = null;
    for (var i = 0; i < lines.length; i++) {
      const line = lines[i];

      // YAML list item (  - "value")
      if (line.match(/^\s+-\s+/)) {
        if (currentKey && currentList) {
          var itemVal = line.replace(/^\s+-\s+/, '').trim();
          if (itemVal.startsWith('"') && itemVal.endsWith('"')) itemVal = itemVal.slice(1, -1);
          else if (itemVal.startsWith("'") && itemVal.endsWith("'")) itemVal = itemVal.slice(1, -1);
          currentList.push(itemVal);
        }
        continue;
      }

      // Flush any pending list
      if (currentKey && currentList) {
        data[currentKey] = currentList;
        currentKey = null;
        currentList = null;
      }

      // Check for bad indentation (key starts with space = likely nested/broken YAML)
      if (line.match(/^\s+\S/) && !line.match(/^\s+-/)) {
        const prevLine = i > 0 ? lines[i - 1] : null;
        if (prevLine && !prevLine.endsWith(':')) {
          return { found: true, data: null, error: 'Invalid YAML indentation' };
        }
      }

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const rawVal = line.slice(colonIdx + 1).trim();

      if (rawVal === '') {
        // Could be start of a YAML list (key with no inline value)
        currentKey = key;
        currentList = [];
      } else if (rawVal === 'true') data[key] = true;
      else if (rawVal === 'false') data[key] = false;
      else if (rawVal.startsWith('"') && rawVal.endsWith('"')) data[key] = rawVal.slice(1, -1);
      else data[key] = rawVal;
    }
    // Flush final list
    if (currentKey && currentList) {
      data[currentKey] = currentList;
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
  var content;
  try {
    content = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  } catch (e) {
    return { file: filePath, issues: [{ severity: 'error', message: 'Cannot read file: ' + e.code }] };
  }

  // Skip binary files
  if (/[\x00-\x08\x0E-\x1F]/.test(content.slice(0, 512))) {
    return { file: filePath, issues: [{ severity: 'warning', message: 'File appears to be binary, not a text rule', hint: 'Remove non-text files from .cursor/rules/' }] };
  }

  const issues = [];

  const fm = parseFrontmatter(content);

  if (!fm.found) {
    issues.push({ severity: 'error', message: 'Missing YAML frontmatter', hint: 'Add --- block with description and alwaysApply: true' });
  } else if (fm.error) {
    issues.push({ severity: 'error', message: `YAML frontmatter error: ${fm.error}`, hint: 'Fix frontmatter indentation/syntax' });
  } else {
    // alwaysApply check: only flag if BOTH alwaysApply is missing/undefined AND no globs are set
    var hasGlobs = fm.data.globs && (Array.isArray(fm.data.globs) ? fm.data.globs.length > 0 : parseGlobs(fm.data.globs).length > 0);
    if (fm.data.alwaysApply === undefined && !hasGlobs) {
      issues.push({ severity: 'warning', message: 'No alwaysApply or globs set — rule may only apply when manually referenced', hint: 'Add alwaysApply: true for global rules, or add globs to scope to specific files' });
    }
    var descEmpty = !fm.data.description || (typeof fm.data.description === 'string' && fm.data.description.trim() === '') || (Array.isArray(fm.data.description) && fm.data.description.length === 0);
    if (descEmpty) {
      issues.push({ severity: 'warning', message: 'Missing or empty description in frontmatter', hint: 'Add a description so Cursor knows when to apply this rule' });
    }
    // Non-functional rule: alwaysApply is explicitly false and no globs
    if (fm.data.alwaysApply === false && !hasGlobs) {
      issues.push({ severity: 'error', message: 'Rule will never load: alwaysApply is false and no globs are set', hint: 'Set alwaysApply: true for global rules, or add globs to scope to specific files' });
    }
    if (fm.data.globs && typeof fm.data.globs === 'string' && fm.data.globs.includes(',') && !fm.data.globs.trim().startsWith('[')) {
      issues.push({ severity: 'warning', message: 'Globs as comma-separated string — consider using YAML array format', hint: 'Use globs:\\n  - "*.ts"\\n  - "*.tsx"' });
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
    if (fm.data.description && typeof fm.data.description === 'string' && /[*_`#\[\]]/.test(fm.data.description)) {
      issues.push({
        severity: 'warning',
        message: 'Description contains markdown formatting',
        hint: 'Descriptions should be plain text. Save formatting for the rule body.',
      });
    }

  }

  // Vague rules (context-aware — skip qualified phrases)
  issues.push(...findVagueRules(content));

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

  // 2. No examples (only flag longer rules where examples would meaningfully help)
  const hasCodeBlocks = /```/.test(body) || /\n {4,}\S/.test(body);
  if (body.length > 500 && !hasCodeBlocks) {
    issues.push({
      severity: 'info',
      message: 'Rule has no code examples',
      hint: 'Longer rules with examples get followed more reliably by the AI model.',
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

  // 4. Description too short (skip if already flagged as empty)
  if (fm.data && fm.data.description && typeof fm.data.description === 'string' && fm.data.description.trim().length > 0 && fm.data.description.trim().length < 10) {
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
  
  // Rule body contains XML tags (skip TypeScript generics like <T extends ...>)
  if (/<[^>]+>/.test(body) && !hasCodeBlocks) {
    const xmlTags = body.match(/<\w+[^>]*>/g);
    if (xmlTags && xmlTags.length > 0) {
      // Filter out TypeScript generic syntax: <T>, <T extends X>, <K extends keyof T>, etc.
      const realXmlTags = xmlTags.filter(tag => !/^<[A-Z]\w*(\s+extends\s|\s*[>=,})|$])/.test(tag) && !/^<[A-Z]>$/.test(tag));
      if (realXmlTags.length > 0) {
        issues.push({
          severity: 'warning',
          message: 'Rule body contains XML/HTML tags',
          hint: 'Cursor doesn\'t process XML/HTML in rules. Use markdown or plain text instead.',
        });
      }
    }
  }

  // Rule has broken markdown links (skip on large bodies to avoid slow regex)
  if (body.length <= 10000 && (/\]\[/.test(body) || /\[[^\]]*\]\([^\)]*$/.test(body))) {
    issues.push({
      severity: 'warning',
      message: 'Rule body has broken markdown links',
      hint: 'Fix link syntax: [text](url)',
    });
  }

  // Rule body starts with the description repeated
  if (fm.data && fm.data.description && typeof fm.data.description === 'string' && fm.data.description.trim().length > 0 && body.trim().startsWith(fm.data.description)) {
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
  const imperativeVerbs = /\b(use|write|create|add|remove|ensure|check|validate|follow|apply|implement|wrap|handle|return|throw|test|run|call|import|export|set|define|configure|avoid|prefer|keep|split|merge|move|rename|update|delete|include|exclude|enable|disable)\b/i;
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

  // Rule references a file path that doesn't exist
  // Guard: skip bodies >10KB to avoid slow regex on large files
  if (body.length <= 10000) {
    var filePathLines = body.split('\n');
    var filePathMatches = [];
    for (var fpi = 0; fpi < filePathLines.length; fpi++) {
      var fpLine = filePathLines[fpi];
      // Only match lines that look like they contain file references (have a slash)
      if (fpLine.includes('/')) {
        var fpMatch = fpLine.match(/[\w.\/-]+\.(ts|js|tsx|jsx|py|go|rs|java|md|json|yml|yaml|toml)\b/g);
        if (fpMatch) {
          for (var fpj = 0; fpj < fpMatch.length; fpj++) filePathMatches.push(fpMatch[fpj]);
        }
      }
    }
    if (filePathMatches.length > 0) {
      var projectRoot = path.dirname(path.dirname(filePath));
      for (var fpi = 0; fpi < filePathMatches.length; fpi++) {
        var fpRef = filePathMatches[fpi];
        if (fpRef.startsWith('http')) continue;
        var potentialPath = path.join(projectRoot, fpRef);
        if (!fs.existsSync(potentialPath) && fpRef.includes('/')) {
          issues.push({
            severity: 'info',
            message: 'Rule references file that may not exist: ' + fpRef,
            hint: 'Verify this file path is correct or remove the reference if outdated.',
          });
        }
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

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW CURSOR-SPECIFIC DEPTH RULES (40+)
  // ═══════════════════════════════════════════════════════════════════════════

  // 1. Rule body contains absolute paths
  if (body.length > 0 && body.length <= 10000) {
    const absolutePathPatterns = [
      /\/Users\/[^\s]+/g,
      /\/home\/[^\s]+/g,
      /C:\\[^\s]+/gi,
      /D:\\[^\s]+/gi,
    ];
    for (const pattern of absolutePathPatterns) {
      const matches = body.match(pattern);
      if (matches && matches.length > 0) {
        issues.push({
          severity: 'error',
          message: 'Rule body contains absolute paths',
          hint: 'Absolute paths like /Users/... or C:\\ won\'t work on other machines. Use relative paths or project-relative references.',
        });
        break;
      }
    }
  }

  // 2. Rule body references environment variables
  if (body.length > 0 && body.length <= 10000) {
    const envVarPattern = /\$(?:HOME|USER|PATH|USERPROFILE|APPDATA|TEMP|TMP)\b|%(?:USERPROFILE|APPDATA|TEMP|TMP)%/g;
    if (envVarPattern.test(body)) {
      issues.push({
        severity: 'warning',
        message: 'Rule body references environment variables',
        hint: 'Environment variables like $HOME or %USERPROFILE% are fragile and machine-specific. Use project-relative paths.',
      });
    }
  }

  // 3. Glob uses negation pattern
  if (fm.data && fm.data.globs) {
    const globs = parseGlobs(fm.data.globs);
    for (const glob of globs) {
      if (glob.startsWith('!')) {
        issues.push({
          severity: 'warning',
          message: `Glob uses negation pattern: ${glob}`,
          hint: 'Cursor may not support negation globs (patterns starting with !). Use positive patterns instead.',
        });
      }
    }
  }

  // 4. Glob has no wildcard (literal filename)
  if (fm.data && fm.data.globs) {
    const globs = parseGlobs(fm.data.globs);
    for (const glob of globs) {
      if (!glob.includes('*') && !glob.includes('?') && !glob.includes('[')) {
        issues.push({
          severity: 'info',
          message: `Glob has no wildcard: ${glob}`,
          hint: 'Literal filenames as globs may not match as expected. Consider "**/filename" or use a wildcard pattern.',
        });
      }
    }
  }

  // 5. Description is identical to filename
  if (fm.data && fm.data.description && typeof fm.data.description === 'string' && filePath) {
    const filename = path.basename(filePath, '.mdc');
    const descNorm = fm.data.description.toLowerCase().replace(/[^a-z0-9]/g, '');
    const filenameNorm = filename.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (descNorm === filenameNorm) {
      issues.push({
        severity: 'warning',
        message: 'Description is identical to filename',
        hint: 'Lazy descriptions aren\'t helpful. Describe what the rule does, not just repeat the filename.',
      });
    }
  }

  // 6. Rule body contains emoji overload
  if (body.length > 0) {
    const emojiPattern = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const emojiMatches = body.match(emojiPattern);
    if (emojiMatches && emojiMatches.length >= 5) {
      issues.push({
        severity: 'warning',
        message: `Rule body contains emoji overload (${emojiMatches.length} emoji)`,
        hint: 'Excessive emoji wastes tokens and doesn\'t improve AI comprehension. Use sparingly or remove.',
      });
    }
  }

  // 7. Rule has deeply nested markdown
  if (body.length > 0) {
    const deepHeadings = body.match(/^#{4,}\s+.+/gm);
    if (deepHeadings && deepHeadings.length > 0) {
      issues.push({
        severity: 'warning',
        message: 'Rule has deeply nested markdown (4+ heading levels)',
        hint: 'Deeply nested headings make rules too complex. Flatten the structure or split into multiple rules.',
      });
    }
  }

  // 8. Rule body contains base64 or data URIs
  if (body.length > 0 && body.length <= 10000) {
    const base64Pattern = /(?:data:image\/[^;]+;base64,|^[A-Za-z0-9+/]{50,}={0,2}$)/m;
    if (base64Pattern.test(body)) {
      issues.push({
        severity: 'error',
        message: 'Rule body contains base64 or data URIs',
        hint: 'Base64 and data URIs waste massive amounts of tokens. Link to external resources instead.',
      });
    }
  }

  // 9. Rule body has inconsistent list markers
  if (body.length > 0) {
    const bulletTypes = [];
    if (/^\s*-\s+/m.test(body)) bulletTypes.push('-');
    if (/^\s*\*\s+/m.test(body)) bulletTypes.push('*');
    if (/^\s*\+\s+/m.test(body)) bulletTypes.push('+');
    if (bulletTypes.length > 1) {
      issues.push({
        severity: 'info',
        message: `Rule body has inconsistent list markers: ${bulletTypes.join(', ')}`,
        hint: 'Mixing -, *, and + for lists is inconsistent. Pick one marker and use it throughout.',
      });
    }
  }

  // 10. Rule repeats the same instruction
  if (body.length > 0 && body.length <= 10000) {
    // Split by sentence endings and filter short fragments
    const sentences = body.split(/[.!?]+\s+/).map(s => s.trim()).filter(s => s.length > 15);
    const seen = new Map();
    for (const sentence of sentences) {
      // Normalize: lowercase, normalize whitespace, remove trailing punctuation
      const normalized = sentence.toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim();
      if (normalized.length > 0 && seen.has(normalized)) {
        issues.push({
          severity: 'warning',
          message: 'Rule repeats the same instruction',
          hint: 'Repeated instructions waste tokens. Remove duplicates.',
        });
        break;
      }
      if (normalized.length > 0) {
        seen.set(normalized, true);
      }
    }
  }

  // 11. Rule body references Cursor UI actions
  if (body.length > 0) {
    const uiActionPatterns = [
      /\b(?:click|press|select|open|navigate to)\s+(?:file|edit|view|preferences|settings|menu)/i,
      /\bctrl\+[a-z]/i,
      /\bcmd\+[a-z]/i,
      /\b(?:right-click|left-click)\b/i,
    ];
    for (const pattern of uiActionPatterns) {
      if (pattern.test(body)) {
        issues.push({
          severity: 'warning',
          message: 'Rule body references Cursor UI actions',
          hint: 'Rules are for the AI, not the user. Remove UI instructions like "click File > Preferences".',
        });
        break;
      }
    }
  }

  // 12. Rule body contains commented-out sections
  if (body.length > 0) {
    const commentPatterns = [
      /<!--[\s\S]*?-->/,
      /^\/\/.+$/m,
    ];
    let hasComments = false;
    for (const pattern of commentPatterns) {
      if (pattern.test(body)) {
        hasComments = true;
        break;
      }
    }
    if (hasComments) {
      issues.push({
        severity: 'info',
        message: 'Rule body contains commented-out sections',
        hint: 'Commented sections waste tokens. Remove them or uncomment if needed.',
      });
    }
  }

  // 13. alwaysApply with very specific globs
  if (fm.data && fm.data.alwaysApply === true && fm.data.globs) {
    const globs = parseGlobs(fm.data.globs);
    const verySpecific = globs.filter(g => 
      !g.includes('*') || 
      g.split('/').length > 3 ||
      /\w+\.\w+/.test(g.replace(/\*/g, ''))
    );
    if (verySpecific.length > 0) {
      issues.push({
        severity: 'warning',
        message: 'alwaysApply with very specific globs is contradictory',
        hint: `alwaysApply:true means always load. Very specific globs like "${verySpecific[0]}" suggest you want file-specific behavior. Choose one approach.`,
      });
    }
  }

  // 14. Glob pattern is unreachable
  if (fm.data && fm.data.globs && filePath) {
    const globs = parseGlobs(fm.data.globs);
    for (const glob of globs) {
      // Check if glob would match .mdc files (which it shouldn't)
      if (glob.includes('.mdc') || glob === '*.mdc') {
        issues.push({
          severity: 'warning',
          message: `Glob pattern may be unreachable: ${glob}`,
          hint: 'Rules don\'t apply to themselves. Globs like "*.mdc" inside .cursor/rules won\'t work as expected.',
        });
      }
    }
  }

  // 15. Rule body has trailing whitespace lines
  if (body.length > 0) {
    const lines = body.split('\n');
    let trailingWhitespace = 0;
    for (const line of lines) {
      if (line !== line.trimEnd()) {
        trailingWhitespace++;
      }
    }
    if (trailingWhitespace > 3) {
      issues.push({
        severity: 'info',
        message: `Rule body has trailing whitespace on ${trailingWhitespace} lines`,
        hint: 'Trailing whitespace wastes tokens. Remove it.',
      });
    }
  }

  // 16. Description contains the word 'rule'
  if (fm.data && fm.data.description && typeof fm.data.description === 'string' && /\brule\b/i.test(fm.data.description)) {
    issues.push({
      severity: 'info',
      message: 'Description contains the word "rule"',
      hint: 'Redundant. "Rule for TypeScript" → "TypeScript conventions". The context is already a rule.',
    });
  }

  // 17. Rule body is mostly code blocks
  if (body.length > 100 && hasCodeBlocks) {
    const codeBlockMatches = body.match(/```[\s\S]*?```/g);
    if (codeBlockMatches) {
      const codeLength = codeBlockMatches.join('').length;
      const ratio = codeLength / body.length;
      if (ratio > 0.7) {
        issues.push({
          severity: 'warning',
          message: 'Rule body is mostly code blocks (>70%)',
          hint: 'Rules need instruction text, not just code examples. Add context and explanations.',
        });
      }
    }
  }

  // 18. Frontmatter uses boolean strings
  if (fm.data && fm.data.alwaysApply && typeof fm.data.alwaysApply === 'string') {
    if (fm.data.alwaysApply === 'true' || fm.data.alwaysApply === 'false') {
      issues.push({
        severity: 'error',
        message: 'Frontmatter uses boolean strings',
        hint: `alwaysApply should be a boolean (true or false), not a string ("${fm.data.alwaysApply}"). Remove quotes.`,
      });
    }
  }

  // 19. Glob uses regex syntax instead of glob syntax
  if (fm.data && fm.data.globs) {
    const globs = parseGlobs(fm.data.globs);
    for (const glob of globs) {
      if (/\\\.|[\[\]()]|\$/.test(glob) && !glob.includes('[a-z]')) {
        issues.push({
          severity: 'error',
          message: `Glob uses regex syntax instead of glob syntax: ${glob}`,
          hint: 'Globs use *, ?, and {}, not regex. Use "*.ts" not "\\.ts$".',
        });
      }
    }
  }

  // 20. Rule body has very long lines
  if (body.length > 0) {
    const lines = body.split('\n');
    const longLines = lines.filter(line => line.length > 500);
    if (longLines.length > 0) {
      issues.push({
        severity: 'info',
        message: `Rule body has ${longLines.length} very long line(s) (>500 chars)`,
        hint: 'Long lines are hard to read and waste tokens. Break them up.',
      });
    }
  }

  // 21. Description is a complete sentence
  if (fm.data && fm.data.description && typeof fm.data.description === 'string') {
    if (/^[A-Z].*[.!?]$/.test(fm.data.description.trim())) {
      issues.push({
        severity: 'info',
        message: 'Description is a complete sentence',
        hint: 'Descriptions work better as noun phrases. "TypeScript conventions" not "This rule enforces TypeScript conventions."',
      });
    }
  }

  // 22. Rule body references specific model names
  if (body.length > 0) {
    const modelNames = ['GPT-4', 'GPT-3', 'Claude', 'ChatGPT', 'Copilot', 'o1', 'o3'];
    for (const model of modelNames) {
      if (body.includes(model)) {
        issues.push({
          severity: 'warning',
          message: `Rule body references specific model names: ${model}`,
          hint: 'Rules should be model-agnostic. Remove model-specific instructions.',
        });
        break;
      }
    }
  }

  // 24. Rule body contains credentials/secrets pattern
  if (body.length > 0 && body.length <= 10000) {
    const secretPatterns = [
      /(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|password|secret)[:\s]*["\']?[A-Za-z0-9_\-]{20,}["\']?/i,
      /sk-[A-Za-z0-9]{20,}/,
      /ghp_[A-Za-z0-9]{20,}/,
    ];
    for (const pattern of secretPatterns) {
      if (pattern.test(body)) {
        issues.push({
          severity: 'error',
          message: 'Rule body contains credentials/secrets pattern',
          hint: 'Never include API keys, tokens, or passwords in rules. Use environment variables.',
        });
        break;
      }
    }
  }

  // 25. Rule body contains timestamps/dates that will go stale
  if (body.length > 0) {
    const datePatterns = [
      /\bAs of (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/,
      /\bUpdated:? \d{4}-\d{2}-\d{2}\b/i,
      /\bCurrent as of\b/i,
    ];
    for (const pattern of datePatterns) {
      if (pattern.test(body)) {
        issues.push({
          severity: 'warning',
          message: 'Rule body contains timestamps/dates that will go stale',
          hint: 'Date-specific statements like "As of January 2024" become outdated. Make rules timeless.',
        });
        break;
      }
    }
  }

  // 26. alwaysApply: true on file-specific rule
  if (fm.data && fm.data.alwaysApply === true && fm.data.description && typeof fm.data.description === 'string') {
    const fileSpecificKeywords = [
      /\bfor (React|Vue|Angular|TypeScript|JavaScript|Python|Go) (components?|files?)\b/i,
      /\bin \.tsx?\b files/i,
      /\bwhen editing \.[\w]+\b/i,
    ];
    for (const pattern of fileSpecificKeywords) {
      if (pattern.test(fm.data.description)) {
        issues.push({
          severity: 'warning',
          message: 'alwaysApply: true on file-specific rule',
          hint: 'Description suggests file-specific behavior but alwaysApply:true means always load. Use globs instead.',
        });
        break;
      }
    }
  }

  // 28. Rule body uses Cursor-specific deprecated features
  if (body.length > 0) {
    if (/\.cursorrules\b/.test(body) || /cursor\.rules\b/.test(body)) {
      issues.push({
        severity: 'warning',
        message: 'Rule body references old .cursorrules behavior',
        hint: 'Cursor moved from .cursorrules to .cursor/rules/*.mdc. Update references.',
      });
    }
  }

  // 29. Empty globs array
  if (fm.data && fm.data.globs !== undefined) {
    const globs = parseGlobs(fm.data.globs);
    if (globs.length === 0) {
      issues.push({
        severity: 'warning',
        message: 'Empty globs array',
        hint: 'globs: [] is set but empty. Remove globs or add patterns.',
      });
    }
  }

  // 30. Rule has excessive bold/italic formatting
  if (body.length > 0) {
    const boldMatches = body.match(/\*\*[^*]+\*\*/g);
    const italicMatches = body.match(/\*[^*]+\*/g);
    const totalFormatting = (boldMatches ? boldMatches.length : 0) + (italicMatches ? italicMatches.length : 0);
    if (totalFormatting > 10) {
      issues.push({
        severity: 'info',
        message: `Rule has excessive bold/italic formatting (${totalFormatting} instances)`,
        hint: 'Excessive formatting wastes tokens and doesn\'t help AI comprehension. Use sparingly.',
      });
    }
  }

  // 31. Rule body contains raw JSON without explanation
  if (body.length > 0 && hasCodeBlocks) {
    const jsonBlockPattern = /```(?:json)?\s*\n\{[\s\S]*?\}\s*```/g;
    const jsonBlocks = body.match(jsonBlockPattern);
    if (jsonBlocks && jsonBlocks.length > 0) {
      // Check if there's explanatory text near the JSON
      for (const block of jsonBlocks) {
        const blockIndex = body.indexOf(block);
        const before = body.slice(Math.max(0, blockIndex - 100), blockIndex);
        const after = body.slice(blockIndex + block.length, blockIndex + block.length + 100);
        if (!before.trim() && !after.trim()) {
          issues.push({
            severity: 'warning',
            message: 'Rule body contains raw JSON without explanation',
            hint: 'JSON blobs without context confuse the AI. Add instructions explaining what to do with the JSON.',
          });
          break;
        }
      }
    }
  }

  // 32. Frontmatter indentation uses tabs
  if (content.length > 0) {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch && fmMatch[1].includes('\t')) {
      issues.push({
        severity: 'warning',
        message: 'Frontmatter indentation uses tabs',
        hint: 'YAML prefers spaces over tabs for indentation. Use 2 spaces.',
      });
    }
  }

  // 33. Rule body language mismatch (basic check)
  if (body.length > 50 && fm.data && fm.data.description && typeof fm.data.description === 'string') {
    // Simple heuristic: check for significant non-English content in body but English description
    const nonAsciiChars = body.match(/[^\x00-\x7F]/g);
    const hasNonEnglish = nonAsciiChars && nonAsciiChars.length >= 10;
    const descIsEnglish = /^[A-Za-z\s0-9.,!?-]+$/.test(fm.data.description);
    if (hasNonEnglish && descIsEnglish) {
      issues.push({
        severity: 'info',
        message: 'Rule body language may not match description',
        hint: 'Description appears to be in English but body contains non-English text. Ensure consistency.',
      });
    }
  }

  // 35. Rule body references line numbers
  if (body.length > 0) {
    if (/\bon line \d+\b/i.test(body) || /\bline \d+:/i.test(body)) {
      issues.push({
        severity: 'warning',
        message: 'Rule body references specific line numbers',
        hint: 'Line number references like "on line 42" are fragile and will break when code changes. Use structural references.',
      });
    }
  }

  // 36. Rule only contains negative instructions
  if (body.length > 100) {
    const negativeWords = body.match(/\b(?:don't|do not|never|avoid|not|no)\b/gi);
    // Exclude "do" that's part of "don't" or "do not" and "use" after negative words
    const bodyWithoutNegatives = body.replace(/\b(?:don't|do not)\b/gi, 'NEGATIVE')
                                      .replace(/\bnever\s+use\b/gi, 'NEGATIVE')
                                      .replace(/\bavoid\s+\w+/gi, 'NEGATIVE');
    const positiveWords = bodyWithoutNegatives.match(/\b(?:always|must|should|ensure|prefer|instead)\b/gi);
    if (negativeWords && negativeWords.length >= 6 && (!positiveWords || positiveWords.length === 0)) {
      issues.push({
        severity: 'warning',
        message: 'Rule only contains negative instructions',
        hint: 'Rules with only "don\'t do X" are less effective. Add positive guidance: "do Y instead".',
      });
    }
  }

  // 37. Rule body has unclosed code blocks
  if (body.length > 0) {
    const codeBlockMarkers = body.match(/```/g);
    if (codeBlockMarkers && codeBlockMarkers.length % 2 !== 0) {
      issues.push({
        severity: 'error',
        message: 'Rule body has unclosed code blocks',
        hint: 'Every ``` must have a closing ```. Fix the code block syntax.',
      });
    }
  }

  // 38. Description contains special characters
  if (fm.data && fm.data.description && typeof fm.data.description === 'string') {
    if (/[^\x00-\x7F]/.test(fm.data.description)) {
      issues.push({
        severity: 'info',
        message: 'Description contains non-ASCII characters',
        hint: 'Special characters in descriptions may cause matching issues. Stick to ASCII.',
      });
    }
  }

  // 39. Rule body contains shell commands without context
  if (body.length > 0 && !hasCodeBlocks) {
    const shellCommands = ['npm install', 'yarn add', 'git commit', 'docker run', 'pip install'];
    for (const cmd of shellCommands) {
      if (body.includes(cmd)) {
        issues.push({
          severity: 'warning',
          message: `Rule body contains shell commands without context: "${cmd}"`,
          hint: 'Rules are for AI coding instructions, not terminal commands. Wrap in code blocks or remove.',
        });
        break;
      }
    }
  }

  return { file: filePath, issues };
}

async function lintSkillFile(filePath) {
  var content;
  try { content = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'); } catch (e) {
    return { file: filePath, issues: [{ severity: 'error', message: 'Cannot read file: ' + e.code }] };
  }
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

  // Vague rules (context-aware)
  issues.push(...findVagueRules(content));

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
  var content;
  try { content = fs.readFileSync(filePath, 'utf-8'); } catch (e) {
    return { file: filePath, issues: [{ severity: 'error', message: 'Cannot read file: ' + e.code }] };
  }
  const issues = [];

  issues.push({
    severity: 'warning',
    message: '.cursorrules may be ignored in agent mode',
    hint: 'Use .cursor/rules/*.mdc with alwaysApply: true for agent mode compatibility',
  });

  // Vague rules (context-aware)
  issues.push(...findVagueRules(content));

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
  
  if (mdcFiles.length > 15 && subdirs.length === 0) {
    issues.push({
      severity: 'info',
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
  const genericNames = ['rules.mdc', 'misc.mdc', 'config.mdc', 'setup.mdc', 'default.mdc'];
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
  // Only flag when names differ by just a "-rules" suffix (e.g., typescript.mdc and typescript-rules.mdc)
  // Don't flag topic-prefixed names (e.g., typescript.mdc and typescript-types.mdc) — these are distinct topics
  const basenames = mdcFiles.map(f => f.replace(/\.mdc$/, ''));
  for (let i = 0; i < basenames.length; i++) {
    for (let j = i + 1; j < basenames.length; j++) {
      const a = basenames[i];
      const b = basenames[j];
      // Only flag if they differ by a -rules/-rule suffix (redundant naming)
      if (a.replace(/-rules?$/, '') === b.replace(/-rules?$/, '') && a !== b) {
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
      
      if (stat.isFile() && !['hooks.json', 'environment.json', 'agents.json', 'mcp.json'].includes(entry)) {
        issues.push({
          severity: 'info',
          message: `Unexpected file in .cursor/: ${entry}`,
          hint: '.cursor/ should contain only rules/, hooks.json, mcp.json, environment.json, or agents.json.',
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
    const minSize = Math.min(agentsWords.size, claudeWords.size);
    const overlapRatio = minSize > 0 ? intersection.size / minSize : 0;
    
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
      var content;
      try { content = fs.readFileSync(filePath, 'utf-8'); } catch (e) { continue; }

      // Agent files are plain markdown — frontmatter is optional
      // Just check they have content
      if (content.trim().length === 0) {
        issues.push({
          severity: 'error',
          message: `Agent file ${file} is empty`,
          hint: 'Add agent behavior instructions or remove the file.',
        });
      } else if (content.trim().length < 20) {
        issues.push({
          severity: 'warning',
          message: `Agent file ${file} is very short (${content.trim().length} chars)`,
          hint: 'Agent files should contain enough detail for the agent to understand its role.',
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
    try {
      const entries = fs.readdirSync(rulesDir);
      for (const entry of entries) {
        if (entry.endsWith('.mdc')) {
          results.push(await lintMdcFile(path.join(rulesDir, entry)));
        }
      }
    } catch (e) {
      if (e.code === 'EACCES') {
        results.push({
          file: rulesDir,
          issues: [{
            severity: 'error',
            message: 'Permission denied: Cannot read .cursor/rules/ directory',
            hint: 'Check file permissions with: ls -la .cursor/rules/',
          }],
        });
      } else {
        throw e;
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
    let mdcFiles;
    try {
      mdcFiles = fs.readdirSync(rulesDirPath).filter(f => f.endsWith('.mdc'));
    } catch (e) {
      if (e.code === 'EACCES') {
        // Already reported above
        mdcFiles = [];
      } else {
        throw e;
      }
    }
    
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
        var dupContent;
        try { dupContent = fs.readFileSync(filePath, 'utf-8'); } catch (e) { continue; }
        const body = getBody(dupContent);
        const fm = parseFrontmatter(dupContent);
        parsed.push({ file, filePath, body, description: fm.data && fm.data.description ? fm.data.description : undefined });
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
  try {
    const structureIssues = await lintProjectStructure(dir);
    if (structureIssues.length > 0) {
      results.push({
        file: path.join(dir, '.cursor/'),
        issues: structureIssues,
      });
    }
  } catch (e) { /* structure lint failed gracefully */ }

  // NEW: Run context file checks
  try {
    const contextIssues = await lintContextFiles(dir);
    if (contextIssues.length > 0) {
      results.push({
        file: dir,
        issues: contextIssues,
      });
    }
  } catch (e) { /* context lint failed gracefully */ }

  // NEW: Run config checks
  try {
    const configIssues = await lintCursorConfig(dir);
    if (configIssues.length > 0) {
      results.push({
        file: path.join(dir, '.cursor/'),
        issues: configIssues,
      });
    }
  } catch (e) { /* config lint failed gracefully */ }

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW PROJECT-LEVEL CURSOR-SPECIFIC RULES
  // ═══════════════════════════════════════════════════════════════════════════

  // 23. Multiple rules have identical globs (cross-file check)
  if (fs.existsSync(rulesDirPath) && fs.statSync(rulesDirPath).isDirectory()) {
    let mdcFiles;
    try {
      mdcFiles = fs.readdirSync(rulesDirPath).filter(f => f.endsWith('.mdc'));
    } catch (e) {
      if (e.code === 'EACCES') {
        mdcFiles = [];
      } else {
        throw e;
      }
    }
    if (mdcFiles.length > 1) {
      const globsByFile = [];
      for (const file of mdcFiles) {
        const filePath = path.join(rulesDirPath, file);
        var fileContent;
        try { fileContent = fs.readFileSync(filePath, 'utf-8'); } catch (e) { continue; }
        const fm = parseFrontmatter(fileContent);
        if (fm.data && fm.data.globs) {
          const globs = parseGlobs(fm.data.globs);
          globsByFile.push({ file, globs });
        }
      }

      // Check for identical glob sets — group by glob signature to avoid O(n²) output
      const globSignatureMap = {};
      for (const entry of globsByFile) {
        const sig = [...new Set(entry.globs)].sort().join('|');
        if (!globSignatureMap[sig]) globSignatureMap[sig] = [];
        globSignatureMap[sig].push(entry.file);
      }
      for (const sig of Object.keys(globSignatureMap)) {
        const files = globSignatureMap[sig];
        if (files.length > 1) {
          results.push({
            file: rulesDirPath,
            issues: [{
              severity: 'info',
              message: `${files.length} rules share identical globs: ${files.join(', ')}`,
              hint: 'These rules target the same files. This is fine if they cover different topics. Consider merging if they overlap in purpose.',
            }],
          });
        }
      }
    }
  }

  // 27. Glob doesn't match any files in project (info-level, collapsed per file)
  if (fs.existsSync(rulesDirPath) && fs.statSync(rulesDirPath).isDirectory()) {
    let mdcFiles;
    try {
      mdcFiles = fs.readdirSync(rulesDirPath).filter(f => f.endsWith('.mdc'));
    } catch (e) {
      if (e.code === 'EACCES') {
        mdcFiles = [];
      } else {
        throw e;
      }
    }
    // Build a cache of which extensions exist in the project
    const existingExts = new Set();
    const scanExts = (dirPath, depth = 0) => {
      if (depth > 5) return;
      try {
        const entries = fs.readdirSync(dirPath);
        for (const entry of entries) {
          if (entry.startsWith('.') && entry !== '.cursor') continue;
          const fullPath = path.join(dirPath, entry);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory() && entry !== 'node_modules') {
            scanExts(fullPath, depth + 1);
          } else if (stat.isFile()) {
            const dotIdx = entry.lastIndexOf('.');
            if (dotIdx > 0) existingExts.add(entry.slice(dotIdx + 1));
          }
        }
      } catch {}
    };
    scanExts(dir);

    for (const file of mdcFiles) {
      const filePath = path.join(rulesDirPath, file);
      var fileContent;
      try { fileContent = fs.readFileSync(filePath, 'utf-8'); } catch (e) { continue; }
      const fm = parseFrontmatter(fileContent);
      if (fm.data && fm.data.globs) {
        const globs = parseGlobs(fm.data.globs);
        const unmatchedGlobs = [];
        for (const glob of globs) {
          const extMatch = glob.match(/\*\.(\w+)$/);
          if (extMatch && !existingExts.has(extMatch[1])) {
            unmatchedGlobs.push(glob);
          }
        }
        // Collapse into one issue per file
        if (unmatchedGlobs.length > 0 && unmatchedGlobs.length === globs.length) {
          // ALL globs unmatched — single warning
          results.push({
            file: filePath,
            issues: [{
              severity: 'info',
              message: `No matching files for globs: ${unmatchedGlobs.join(', ')}`,
              hint: 'None of this rule\'s glob patterns match existing files. Verify the patterns or remove the rule if unused.',
            }],
          });
        } else if (unmatchedGlobs.length > 0) {
          // Some globs unmatched
          results.push({
            file: filePath,
            issues: [{
              severity: 'info',
              message: `Glob${unmatchedGlobs.length > 1 ? 's' : ''} match no files: ${unmatchedGlobs.join(', ')}`,
              hint: 'These glob patterns match zero existing files. Verify they\'re correct or remove them.',
            }],
          });
        }
      }
    }
  }

  // 40. Excessive alwaysApply rules (project-level)
  if (fs.existsSync(rulesDirPath) && fs.statSync(rulesDirPath).isDirectory()) {
    let mdcFiles;
    try {
      mdcFiles = fs.readdirSync(rulesDirPath).filter(f => f.endsWith('.mdc'));
    } catch (e) {
      if (e.code === 'EACCES') {
        mdcFiles = [];
      } else {
        throw e;
      }
    }
    let alwaysApplyCount = 0;
    for (const file of mdcFiles) {
      const filePath = path.join(rulesDirPath, file);
      var fileContent;
      try { fileContent = fs.readFileSync(filePath, 'utf-8'); } catch (e) { continue; }
      const fm = parseFrontmatter(fileContent);
      if (fm.data && fm.data.alwaysApply === true) {
        alwaysApplyCount++;
      }
    }
    if (alwaysApplyCount > 5) {
      results.push({
        file: rulesDirPath,
        issues: [{
          severity: 'warning',
          message: `Project has ${alwaysApplyCount} rules with alwaysApply:true`,
          hint: 'Too many global rules waste context tokens on every request. Use globs to scope rules to specific files.',
        }],
      });
    }
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

// Semantic contradiction patterns (20+ pairs)
const SEMANTIC_PAIRS = [
  // Style contradictions - indentation
  { a: /\buse\s+tabs\b/i, b: /\buse\s+spaces\b/i, topic: 'indentation style' },
  { a: /\btabs\s+for\s+indentation\b/i, b: /\bspaces\s+for\s+indentation\b/i, topic: 'indentation style' },
  
  // Style contradictions - semicolons
  { a: /\bsemicolons?\b.*\brequir/i, b: /\bno\s+semicolons?\b/i, topic: 'semicolons' },
  { a: /\balways\s+use\s+semicolons?\b/i, b: /\bomit\s+semicolons?\b/i, topic: 'semicolons' },
  { a: /\bsemicolons?\b.*\bmandatory\b/i, b: /\bsemicolons?\b.*\boptional\b/i, topic: 'semicolons' },
  
  // Style contradictions - quotes
  { a: /\bsingle\s+quotes?\b/i, b: /\bdouble\s+quotes?\b/i, topic: 'quote style' },
  { a: /\buse\s+['`]\b/i, b: /\buse\s+["`]\b/i, topic: 'quote style' },
  
  // Style contradictions - naming conventions
  { a: /\buse\s+camelCase\b/i, b: /\buse\s+snake_case\b/i, topic: 'naming convention' },
  { a: /\buse\s+camelCase\b/i, b: /\buse\s+PascalCase\b/i, topic: 'naming convention' },
  { a: /\buse\s+snake_case\b/i, b: /\buse\s+PascalCase\b/i, topic: 'naming convention' },
  { a: /\bcamelCase\b.*\bvariables?\b/i, b: /\bsnake_case\b.*\bvariables?\b/i, topic: 'naming convention' },
  
  // Pattern contradictions - React components
  { a: /\buse\s+functional\s+components?\b/i, b: /\buse\s+class\s+components?\b/i, topic: 'React component style' },
  { a: /\bprefer\s+functional\s+components?\b/i, b: /\bprefer\s+class\s+components?\b/i, topic: 'React component style' },
  { a: /\bfunction\s+components?\b.*\bonly\b/i, b: /\bclass\s+components?\b.*\bonly\b/i, topic: 'React component style' },
  
  // Pattern contradictions - async patterns
  { a: /\buse\s+async\/await\b/i, b: /\buse\s+callbacks?\b/i, topic: 'async pattern' },
  { a: /\bprefer\s+async\/await\b/i, b: /\bprefer\s+promises?\b/i, topic: 'async pattern' },
  { a: /\bprefer\s+async\/await\b/i, b: /\bprefer\s+callbacks?\b/i, topic: 'async pattern' },
  { a: /\balways\s+use\s+promises?\b/i, b: /\bavoid\s+promises?\b/i, topic: 'async pattern' },
  
  // Pattern contradictions - TypeScript
  { a: /\buse\s+interfaces?\b/i, b: /\buse\s+types?\b/i, topic: 'TypeScript type definition' },
  { a: /\bprefer\s+interfaces?\b/i, b: /\bprefer\s+type\s+aliases?\b/i, topic: 'TypeScript type definition' },
  { a: /\binterfaces?\b.*\bonly\b/i, b: /\btypes?\b.*\bonly\b/i, topic: 'TypeScript type definition' },
  
  // Pattern contradictions - OOP vs FP
  { a: /\bprefer\s+composition\b/i, b: /\bprefer\s+inheritance\b/i, topic: 'code organization pattern' },
  { a: /\buse\s+composition\b/i, b: /\buse\s+inheritance\b/i, topic: 'code organization pattern' },
  { a: /\bfavor\s+composition\b/i, b: /\bfavor\s+inheritance\b/i, topic: 'code organization pattern' },
  
  // Length contradictions - file size
  { a: /\bfiles?\s+under\s+100\s+lines?\b/i, b: /\bfiles?\s+under\s+500\s+lines?\b/i, topic: 'file length limit' },
  { a: /\bkeep\s+files?\s+under\s+100\b/i, b: /\bkeep\s+files?\s+under\s+200\b/i, topic: 'file length limit' },
  { a: /\bmax(?:imum)?\s+100\s+lines?\b/i, b: /\bmax(?:imum)?\s+500\s+lines?\b/i, topic: 'file length limit' },
  
  // Length contradictions - parameters
  { a: /\bmax(?:imum)?\s+2\s+parameters?\b/i, b: /\bmax(?:imum)?\s+5\s+parameters?\b/i, topic: 'parameter count limit' },
  { a: /\bno\s+more\s+than\s+2\s+parameters?\b/i, b: /\bno\s+more\s+than\s+4\s+parameters?\b/i, topic: 'parameter count limit' },
  
  // Negation detection - general
  { a: /\balways\s+use\s+(\w+)/i, b: /\bnever\s+use\s+\1\b/i, topic: 'contradictory always/never' },
  { a: /\bprefer\s+(\w+)/i, b: /\bavoid\s+\1\b/i, topic: 'contradictory prefer/avoid' },
  { a: /\brequire\s+(\w+)/i, b: /\bforbid\s+\1\b/i, topic: 'contradictory require/forbid' },
  
  // Negation detection - specific patterns
  { a: /\balways\s+add\s+comments?\b/i, b: /\bavoid\s+comments?\b/i, topic: 'code comments' },
  { a: /\balways\s+add\s+comments?\b/i, b: /\bno\s+comments?\b/i, topic: 'code comments' },
  { a: /\buse\s+default\s+exports?\b/i, b: /\buse\s+named\s+exports?\b/i, topic: 'export style' },
  { a: /\bprefer\s+default\s+exports?\b/i, b: /\bprefer\s+named\s+exports?\b/i, topic: 'export style' },
  { a: /\bexport\s+default\b.*\bonly\b/i, b: /\bnamed\s+exports?\b.*\bonly\b/i, topic: 'export style' },
  
  // Additional contradictions - const vs let
  { a: /\bprefer\s+const\b/i, b: /\bprefer\s+let\b/i, topic: 'variable declaration' },
  { a: /\balways\s+use\s+const\b/i, b: /\bavoid\s+const\b/i, topic: 'variable declaration' },
  
  // Additional contradictions - arrow functions
  { a: /\buse\s+arrow\s+functions?\b/i, b: /\buse\s+function\s+declarations?\b/i, topic: 'function syntax' },
  { a: /\bprefer\s+arrow\s+functions?\b/i, b: /\bavoid\s+arrow\s+functions?\b/i, topic: 'function syntax' },
  
  // Additional contradictions - comments
  { a: /\bdocument\s+everything\b/i, b: /\bself-documenting\s+code\b/i, topic: 'documentation approach' },
  { a: /\brequire\s+JSDoc\b/i, b: /\bavoid\s+JSDoc\b/i, topic: 'documentation approach' },
];

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

  let files;
  try {
    files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.mdc'));
  } catch (e) {
    if (e.code === 'EACCES') {
      return [];
    }
    throw e;
  }
  if (files.length < 2) return [];

  const parsed = [];
  for (const file of files) {
    const filePath = path.join(rulesDir, file);
    var conflictContent;
    try { conflictContent = fs.readFileSync(filePath, 'utf-8'); } catch (e) { continue; }
    const fm = parseFrontmatter(conflictContent);
    const globs = fm.data ? parseGlobs(fm.data.globs) : [];
    const alwaysApply = fm.data && fm.data.alwaysApply;
    const directives = extractDirectives(conflictContent);
    const body = getBody(conflictContent);
    parsed.push({ file, filePath, globs, alwaysApply, directives, content: conflictContent, body });
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

      // NEW: Semantic conflict detection
      // Check all semantic pairs for contradictions
      for (const pair of SEMANTIC_PAIRS) {
        const aMatches = pair.a.test(a.body);
        const bMatches = pair.b.test(b.body);
        
        if (aMatches && bMatches) {
          // Found semantic contradiction
          const aMatch = a.body.match(pair.a);
          const bMatch = b.body.match(pair.b);
          const aText = aMatch ? aMatch[0] : pair.a.source;
          const bText = bMatch ? bMatch[0] : pair.b.source;
          
          issues.push({
            severity: 'error',
            message: `Semantic conflict in ${pair.topic}: ${a.file} says "${aText}" but ${b.file} says "${bText}"`,
            hint: `Conflicting ${pair.topic} directives confuse the AI model. Choose one approach and apply it consistently.`,
          });
        }
        
        // Also check reverse (b matches pattern a, a matches pattern b)
        const aMatchesB = pair.b.test(a.body);
        const bMatchesA = pair.a.test(b.body);
        
        if (aMatchesB && bMatchesA) {
          const aMatch = a.body.match(pair.b);
          const bMatch = b.body.match(pair.a);
          const aText = aMatch ? aMatch[0] : pair.b.source;
          const bText = bMatch ? bMatch[0] : pair.a.source;
          
          // Only report if we haven't already reported this pair
          const alreadyReported = issues.some(issue => 
            issue.message.includes(a.file) && 
            issue.message.includes(b.file) && 
            issue.message.includes(pair.topic)
          );
          
          if (!alreadyReported) {
            issues.push({
              severity: 'error',
              message: `Semantic conflict in ${pair.topic}: ${a.file} says "${aText}" but ${b.file} says "${bText}"`,
              hint: `Conflicting ${pair.topic} directives confuse the AI model. Choose one approach and apply it consistently.`,
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
