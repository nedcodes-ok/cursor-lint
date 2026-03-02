'use strict';

/**
 * Shared YAML frontmatter parser for .mdc rule files.
 * Single source of truth — all modules import from here.
 */
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

module.exports = { parseFrontmatter };
