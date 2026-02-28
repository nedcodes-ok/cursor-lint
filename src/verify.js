const fs = require('fs');
const path = require('path');

/**
 * Verify codebase files against rules with verify: blocks
 * Zero dependencies — uses simple YAML parsing and manual glob
 */
async function verifyProject(projectPath) {
  const results = {
    rules: [],
    violations: [],
    stats: {
      rulesWithVerify: 0,
      filesChecked: 0,
      filesWithViolations: 0,
      totalViolations: 0
    }
  };

  const mdcDir = path.join(projectPath, '.cursor', 'rules');
  if (!fs.existsSync(mdcDir)) {
    return results;
  }

  const mdcFiles = fs.readdirSync(mdcDir).filter(f => f.endsWith('.mdc'));

  for (const file of mdcFiles) {
    const fullPath = path.join(mdcDir, file);
    const content = fs.readFileSync(fullPath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const frontmatter = parseFrontmatter(content);
    
    if (!frontmatter.data || !frontmatter.data.verify) {
      continue;
    }

    results.rules.push({
      file,
      globs: frontmatter.data.globs || ['**/*'],
      verify: frontmatter.data.verify
    });
    results.stats.rulesWithVerify++;
  }

  if (results.rules.length === 0) {
    return results;
  }

  for (const rule of results.rules) {
    const globs = Array.isArray(rule.globs) ? rule.globs : [rule.globs];
    const matchingFiles = findFiles(projectPath, globs);

    for (const file of matchingFiles) {
      results.stats.filesChecked++;
      const fullPath = path.join(projectPath, file);
      
      try {
        const stats = fs.statSync(fullPath);
        if (stats.size > 1024 * 1024) continue;
      } catch (e) {
        continue;
      }

      let content;
      try {
        content = fs.readFileSync(fullPath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      } catch (e) {
        continue;
      }

      const fileViolations = checkFile(file, content, rule.verify, rule.file);
      
      if (fileViolations.length > 0) {
        results.stats.filesWithViolations++;
        results.stats.totalViolations += fileViolations.length;
        results.violations.push(...fileViolations);
      }
    }
  }

  return results;
}

function checkFile(filePath, content, verifyBlocks, ruleFile) {
  const violations = [];

  for (const block of verifyBlocks) {
    if (block.pattern) {
      try {
        const regex = new RegExp(block.pattern, 'm');
        if (!regex.test(content)) {
          violations.push({
            file: filePath,
            ruleFile,
            type: 'missing-pattern',
            message: block.message || `Missing required pattern: ${block.pattern}`,
            pattern: block.pattern
          });
        }
      } catch (e) {}
    }

    if (block.antipattern) {
      try {
        const regex = new RegExp(block.antipattern, 'gm');
        let match;
        while ((match = regex.exec(content)) !== null) {
          const lineNum = content.substring(0, match.index).split('\n').length;
          violations.push({
            file: filePath,
            ruleFile,
            type: 'antipattern',
            message: block.message || `Forbidden pattern found: ${block.antipattern}`,
            pattern: block.antipattern,
            line: lineNum,
            match: match[0].substring(0, 50) + (match[0].length > 50 ? '...' : '')
          });
        }
      } catch (e) {}
    }

    if (block.required) {
      if (!content.includes(block.required)) {
        violations.push({
          file: filePath,
          ruleFile,
          type: 'missing-required',
          message: block.message || `Missing required string: "${block.required}"`,
          required: block.required
        });
      }
    }

    if (block.forbidden) {
      const index = content.indexOf(block.forbidden);
      if (index !== -1) {
        const lineNum = content.substring(0, index).split('\n').length;
        violations.push({
          file: filePath,
          ruleFile,
          type: 'forbidden',
          message: block.message || `Forbidden string found: "${block.forbidden}"`,
          forbidden: block.forbidden,
          line: lineNum
        });
      }
    }
  }

  return violations;
}

/**
 * Simple frontmatter parser that handles verify blocks
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return { data: null };
  }
  
  try {
    const data = parseSimpleYaml(match[1]);
    return { data };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Minimal YAML parser for frontmatter with verify blocks
 */
function parseSimpleYaml(text) {
  const data = {};
  const lines = text.split('\n');
  let currentKey = null;
  let currentList = null;
  let currentItem = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Top-level key: value
    const kvMatch = line.match(/^(\w+):\s*(.+)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      currentList = null;
      currentItem = null;
      let val = kvMatch[2].trim();
      // Handle arrays like ["*.ts", "*.tsx"]
      if (val.startsWith('[') && val.endsWith(']')) {
        data[currentKey] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      } else if (val === 'true') {
        data[currentKey] = true;
      } else if (val === 'false') {
        data[currentKey] = false;
      } else {
        data[currentKey] = unquote(val);
      }
      continue;
    }

    // Top-level key with no value (starts a block)
    const blockMatch = line.match(/^(\w+):$/);
    if (blockMatch) {
      currentKey = blockMatch[1];
      currentList = [];
      currentItem = null;
      data[currentKey] = currentList;
      continue;
    }

    // List item start
    if (currentList !== null && line.match(/^\s+-\s+\w+:/)) {
      const itemMatch = line.match(/^\s+-\s+(\w+):\s*(.+)$/);
      if (itemMatch) {
        currentItem = {};
        let val = unquote(itemMatch[2].trim());
        currentItem[itemMatch[1]] = val;
        currentList.push(currentItem);
      }
      continue;
    }

    // Continuation of list item
    if (currentItem && line.match(/^\s+\w+:/)) {
      const contMatch = line.match(/^\s+(\w+):\s*(.+)$/);
      if (contMatch) {
        let val = unquote(contMatch[2].trim());
        currentItem[contMatch[1]] = val;
      }
      continue;
    }
  }

  return data;
}

/**
 * Remove quotes and handle escape sequences
 */
function unquote(val) {
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
    // Handle YAML escape sequences in double-quoted strings
    val = val.replace(/\\\\/g, '\\');
  }
  return val;
}

/**
 * Simple file finder matching glob patterns
 */
function findFiles(baseDir, patterns) {
  const files = [];
  const ignore = ['node_modules', '.git', '.cursor'];
  
  function walk(dir, rel) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    
    for (const entry of entries) {
      if (ignore.includes(entry.name)) continue;
      if (entry.isSymbolicLink()) continue; // Skip symlinks for security
      
      const fullPath = path.join(dir, entry.name);
      const relPath = rel ? path.join(rel, entry.name) : entry.name;
      
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.isFile()) {
        for (const pattern of patterns) {
          if (matchGlob(relPath, pattern)) {
            files.push(relPath);
            break;
          }
        }
      }
    }
  }
  
  walk(baseDir, '');
  return files;
}

/**
 * Simple glob matching (supports *, **, and extensions like *.ts)
 */
function matchGlob(filePath, pattern) {
  // Simple extension match: *.ts, *.tsx, etc.
  if (pattern.startsWith('*.')) {
    return filePath.endsWith(pattern.slice(1));
  }
  // **/*.ext
  if (pattern.startsWith('**/')) {
    return matchGlob(filePath, pattern.slice(3));
  }
  // Direct match
  return filePath === pattern;
}

module.exports = { verifyProject, checkFile };
