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

module.exports = { lintProject, lintMdcFile, lintCursorrules, detectConflicts };
