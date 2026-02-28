const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SNAPSHOT_FILE = '.cursor-doctor-snapshot.json';

function hashContent(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function captureState(dir) {
  const state = { rules: {}, cursorrules: null, timestamp: new Date().toISOString() };

  // .cursorrules
  const cursorrules = path.join(dir, '.cursorrules');
  if (fs.existsSync(cursorrules)) {
    const content = fs.readFileSync(cursorrules, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    state.cursorrules = { hash: hashContent(content), tokens: estimateTokens(content), lines: content.split('\n').length };
  }

  // .cursor/rules/*.mdc
  const rulesDir = path.join(dir, '.cursor', 'rules');
  if (fs.existsSync(rulesDir) && fs.statSync(rulesDir).isDirectory()) {
    for (const entry of fs.readdirSync(rulesDir).filter(f => f.endsWith('.mdc')).sort()) {
      const content = fs.readFileSync(path.join(rulesDir, entry), 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      state.rules[entry] = { hash: hashContent(content), tokens: estimateTokens(content), lines: content.split('\n').length };
    }
  }

  return state;
}

function saveSnapshot(dir) {
  const state = captureState(dir);
  const snapshotPath = path.join(dir, SNAPSHOT_FILE);
  fs.writeFileSync(snapshotPath, JSON.stringify(state, null, 2), 'utf-8');
  return { path: snapshotPath, state };
}

function diffSnapshot(dir) {
  const snapshotPath = path.join(dir, SNAPSHOT_FILE);
  if (!fs.existsSync(snapshotPath)) {
    return { error: 'No snapshot found. Run cursor-doctor diff --save first.' };
  }

  const saved = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
  const current = captureState(dir);

  const changes = { added: [], removed: [], modified: [], unchanged: [], tokenDelta: 0, savedAt: saved.timestamp };

  // Compare rules
  const allFiles = new Set([...Object.keys(saved.rules), ...Object.keys(current.rules)]);
  
  for (const file of allFiles) {
    const s = saved.rules[file];
    const c = current.rules[file];

    if (!s && c) {
      changes.added.push({ file, tokens: c.tokens, lines: c.lines });
      changes.tokenDelta += c.tokens;
    } else if (s && !c) {
      changes.removed.push({ file, tokens: s.tokens, lines: s.lines });
      changes.tokenDelta -= s.tokens;
    } else if (s.hash !== c.hash) {
      changes.modified.push({ file, oldTokens: s.tokens, newTokens: c.tokens, oldLines: s.lines, newLines: c.lines });
      changes.tokenDelta += (c.tokens - s.tokens);
    } else {
      changes.unchanged.push(file);
    }
  }

  // .cursorrules changes
  if (!saved.cursorrules && current.cursorrules) {
    changes.added.push({ file: '.cursorrules', tokens: current.cursorrules.tokens, lines: current.cursorrules.lines });
    changes.tokenDelta += current.cursorrules.tokens;
  } else if (saved.cursorrules && !current.cursorrules) {
    changes.removed.push({ file: '.cursorrules', tokens: saved.cursorrules.tokens, lines: saved.cursorrules.lines });
    changes.tokenDelta -= saved.cursorrules.tokens;
  } else if (saved.cursorrules && current.cursorrules && saved.cursorrules.hash !== current.cursorrules.hash) {
    changes.modified.push({ file: '.cursorrules', oldTokens: saved.cursorrules.tokens, newTokens: current.cursorrules.tokens, oldLines: saved.cursorrules.lines, newLines: current.cursorrules.lines });
    changes.tokenDelta += (current.cursorrules.tokens - saved.cursorrules.tokens);
  }

  changes.hasChanges = changes.added.length > 0 || changes.removed.length > 0 || changes.modified.length > 0;

  return changes;
}

module.exports = { saveSnapshot, diffSnapshot, captureState };
