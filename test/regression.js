#!/usr/bin/env node

/**
 * Real-World Regression Suite
 * 
 * Runs scan, lint, and fix --preview against 10 realistic project setups.
 * Captures output snapshots. Detects crashes, false positives, and regressions.
 * 
 * Run: node test/regression.js
 * Update snapshots: node test/regression.js --update
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPOS_DIR = path.join(__dirname, 'regression-repos');
const SNAPSHOTS_DIR = path.join(__dirname, 'regression-snapshots');
const CLI = path.join(__dirname, '..', 'src', 'cli.js');
const UPDATE_MODE = process.argv.includes('--update');

// Track results
let passed = 0;
let failed = 0;
let crashed = 0;
const failures = [];

function runCommand(cmd, cwd) {
  try {
    const output = execSync(cmd, {
      cwd,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CURSOR_DOCTOR_CTA_VARIANT: '0' }
    });
    return { exitCode: 0, output: normalizeOutput(output) };
  } catch (e) {
    if (e.killed) {
      return { exitCode: -1, output: 'TIMEOUT (30s)' };
    }
    return { exitCode: e.status || 1, output: normalizeOutput(e.stdout || '') + normalizeOutput(e.stderr || '') };
  }
}

function normalizeOutput(text) {
  return text
    // Strip ANSI codes
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    // Normalize timing values
    .replace(/\d+ms/g, 'XXms')
    .replace(/\d+\.\d+s/g, 'X.Xs')
    // Normalize absolute paths
    .replace(/\/[^\s]*regression-repos\//g, '<REPO>/')
    // Normalize version
    .replace(/v\d+\.\d+\.\d+/g, 'vX.X.X')
    // Normalize date stamps
    .replace(/\d{4}-\d{2}-\d{2}/g, 'YYYY-MM-DD')
    // Trim trailing whitespace per line
    .split('\n').map(l => l.trimEnd()).join('\n')
    .trim();
}

function getRepos() {
  return fs.readdirSync(REPOS_DIR)
    .filter(d => {
      const full = path.join(REPOS_DIR, d);
      return fs.statSync(full).isDirectory() && d.match(/^\d{2}-/);
    })
    .sort();
}

function testRepo(repoName) {
  const repoPath = path.join(REPOS_DIR, repoName);
  const commands = [
    { name: 'scan', cmd: `node ${CLI} scan` },
    { name: 'lint', cmd: `node ${CLI} lint` },
    { name: 'fix-preview', cmd: `node ${CLI} fix --preview` }
  ];

  console.log(`\n  ${repoName}:`);

  for (const { name, cmd } of commands) {
    const testName = `${repoName}/${name}`;
    const snapshotFile = path.join(SNAPSHOTS_DIR, `${repoName}.${name}.txt`);
    
    const result = runCommand(cmd, repoPath);

    if (result.exitCode === -1) {
      crashed++;
      failures.push(`  CRASH: ${testName} — timed out after 30s`);
      console.log(`    ✗ ${name} — TIMEOUT`);
      continue;
    }

    // Check for crashes (unexpected errors in output)
    if (result.output.match(/TypeError|ReferenceError|Cannot read prop|FATAL|Segmentation/i)) {
      crashed++;
      failures.push(`  CRASH: ${testName} — runtime error in output`);
      console.log(`    ✗ ${name} — CRASH detected`);
      console.log(`      ${result.output.split('\n').slice(0, 3).join('\n      ')}`);
      continue;
    }

    if (UPDATE_MODE) {
      fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
      fs.writeFileSync(snapshotFile, `exit:${result.exitCode}\n---\n${result.output}\n`);
      console.log(`    ↻ ${name} — snapshot updated`);
      passed++;
      continue;
    }

    // Compare to snapshot
    if (!fs.existsSync(snapshotFile)) {
      failures.push(`  MISSING: ${testName} — no snapshot (run with --update)`);
      console.log(`    ? ${name} — no snapshot`);
      continue;
    }

    const snapshot = fs.readFileSync(snapshotFile, 'utf8');
    const [snapshotExit, ...snapshotBody] = snapshot.split('\n---\n');
    const expectedExit = parseInt(snapshotExit.replace('exit:', ''));
    const expectedOutput = snapshotBody.join('\n---\n').trim();

    let ok = true;

    // Check exit code
    if (result.exitCode !== expectedExit) {
      ok = false;
      failures.push(`  EXIT CODE: ${testName} — expected ${expectedExit}, got ${result.exitCode}`);
    }

    // Check output diff (line-by-line)
    const actualLines = result.output.split('\n');
    const expectedLines = expectedOutput.split('\n');
    
    const diffs = [];
    const maxLines = Math.max(actualLines.length, expectedLines.length);
    for (let i = 0; i < maxLines; i++) {
      const a = actualLines[i] || '';
      const e = expectedLines[i] || '';
      if (a !== e) {
        diffs.push({ line: i + 1, expected: e, actual: a });
      }
    }

    if (diffs.length > 0) {
      ok = false;
      const preview = diffs.slice(0, 3).map(d => 
        `      L${d.line}: expected "${d.expected.substring(0, 80)}"\n             got "${d.actual.substring(0, 80)}"`
      ).join('\n');
      failures.push(`  DIFF: ${testName} — ${diffs.length} lines differ\n${preview}`);
    }

    if (ok) {
      passed++;
      console.log(`    ✓ ${name}`);
    } else {
      failed++;
      console.log(`    ✗ ${name} — ${diffs.length} line(s) differ`);
    }
  }
}

// Main
console.log(`\nReal-World Regression Suite`);
console.log(`Mode: ${UPDATE_MODE ? 'UPDATE SNAPSHOTS' : 'VERIFY'}`);
console.log(`Repos: ${REPOS_DIR}`);

const repos = getRepos();
console.log(`Found ${repos.length} test repos`);

for (const repo of repos) {
  testRepo(repo);
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${crashed} crashed`);

if (failures.length > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) {
    console.log(f);
  }
}

if (crashed > 0) {
  console.log(`\n⚠️  ${crashed} CRASH(ES) DETECTED — fix before releasing`);
  process.exit(2);
}

if (failed > 0 && !UPDATE_MODE) {
  console.log(`\n${failed} regression(s). Run with --update if output changes are intentional.`);
  process.exit(1);
}

if (UPDATE_MODE) {
  console.log(`\n✓ All ${passed} snapshots updated.`);
}

process.exit(0);
