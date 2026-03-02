const fs = require('fs');
const path = require('path');
const { lintProject } = require('./index');

/**
 * Enhanced migration wizard: Convert .cursorrules to .mdc with smart splitting,
 * intelligent frontmatter generation, and post-migration validation.
 */
function migrate(dir, options) {
  options = options || {};
  const dryRun = options.dryRun || false;
  const force = options.force || false;
  
  const cursorrules = path.join(dir, '.cursorrules');
  const result = { 
    created: [], 
    skipped: [], 
    warnings: [],
    source: null, 
    error: null,
    lintIssues: 0 
  };

  // Check if .cursorrules exists
  if (!fs.existsSync(cursorrules)) {
    result.error = 'No .cursorrules file found. Already using .mdc format, or run this from your project root.';
    return result;
  }

  const content = fs.readFileSync(cursorrules, 'utf-8')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
    
  result.source = { 
    file: '.cursorrules', 
    chars: content.length, 
    lines: content.split('\n').length 
  };

  if (content.length === 0) {
    result.error = '.cursorrules file is empty';
    return result;
  }

  const rulesDir = path.join(dir, '.cursor', 'rules');
  
  // Safety check: warn if .cursor/rules/ already has files
  if (fs.existsSync(rulesDir)) {
    const existing = fs.readdirSync(rulesDir).filter(f => f.endsWith('.mdc'));
    if (existing.length > 0 && !force) {
      result.error = `Found ${existing.length} existing .mdc file(s) in .cursor/rules/. Use --force to overwrite.`;
      return result;
    }
  }

  // Create rules directory
  if (!dryRun) {
    fs.mkdirSync(rulesDir, { recursive: true });
  }

  // Smart splitting: try multiple strategies
  const sections = smartSplit(content);

  // Generate and write .mdc files
  const filesCreated = [];
  
  for (const section of sections) {
    const filename = section.filename;
    const destPath = path.join(rulesDir, filename);
    
    if (fs.existsSync(destPath) && !force) {
      result.skipped.push({ file: filename, reason: 'already exists' });
      continue;
    }

    const mdc = generateMdc(section);
    
    if (!dryRun) {
      fs.writeFileSync(destPath, mdc, 'utf-8');
    }
    
    result.created.push({
      file: filename,
      description: section.frontmatter.description,
      globs: section.frontmatter.globs,
      alwaysApply: section.frontmatter.alwaysApply,
      tokens: Math.ceil(section.body.length / 4) // rough token estimate
    });
    
    filesCreated.push(destPath);
  }

  // Safety: rename .cursorrules to .cursorrules.bak (don't delete)
  if (!dryRun && result.created.length > 0) {
    const backupPath = cursorrules + '.bak';
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
    fs.renameSync(cursorrules, backupPath);
    result.backupCreated = '.cursorrules.bak';
  }

  // Post-migration lint
  if (!dryRun && filesCreated.length > 0) {
    try {
      const lintResults = lintProject(dir);
      const newFileLints = lintResults.filter(r => 
        filesCreated.some(created => r.file === created)
      );
      
      let totalIssues = 0;
      for (const lint of newFileLints) {
        totalIssues += lint.issues.length;
        if (lint.issues.length > 0) {
          result.warnings.push({
            file: path.basename(lint.file),
            issues: lint.issues.map(i => i.message)
          });
        }
      }
      result.lintIssues = totalIssues;
    } catch (e) {
      // Lint failed, but don't block migration
      result.warnings.push({ file: 'lint', issues: ['Lint check failed: ' + e.message] });
    }
  }

  return result;
}

/**
 * Smart splitting: uses multiple strategies to intelligently split .cursorrules
 * 1. Markdown headings (## Section)
 * 2. Triple-dash delimiters (---)
 * 3. Blank line + topic change heuristic
 */
function smartSplit(content) {
  const sections = [];
  
  // Strategy 1: Try markdown headings first
  const headingSections = splitByHeadings(content);
  
  if (headingSections.length > 1) {
    // Headings worked well
    return headingSections.map(s => enhanceSection(s));
  }
  
  // Strategy 2: Try triple-dash delimiters
  if (content.includes('\n---\n')) {
    const dashSections = splitByDashes(content);
    if (dashSections.length > 1) {
      return dashSections.map(s => enhanceSection(s));
    }
  }
  
  // Strategy 3: Heuristic-based splitting for long sections
  const heuristicSections = splitByHeuristic(content);
  if (heuristicSections.length > 1) {
    return heuristicSections.map(s => enhanceSection(s));
  }
  
  // Fallback: single file
  return [enhanceSection({ title: 'Project Rules', body: content })];
}

/**
 * Split by markdown headings (# or ##)
 */
function splitByHeadings(content) {
  const lines = content.split('\n');
  const sections = [];
  let currentTitle = null;
  let currentBody = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,2}\s+(.+)/);
    if (headingMatch) {
      if (currentTitle !== null) {
        sections.push({ title: currentTitle, body: currentBody.join('\n').trim() });
      }
      currentTitle = headingMatch[1].trim();
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  // Push last section
  if (currentTitle !== null) {
    sections.push({ title: currentTitle, body: currentBody.join('\n').trim() });
  }

  // If there's content before the first heading, include it
  const firstHeadingIdx = content.search(/^#{1,2}\s+/m);
  if (firstHeadingIdx > 0) {
    const preamble = content.slice(0, firstHeadingIdx).trim();
    if (preamble.length > 20) {
      sections.unshift({ title: 'General', body: preamble });
    }
  }

  // Filter out empty sections
  return sections.filter(s => s.body.length > 10);
}

/**
 * Split by triple-dash delimiters
 */
function splitByDashes(content) {
  const parts = content.split(/\n---+\n/);
  const sections = [];
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (part.length < 20) continue;
    
    // Try to extract a title from the first line or heading
    const lines = part.split('\n');
    let title = null;
    let body = part;
    
    for (let j = 0; j < Math.min(3, lines.length); j++) {
      const headingMatch = lines[j].match(/^#{1,2}\s+(.+)/);
      if (headingMatch) {
        title = headingMatch[1].trim();
        body = lines.slice(j + 1).join('\n').trim();
        break;
      }
    }
    
    if (!title) {
      // Derive title from first meaningful line
      const firstLine = lines.find(l => l.trim().length > 5 && !l.trim().startsWith('#'));
      title = firstLine ? inferTitleFromLine(firstLine) : `Section ${i + 1}`;
    }
    
    // Clean trailing dash delimiters from body
    body = body.replace(/\n---+\s*$/, '').trim();
    
    sections.push({ title, body });
  }
  
  return sections.filter(s => s.body.length > 10);
}

/**
 * Heuristic-based splitting for long sections without clear delimiters
 */
function splitByHeuristic(content) {
  const lines = content.split('\n');
  if (lines.length < 25) {
    // Too short to split heuristically
    return [{ title: 'Project Rules', body: content }];
  }
  
  const sections = [];
  let currentChunk = [];
  let currentTopic = null;
  let blankLineCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (trimmed.length === 0) {
      blankLineCount++;
      currentChunk.push(line);
      continue;
    }
    
    // Detect topic change: after 2+ blank lines and chunk has meaningful content
    if (blankLineCount >= 2 && currentChunk.length > 5) {
      const topic = currentTopic || inferTopic(currentChunk);
      const body = currentChunk.join('\n').trim();
      if (body.length > 50) {
        sections.push({ title: topic, body });
      }
      currentChunk = [];
      currentTopic = null;
    }
    
    blankLineCount = 0;
    
    // Try to detect topic from the line
    if (currentChunk.length === 0 || currentChunk.length < 3) {
      const detectedTopic = detectTopicKeywords(trimmed);
      if (detectedTopic && !currentTopic) {
        currentTopic = detectedTopic;
      }
    }
    
    currentChunk.push(line);
  }
  
  // Push last chunk
  if (currentChunk.length > 5) {
    const topic = currentTopic || inferTopic(currentChunk);
    const body = currentChunk.join('\n').trim();
    if (body.length > 50) {
      sections.push({ title: topic, body });
    }
  }
  
  return sections.length > 1 ? sections : [{ title: 'Project Rules', body: content }];
}

/**
 * Enhance section with intelligent frontmatter
 */
function enhanceSection(section) {
  // Clean trailing dash delimiters from body (may come from any splitter)
  section.body = section.body.replace(/\n---+\s*$/, '').trim();
  
  const filename = slugify(section.title) + '.mdc';
  const description = deriveDescription(section.title, section.body);
  const globs = detectGlobs(section.body);
  const alwaysApply = globs.length === 0;
  
  return {
    title: section.title,
    body: section.body,
    filename,
    frontmatter: {
      description,
      globs: globs.length > 0 ? globs : undefined,
      alwaysApply
    }
  };
}

/**
 * Derive description from title and content
 */
function deriveDescription(title, body) {
  // Clean up title for description
  const cleanTitle = title
    .replace(/^\d+\.\s*/, '') // Remove leading numbers
    .replace(/^[-*]\s*/, '') // Remove bullets
    .trim();
  
  // Try to find a descriptive first line in the body
  const lines = body.split('\n').filter(l => {
    const t = l.trim();
    return t.length > 10 && !t.startsWith('#') && !t.startsWith('```');
  });
  
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    if (firstLine.length < 100 && firstLine.length > 15) {
      return firstLine;
    }
  }
  
  return cleanTitle;
}

/**
 * Detect appropriate globs from content
 */
function detectGlobs(content) {
  const lower = content.toLowerCase();
  const globs = [];
  
  // TypeScript detection
  if (lower.includes('typescript') || lower.includes('.ts file') || lower.includes('*.ts')) {
    globs.push('**/*.ts');
    if (lower.includes('react') || lower.includes('tsx')) {
      globs.push('**/*.tsx');
    }
  }
  
  // React/JSX detection
  if (lower.includes('react') || lower.includes('component') || lower.includes('jsx')) {
    if (!globs.includes('**/*.tsx')) globs.push('**/*.tsx');
    globs.push('**/*.jsx');
  }
  
  // JavaScript detection
  if (lower.includes('javascript') || lower.includes('.js file') || lower.includes('*.js')) {
    if (globs.length === 0) { // Only add if no TS already
      globs.push('**/*.js');
    }
  }
  
  // Test file detection
  if (lower.includes('test') || lower.includes('spec') || lower.includes('testing')) {
    globs.push('**/*.test.*', '**/*.spec.*');
  }
  
  // CSS/Style detection (require actual CSS keywords, not just "style")
  if (lower.includes('css') || lower.includes('scss') || lower.includes('sass') || lower.includes('stylesheet')) {
    globs.push('**/*.css', '**/*.scss', '**/*.sass');
  }
  
  // Python detection
  if (lower.includes('python') || lower.includes('.py file') || lower.includes('*.py')) {
    globs.push('**/*.py');
  }
  
  // Go detection
  if (lower.includes('golang') || lower.includes(' go ') || lower.includes('.go file')) {
    globs.push('**/*.go');
  }
  
  // Rust detection
  if (lower.includes('rust') || lower.includes('.rs file')) {
    globs.push('**/*.rs');
  }
  
  // Java detection
  if (lower.includes('java') || lower.includes('.java file')) {
    globs.push('**/*.java');
  }
  
  // Markdown/docs detection
  if (lower.includes('markdown') || lower.includes('documentation') || lower.includes('.md file')) {
    globs.push('**/*.md');
  }
  
  // Config file detection
  if (lower.includes('config') || lower.includes('json') || lower.includes('yaml')) {
    if (lower.includes('json')) globs.push('**/*.json');
    if (lower.includes('yaml') || lower.includes('yml')) globs.push('**/*.yaml', '**/*.yml');
  }
  
  // Remove duplicates
  return [...new Set(globs)];
}

/**
 * Generate .mdc file with frontmatter
 */
function generateMdc(section) {
  const fm = section.frontmatter;
  let frontmatter = '---\n';
  frontmatter += `description: "${fm.description.replace(/"/g, '\\"')}"\n`;
  
  if (fm.globs && fm.globs.length > 0) {
    frontmatter += 'globs:\n';
    for (const glob of fm.globs) {
      frontmatter += `  - "${glob}"\n`;
    }
  } else {
    frontmatter += 'alwaysApply: true\n';
  }
  
  frontmatter += '---\n\n';
  
  return frontmatter + section.body;
}

/**
 * Slugify title for filename
 */
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'rule';
}

/**
 * Infer topic from chunk of lines
 */
function inferTopic(lines) {
  // Look for meaningful first few lines
  const meaningful = lines
    .map(l => l.trim())
    .filter(l => l.length > 10 && !l.startsWith('#') && !l.startsWith('```'))
    .slice(0, 5);
  
  if (meaningful.length > 0) {
    return inferTitleFromLine(meaningful[0]);
  }
  
  return 'General Rules';
}

/**
 * Infer title from a line of text
 */
function inferTitleFromLine(line) {
  // Extract first meaningful phrase (up to 40 chars)
  const cleaned = line
    .replace(/^[-*•]\s*/, '')
    .replace(/^\d+\.\s*/, '')
    .trim();
  
  const words = cleaned.split(/\s+/).slice(0, 6);
  return words.join(' ').slice(0, 40);
}

/**
 * Detect topic keywords in a line
 */
function detectTopicKeywords(line) {
  const lower = line.toLowerCase();
  
  if (lower.includes('typescript')) return 'TypeScript Rules';
  if (lower.includes('react')) return 'React Guidelines';
  if (lower.includes('testing') || lower.includes('test')) return 'Testing Rules';
  if (lower.includes('error') || lower.includes('exception')) return 'Error Handling';
  if (lower.includes('style') || lower.includes('format')) return 'Code Style';
  if (lower.includes('security')) return 'Security Guidelines';
  if (lower.includes('performance')) return 'Performance Rules';
  if (lower.includes('api')) return 'API Guidelines';
  if (lower.includes('database')) return 'Database Rules';
  
  return null;
}

module.exports = { migrate };
