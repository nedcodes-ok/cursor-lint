const fs = require('fs');
const path = require('path');
const { lintProject } = require('./index');
const { showStats } = require('./stats');
const { lintPlugin } = require('./plugin');
const { analyzeTokenBudget, CONTEXT_WINDOW_TOKENS } = require('./token-budget');
const { lintAgentConfigs } = require('./agents-lint');
const { lintMcpConfigs } = require('./mcp-lint');

async function doctor(dir) {
  const report = {
    checks: [],
    score: 0,
    maxScore: 0,
    grade: 'F',
  };

  // 1. Check if any rules exist at all
  report.maxScore += 20;
  const rulesDir = path.join(dir, '.cursor', 'rules');
  const hasMdc = fs.existsSync(rulesDir) && fs.readdirSync(rulesDir).filter(f => f.endsWith('.mdc')).length > 0;
  const hasCursorrules = fs.existsSync(path.join(dir, '.cursorrules'));
  
  if (hasMdc) {
    report.score += 20;
    report.checks.push({ name: 'Rules exist', status: 'pass', detail: '.cursor/rules/ found with .mdc files' });
  } else if (hasCursorrules) {
    report.score += 12;
    report.checks.push({ name: 'Rules exist', status: 'warn', detail: 'Only .cursorrules found — run cursor-doctor migrate to convert' });
  } else {
    report.checks.push({ name: 'Rules exist', status: 'fail', detail: 'No rules found. Create .cursor/rules/*.mdc files or use npx rulegen-ai to generate them.' });
  }

  // 2. Check for legacy .cursorrules
  report.maxScore += 10;
  if (hasCursorrules && hasMdc) {
    report.score += 5;
    report.checks.push({ name: 'No legacy .cursorrules', status: 'warn', detail: '.cursorrules exists alongside .mdc rules — may cause conflicts' });
  } else if (!hasCursorrules) {
    report.score += 10;
    report.checks.push({ name: 'No legacy .cursorrules', status: 'pass', detail: 'Using modern .mdc format' });
  } else {
    report.score += 4;
    report.checks.push({ name: 'No legacy .cursorrules', status: 'warn', detail: 'Using legacy .cursorrules — run cursor-doctor migrate' });
  }

  // 3. Lint checks
  report.maxScore += 25;
  const lintResults = await lintProject(dir);
  let errors = 0, warnings = 0;
  for (const r of lintResults) {
    for (const i of r.issues) {
      if (i.severity === 'error') errors++;
      else if (i.severity === 'warning') warnings++;
    }
  }
  if (errors === 0 && warnings === 0) {
    report.score += 25;
    report.checks.push({ name: 'Rule syntax', status: 'pass', detail: 'All rules pass lint checks' });
  } else if (errors === 0) {
    report.score += 18;
    report.checks.push({ name: 'Rule syntax', status: 'warn', detail: `${warnings} warning(s). Run cursor-doctor lint for details.` });
  } else {
    report.score += Math.max(0, 8 - errors * 2);
    report.checks.push({ name: 'Rule syntax', status: 'fail', detail: `${errors} error(s), ${warnings} warning(s). Run cursor-doctor lint to see issues.` });
  }

  // 4. Token budget (enhanced with context window %)
  report.maxScore += 15;
  const stats = showStats(dir);
  const tokenAnalysis = analyzeTokenBudget(dir, { pro: false });
  var budgetPct = tokenAnalysis.contextWindowPct;
  if (stats.totalTokens === 0) {
    report.checks.push({ name: 'Token budget', status: 'info', detail: 'No rules to measure' });
  } else if (budgetPct < 3) {
    report.score += 15;
    report.checks.push({ name: 'Token budget', status: 'pass', detail: `~${tokenAnalysis.alwaysLoadedTokens} always-loaded tokens (${budgetPct}% of context window)` });
  } else if (budgetPct < 10) {
    report.score += 10;
    report.checks.push({ name: 'Token budget', status: 'warn', detail: `~${tokenAnalysis.alwaysLoadedTokens} always-loaded tokens (${budgetPct}% of context window) — getting heavy` });
  } else {
    report.score += 3;
    report.checks.push({ name: 'Token budget', status: 'fail', detail: `~${tokenAnalysis.alwaysLoadedTokens} always-loaded tokens (${budgetPct}% of context window) — eating your context` });
  }

  // 5. Coverage gaps
  report.maxScore += 10;
  if (stats.coverageGaps.length === 0) {
    report.score += 10;
    report.checks.push({ name: 'Coverage', status: 'pass', detail: 'Rules cover your project file types' });
  } else if (stats.coverageGaps.length <= 2) {
    report.score += 6;
    const gaps = stats.coverageGaps.map(g => g.ext).join(', ');
    report.checks.push({ name: 'Coverage', status: 'warn', detail: `Missing rules for: ${gaps}` });
  } else {
    report.score += 2;
    const gaps = stats.coverageGaps.map(g => g.ext).join(', ');
    report.checks.push({ name: 'Coverage', status: 'fail', detail: `Missing rules for: ${gaps}` });
  }

  // 6. Context file size check (NEW)
  report.maxScore += 10;
  const contextFiles = [
    'AGENTS.md', 'CLAUDE.md', 'COPILOT.md', 'CURSOR.md',
    'CONTEXT.md', 'RULES.md', 'INSTRUCTIONS.md', 'SYSTEM.md',
    '.cursorrules', 'CONVENTIONS.md',
  ];
  let bigFiles = [];
  let totalContextBytes = 0;
  for (const cf of contextFiles) {
    const cfPath = path.join(dir, cf);
    if (fs.existsSync(cfPath)) {
      const size = fs.statSync(cfPath).size;
      totalContextBytes += size;
      if (size > 8000) bigFiles.push({ name: cf, size });
    }
  }
  // Also check .cursor/rules/ total size
  if (fs.existsSync(rulesDir)) {
    try {
      const ruleFiles = fs.readdirSync(rulesDir).filter(f => f.endsWith('.mdc') || f.endsWith('.md'));
      for (const rf of ruleFiles) {
        const rfPath = path.join(rulesDir, rf);
        const size = fs.statSync(rfPath).size;
        if (size > 5000) bigFiles.push({ name: `.cursor/rules/${rf}`, size });
      }
    } catch {}
  }

  if (bigFiles.length === 0) {
    report.score += 10;
    report.checks.push({ name: 'File sizes', status: 'pass', detail: 'All context files are reasonably sized' });
  } else if (bigFiles.length <= 2) {
    report.score += 5;
    const detail = bigFiles.map(f => `${f.name} (${(f.size/1024).toFixed(1)}KB)`).join(', ');
    report.checks.push({ name: 'File sizes', status: 'warn', detail: `Large files: ${detail}. Big files can overwhelm the AI.` });
  } else {
    report.score += 2;
    const detail = bigFiles.map(f => `${f.name} (${(f.size/1024).toFixed(1)}KB)`).join(', ');
    report.checks.push({ name: 'File sizes', status: 'fail', detail: `${bigFiles.length} oversized files: ${detail}` });
  }

  // 7. alwaysApply overuse check (NEW)
  report.maxScore += 10;
  let alwaysApplyCount = 0;
  if (fs.existsSync(rulesDir)) {
    try {
      const ruleFiles = fs.readdirSync(rulesDir).filter(f => f.endsWith('.mdc'));
      for (const rf of ruleFiles) {
        const content = fs.readFileSync(path.join(rulesDir, rf), 'utf8');
        if (/alwaysApply:\s*true/i.test(content)) alwaysApplyCount++;
      }
    } catch {}
  }
  if (alwaysApplyCount === 0) {
    report.score += 8;
    report.checks.push({ name: 'alwaysApply usage', status: 'info', detail: 'No alwaysApply rules (consider adding global coding standards)' });
  } else if (alwaysApplyCount <= 5) {
    report.score += 10;
    report.checks.push({ name: 'alwaysApply usage', status: 'pass', detail: `${alwaysApplyCount} always-active rule(s) — good balance` });
  } else if (alwaysApplyCount <= 10) {
    report.score += 6;
    report.checks.push({ name: 'alwaysApply usage', status: 'warn', detail: `${alwaysApplyCount} always-active rules — consider moving some to glob-scoped` });
  } else {
    report.score += 2;
    report.checks.push({ name: 'alwaysApply usage', status: 'fail', detail: `${alwaysApplyCount} always-active rules — too many. Move specific rules to glob-scoped.` });
  }

  // 8. Skills check
  report.maxScore += 5;
  const skillDirs = [
    path.join(dir, '.cursor', 'skills'),
    path.join(dir, '.claude', 'skills'),
    path.join(dir, 'skills'),
  ];
  const hasSkills = skillDirs.some(sd => {
    if (!fs.existsSync(sd)) return false;
    try {
      return fs.readdirSync(sd).some(e => {
        const sub = path.join(sd, e);
        return fs.statSync(sub).isDirectory() && fs.existsSync(path.join(sub, 'SKILL.md'));
      });
    } catch { return false; }
  });
  if (hasSkills) {
    report.score += 5;
    report.checks.push({ name: 'Agent skills', status: 'pass', detail: 'Skills directory found' });
  } else {
    report.score += 3;
    report.checks.push({ name: 'Agent skills', status: 'info', detail: 'No agent skills found (optional but helpful for complex workflows)' });
  }

  // 9. Plugin validation (if applicable)
  const pluginManifestPath = path.join(dir, '.cursor-plugin', 'plugin.json');
  if (fs.existsSync(pluginManifestPath)) {
    report.maxScore += 5;
    const pluginResults = await lintPlugin(dir);
    let pluginErrors = 0;
    for (const r of pluginResults) {
      for (const i of r.issues) {
        if (i.severity === 'error') pluginErrors++;
      }
    }
    if (pluginErrors === 0) {
      report.score += 5;
      report.checks.push({ name: 'Plugin structure', status: 'pass', detail: 'Plugin is valid' });
    } else {
      report.checks.push({ name: 'Plugin structure', status: 'fail', detail: `${pluginErrors} plugin error(s)` });
    }
  }

  // 10. Agent config quality (CLAUDE.md, AGENTS.md)
  var agentResults;
  try { agentResults = lintAgentConfigs(dir); } catch (e) { agentResults = []; }
  var agentFilesExist = agentResults.some(function(r) { return r.exists; });
  if (agentFilesExist) {
    report.maxScore += 10;
    var agentErrors = 0, agentWarnings = 0;
    for (var ai = 0; ai < agentResults.length; ai++) {
      if (!agentResults[ai].exists) continue;
      for (var aj = 0; aj < agentResults[ai].issues.length; aj++) {
        if (agentResults[ai].issues[aj].severity === 'error') agentErrors++;
        else if (agentResults[ai].issues[aj].severity === 'warning') agentWarnings++;
      }
    }
    if (agentErrors === 0 && agentWarnings === 0) {
      report.score += 10;
      report.checks.push({ name: 'Agent configs', status: 'pass', detail: 'CLAUDE.md/AGENTS.md look good' });
    } else if (agentErrors === 0) {
      report.score += 7;
      report.checks.push({ name: 'Agent configs', status: 'warn', detail: agentWarnings + ' warning(s) in agent files. Run cursor-doctor agents for details.' });
    } else {
      report.score += 3;
      report.checks.push({ name: 'Agent configs', status: 'fail', detail: agentErrors + ' error(s) in agent files. Run cursor-doctor agents to fix.' });
    }
  }

  // 11. MCP config validation
  var mcpReport;
  try { mcpReport = lintMcpConfigs(dir); } catch (e) { mcpReport = { totalFiles: 0, files: [] }; }
  if (mcpReport.totalFiles > 0) {
    report.maxScore += 10;
    var mcpErrors = 0, mcpWarnings = 0;
    for (var mi = 0; mi < mcpReport.files.length; mi++) {
      for (var mj = 0; mj < mcpReport.files[mi].issues.length; mj++) {
        if (mcpReport.files[mi].issues[mj].severity === 'error') mcpErrors++;
        else if (mcpReport.files[mi].issues[mj].severity === 'warning') mcpWarnings++;
      }
    }
    if (mcpErrors === 0 && mcpWarnings === 0) {
      report.score += 10;
      var serverCount = 0;
      for (var mi = 0; mi < mcpReport.files.length; mi++) {
        if (mcpReport.files[mi].serverCount) serverCount += mcpReport.files[mi].serverCount;
      }
      report.checks.push({ name: 'MCP config', status: 'pass', detail: serverCount + ' MCP server(s) configured correctly' });
    } else if (mcpErrors === 0) {
      report.score += 6;
      report.checks.push({ name: 'MCP config', status: 'warn', detail: mcpWarnings + ' warning(s). Run cursor-doctor mcp for details.' });
    } else {
      report.score += 2;
      report.checks.push({ name: 'MCP config', status: 'fail', detail: mcpErrors + ' error(s) in MCP config. Run cursor-doctor mcp to fix.' });
    }
  }

  // Calculate grade
  const pct = report.maxScore > 0 ? (report.score / report.maxScore) * 100 : 0;
  if (pct >= 85) report.grade = 'A';
  else if (pct >= 70) report.grade = 'B';
  else if (pct >= 50) report.grade = 'C';
  else if (pct >= 30) report.grade = 'D';
  else report.grade = 'F';
  report.percentage = Math.round(pct);

  return report;
}

module.exports = { doctor };
