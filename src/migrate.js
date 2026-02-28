const fs = require('fs');
const path = require('path');

function migrate(dir) {
  const cursorrules = path.join(dir, '.cursorrules');
  const result = { created: [], skipped: [], source: null, error: null };

  if (!fs.existsSync(cursorrules)) {
    result.error = 'No .cursorrules file found in this directory';
    return result;
  }

  const content = fs.readFileSync(cursorrules, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  result.source = { file: '.cursorrules', chars: content.length, lines: content.split('\n').length };

  if (content.length === 0) {
    result.error = '.cursorrules file is empty';
    return result;
  }

  const rulesDir = path.join(dir, '.cursor', 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });

  // Try to split by markdown headings (## or #)
  const sections = splitBySections(content);

  if (sections.length <= 1) {
    // Single file migration
    const filename = 'project-rules.mdc';
    const destPath = path.join(rulesDir, filename);
    if (fs.existsSync(destPath)) {
      result.skipped.push(filename);
    } else {
      const mdc = wrapInMdc(content, 'Project rules migrated from .cursorrules');
      fs.writeFileSync(destPath, mdc, 'utf-8');
      result.created.push(filename);
    }
  } else {
    // Multi-file migration
    for (const section of sections) {
      const filename = slugify(section.title) + '.mdc';
      const destPath = path.join(rulesDir, filename);
      if (fs.existsSync(destPath)) {
        result.skipped.push(filename);
      } else {
        const mdc = wrapInMdc(section.body, section.title);
        fs.writeFileSync(destPath, mdc, 'utf-8');
        result.created.push(filename);
      }
    }
  }

  return result;
}

function splitBySections(content) {
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

  // If no headings found, check for content before first heading
  if (sections.length === 0) {
    return [{ title: 'Project Rules', body: content }];
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

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'rule';
}

function wrapInMdc(body, description) {
  return `---
description: "${description.replace(/"/g, '\\"')}"
alwaysApply: true
---

${body}
`;
}

module.exports = { migrate };
