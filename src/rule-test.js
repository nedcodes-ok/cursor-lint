const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── Provider Abstraction ──────────────────────────────────────────────────

function getProvider() {
  if (process.env.GEMINI_API_KEY) {
    return { name: 'gemini', key: process.env.GEMINI_API_KEY };
  }
  if (process.env.OPENAI_API_KEY) {
    return { name: 'openai', key: process.env.OPENAI_API_KEY };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { name: 'anthropic', key: process.env.ANTHROPIC_API_KEY };
  }
  return null;
}

function callGemini(key, systemPrompt, userPrompt) {
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify({
      contents: [{ parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    });
    
    var options = {
      hostname: 'generativelanguage.googleapis.com',
      path: '/v1beta/models/gemini-2.5-flash:generateContent?key=' + key,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          var json = JSON.parse(data);
          if (json.candidates && json.candidates[0] && json.candidates[0].content) {
            resolve(json.candidates[0].content.parts[0].text);
          } else if (json.error) {
            reject(new Error('Gemini: ' + json.error.message));
          } else {
            reject(new Error('Gemini: unexpected response'));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function callOpenAI(key, systemPrompt, userPrompt) {
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 4096,
    });
    
    var options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
        'Content-Length': Buffer.byteLength(body),
      },
    };
    
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          var json = JSON.parse(data);
          if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message.content);
          } else if (json.error) {
            reject(new Error('OpenAI: ' + json.error.message));
          } else {
            reject(new Error('OpenAI: unexpected response'));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function callAnthropic(key, systemPrompt, userPrompt) {
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.1,
    });
    
    var options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          var json = JSON.parse(data);
          if (json.content && json.content[0]) {
            resolve(json.content[0].text);
          } else if (json.error) {
            reject(new Error('Anthropic: ' + json.error.message));
          } else {
            reject(new Error('Anthropic: unexpected response'));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function callLLM(provider, systemPrompt, userPrompt) {
  if (provider.name === 'gemini') return callGemini(provider.key, systemPrompt, userPrompt);
  if (provider.name === 'openai') return callOpenAI(provider.key, systemPrompt, userPrompt);
  if (provider.name === 'anthropic') return callAnthropic(provider.key, systemPrompt, userPrompt);
  return Promise.reject(new Error('Unknown provider: ' + provider.name));
}

// ─── Rule Testing ──────────────────────────────────────────────────────────

function parseFrontmatter(content) {
  var match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { found: false, data: null };
  var data = {};
  var lines = match[1].split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    var key = line.slice(0, colonIdx).trim();
    var rawVal = line.slice(colonIdx + 1).trim();
    if (rawVal === 'true') data[key] = true;
    else if (rawVal === 'false') data[key] = false;
    else if (rawVal.startsWith('"') && rawVal.endsWith('"')) data[key] = rawVal.slice(1, -1);
    else data[key] = rawVal;
  }
  return { found: true, data: data };
}

function getBody(content) {
  var match = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!match) return content;
  return content.slice(match[0].length);
}

// Test a single rule against a code snippet
async function testRule(ruleContent, codeSnippet, options) {
  options = options || {};
  var provider = getProvider();
  if (!provider) {
    return { error: 'No API key found. Set GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.' };
  }
  
  var ruleBody = getBody(ruleContent);
  var fm = parseFrontmatter(ruleContent);
  var description = fm.data && fm.data.description ? fm.data.description : 'cursor rule';
  
  // Step 1: Apply the rule to the code
  var systemPrompt = 'You are a code assistant. Follow these rules strictly:\n\n' + ruleBody;
  var userPrompt = 'Apply the coding rules to this code. Return ONLY the modified code, no explanations:\n\n```\n' + codeSnippet + '\n```';
  
  var withRule;
  try {
    withRule = await callLLM(provider, systemPrompt, userPrompt);
  } catch (e) {
    return { error: 'LLM call failed: ' + e.message };
  }
  
  // Clean up response (remove markdown code fences if present)
  withRule = withRule.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();
  
  // Step 2: Generate without the rule (baseline)
  var withoutRule;
  if (options.abTest !== false) {
    var baselinePrompt = 'You are a code assistant.';
    try {
      withoutRule = await callLLM(provider, baselinePrompt, userPrompt);
    } catch (e) {
      withoutRule = null; // Non-fatal, just skip A/B
    }
    if (withoutRule) {
      withoutRule = withoutRule.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();
    }
  }
  
  // Step 3: Judge adherence
  var judgePrompt = 'You are a code quality judge. Given a coding rule and generated code, determine if the code follows the rule.\n\n' +
    'Rule:\n' + ruleBody + '\n\n' +
    'Original code:\n```\n' + codeSnippet + '\n```\n\n' +
    'Generated code:\n```\n' + withRule + '\n```\n\n' +
    'Respond in this exact JSON format:\n' +
    '{"adherence": true/false, "score": 0-100, "violations": ["list of specific violations if any"], "improvements": ["list of improvements the rule caused"]}';
  
  var judgement;
  try {
    var judgeResult = await callLLM(provider, 'You are a precise code quality judge. Respond only with valid JSON.', judgePrompt);
    // Extract JSON from response
    var jsonMatch = judgeResult.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      judgement = JSON.parse(jsonMatch[0]);
    } else {
      judgement = { adherence: null, score: null, violations: [], improvements: [], error: 'Could not parse judgement' };
    }
  } catch (e) {
    judgement = { adherence: null, score: null, violations: [], improvements: [], error: e.message };
  }
  
  // Build diff between original and with-rule
  var diff = simpleDiff(codeSnippet.trim(), withRule);
  var abDiff = withoutRule ? simpleDiff(withoutRule, withRule) : null;
  
  return {
    rule: description,
    provider: provider.name,
    adherence: judgement.adherence,
    score: judgement.score,
    violations: judgement.violations || [],
    improvements: judgement.improvements || [],
    codeChanged: codeSnippet.trim() !== withRule,
    withRule: withRule,
    withoutRule: withoutRule || null,
    diff: diff,
    abDiff: abDiff,
  };
}

// Test all rules in a project against a code file
async function testAllRules(dir, codeFilePath, options) {
  options = options || {};
  var rulesDir = path.join(dir, '.cursor', 'rules');
  if (!fs.existsSync(rulesDir)) {
    return { error: 'No .cursor/rules/ directory found' };
  }
  
  var codeSnippet;
  if (fs.existsSync(codeFilePath)) {
    codeSnippet = fs.readFileSync(codeFilePath, 'utf-8');
  } else {
    codeSnippet = codeFilePath; // Treat as inline code
  }
  
  // Truncate if too long (save API costs)
  if (codeSnippet.length > 4000) {
    codeSnippet = codeSnippet.slice(0, 4000) + '\n// ... (truncated)';
  }
  
  var mdcFiles = fs.readdirSync(rulesDir).filter(function(f) { return f.endsWith('.mdc'); });
  var results = [];
  
  for (var i = 0; i < mdcFiles.length; i++) {
    var file = mdcFiles[i];
    var ruleContent = fs.readFileSync(path.join(rulesDir, file), 'utf-8');
    
    // Skip A/B for batch testing (too expensive)
    var result = await testRule(ruleContent, codeSnippet, { abTest: false });
    result.file = file;
    results.push(result);
    
    // Brief pause between API calls
    await new Promise(function(resolve) { setTimeout(resolve, 500); });
  }
  
  // Summary
  var passed = results.filter(function(r) { return r.adherence === true; }).length;
  var failed = results.filter(function(r) { return r.adherence === false; }).length;
  var errors = results.filter(function(r) { return r.error; }).length;
  
  return {
    results: results,
    summary: {
      total: results.length,
      passed: passed,
      failed: failed,
      errors: errors,
      adherenceRate: results.length > 0 ? Math.round((passed / (passed + failed || 1)) * 100) : 0,
    },
    codeFile: codeFilePath,
  };
}

// Simple line-based diff
function simpleDiff(textA, textB) {
  var linesA = textA.split('\n');
  var linesB = textB.split('\n');
  var changes = [];
  var maxLen = Math.max(linesA.length, linesB.length);
  
  for (var i = 0; i < maxLen; i++) {
    var lineA = i < linesA.length ? linesA[i] : undefined;
    var lineB = i < linesB.length ? linesB[i] : undefined;
    
    if (lineA === lineB) continue;
    
    if (lineA === undefined) {
      changes.push({ line: i + 1, type: 'added', text: lineB });
    } else if (lineB === undefined) {
      changes.push({ line: i + 1, type: 'removed', text: lineA });
    } else {
      changes.push({ line: i + 1, type: 'changed', from: lineA, to: lineB });
    }
  }
  
  return {
    changed: changes.length > 0,
    changeCount: changes.length,
    changes: changes,
  };
}

module.exports = { testRule, testAllRules, getProvider, simpleDiff };
