const fs = require('fs');
const path = require('path');

// Regex patterns from Cursor's official validator
const PLUGIN_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const MARKETPLACE_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

// Valid hook event names from Cursor 2.5 docs
const VALID_HOOK_EVENTS = new Set([
  'sessionStart',
  'sessionEnd',
  'preToolUse',
  'postToolUse',
  'postToolUseFailure',
  'subagentStart',
  'subagentStop',
  'beforeShellExecution',
  'afterShellExecution',
  'beforeMCPExecution',
  'afterMCPExecution',
  'beforeReadFile',
  'afterFileEdit',
  'beforeSubmitPrompt',
  'preCompact',
  'stop',
  'afterAgentResponse',
  'afterAgentThought',
  'beforeTabFileRead',
  'afterTabFileEdit',
]);

// Helper: Check if a path is a safe relative path
function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  
  // Allow URLs for logo field
  if (value.startsWith('http://') || value.startsWith('https://')) return true;
  
  // Reject absolute paths
  if (path.isAbsolute(value)) return false;
  
  // Normalize and check for parent directory references
  const normalized = path.posix.normalize(value.replace(/\\/g, '/'));
  return !normalized.startsWith('../') && normalized !== '..';
}

// Helper: Parse frontmatter from markdown content
function parseFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return null;
  
  const closingIndex = normalized.indexOf('\n---\n', 4);
  if (closingIndex === -1) return null;
  
  const frontmatterBlock = normalized.slice(4, closingIndex);
  const fields = {};
  
  for (const line of frontmatterBlock.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    fields[key] = value;
  }
  
  return fields;
}

// Helper: Extract path values from manifest fields
function extractPathValues(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(extractPathValues);
  
  if (value && typeof value === 'object') {
    const candidates = [];
    if (typeof value.path === 'string') candidates.push(value.path);
    if (typeof value.file === 'string') candidates.push(value.file);
    return candidates;
  }
  
  return [];
}

// Helper: Walk directory tree and collect files
async function walkFiles(dirPath) {
  const files = [];
  const ignoreDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.venv', 'venv', '.turbo', 'coverage']);
  const stack = [{ path: dirPath, depth: 0 }];
  
  while (stack.length > 0) {
    const { path: current, depth } = stack.pop();
    if (depth > 5) continue; // Don't recurse too deep
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (ignoreDirs.has(entry.name)) continue;
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push({ path: entryPath, depth: depth + 1 });
        } else if (entry.isFile()) {
          files.push(entryPath);
        }
      }
    } catch (e) {
      // Skip directories we can't read
    }
  }
  
  return files;
}

// Validate manifest (plugin.json)
async function validateManifest(pluginDir) {
  const issues = [];
  const manifestPath = path.join(pluginDir, '.cursor-plugin', 'plugin.json');
  
  if (!fs.existsSync(manifestPath)) {
    issues.push({
      severity: 'error',
      code: 'MANIFEST_MISSING',
      message: 'Missing .cursor-plugin/plugin.json manifest file',
    });
    return issues;
  }
  
  let manifest;
  try {
    const content = fs.readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(content);
  } catch (e) {
    issues.push({
      severity: 'error',
      code: 'MANIFEST_INVALID_JSON',
      message: `Invalid JSON in plugin.json: ${e.message}`,
    });
    return issues;
  }
  
  // Check required name field
  if (!manifest.name) {
    issues.push({
      severity: 'error',
      code: 'MANIFEST_NAME_REQUIRED',
      message: 'plugin.json must have a "name" field',
    });
  } else if (!PLUGIN_NAME_PATTERN.test(manifest.name)) {
    issues.push({
      severity: 'error',
      code: 'MANIFEST_NAME_INVALID',
      message: `Plugin name "${manifest.name}" must be lowercase, use alphanumerics, hyphens, and periods, and start/end with alphanumeric`,
    });
  }
  
  // Check version if present
  if (manifest.version && !SEMVER_PATTERN.test(manifest.version)) {
    issues.push({
      severity: 'error',
      code: 'MANIFEST_VERSION_INVALID',
      message: `Version "${manifest.version}" is not valid semver`,
    });
  }
  
  // Check author if present
  if (manifest.author) {
    if (typeof manifest.author !== 'object' || !manifest.author.name) {
      issues.push({
        severity: 'error',
        code: 'MANIFEST_AUTHOR_INVALID',
        message: 'author field must be an object with a "name" property',
      });
    }
  }
  
  // Check referenced paths exist and are safe
  const pathFields = ['logo', 'rules', 'skills', 'agents', 'commands', 'hooks', 'mcpServers'];
  for (const field of pathFields) {
    if (!manifest[field]) continue;
    
    const paths = extractPathValues(manifest[field]);
    for (const pathValue of paths) {
      // Skip URLs (allowed for logo)
      if (pathValue.startsWith('http://') || pathValue.startsWith('https://')) {
        continue;
      }
      
      if (!isSafeRelativePath(pathValue)) {
        issues.push({
          severity: 'error',
          code: 'MANIFEST_PATH_UNSAFE',
          message: `Field "${field}" has unsafe path "${pathValue}" (must be relative, no "..")`,
        });
        continue;
      }
      
      const resolved = path.resolve(pluginDir, pathValue);
      if (!fs.existsSync(resolved)) {
        issues.push({
          severity: 'error',
          code: 'MANIFEST_PATH_MISSING',
          message: `Field "${field}" references missing path "${pathValue}"`,
        });
      }
    }
  }
  
  return issues;
}

// Validate component frontmatter
async function validateComponentFrontmatter(pluginDir) {
  const results = [];
  
  // Rules: .mdc/.md files in rules/ must have description
  const rulesDir = path.join(pluginDir, 'rules');
  if (fs.existsSync(rulesDir) && fs.statSync(rulesDir).isDirectory()) {
    const files = await walkFiles(rulesDir);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.md' || ext === '.mdc' || ext === '.markdown') {
        const issues = [];
        try {
          const content = fs.readFileSync(file, 'utf8');
          const fm = parseFrontmatter(content);
          
          if (!fm) {
            issues.push({
              severity: 'error',
              code: 'RULE_MISSING_FRONTMATTER',
              message: 'Rule file missing YAML frontmatter',
            });
          } else if (!fm.description) {
            issues.push({
              severity: 'error',
              code: 'RULE_MISSING_DESCRIPTION',
              message: 'Rule frontmatter missing "description" field',
            });
          }
        } catch (e) {
          issues.push({
            severity: 'error',
            code: 'RULE_READ_ERROR',
            message: `Failed to read rule file: ${e.message}`,
          });
        }
        
        if (issues.length > 0) {
          results.push({ file: path.relative(pluginDir, file), issues });
        }
      }
    }
  }
  
  // Skills: SKILL.md files must have name and description
  const skillsDir = path.join(pluginDir, 'skills');
  if (fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()) {
    const files = await walkFiles(skillsDir);
    for (const file of files) {
      if (path.basename(file) === 'SKILL.md') {
        const issues = [];
        try {
          const content = fs.readFileSync(file, 'utf8');
          const fm = parseFrontmatter(content);
          
          if (!fm) {
            issues.push({
              severity: 'error',
              code: 'SKILL_MISSING_FRONTMATTER',
              message: 'Skill file missing YAML frontmatter',
            });
          } else {
            if (!fm.name) {
              issues.push({
                severity: 'error',
                code: 'SKILL_MISSING_NAME',
                message: 'Skill frontmatter missing "name" field',
              });
            }
            if (!fm.description) {
              issues.push({
                severity: 'error',
                code: 'SKILL_MISSING_DESCRIPTION',
                message: 'Skill frontmatter missing "description" field',
              });
            }
          }
        } catch (e) {
          issues.push({
            severity: 'error',
            code: 'SKILL_READ_ERROR',
            message: `Failed to read skill file: ${e.message}`,
          });
        }
        
        if (issues.length > 0) {
          results.push({ file: path.relative(pluginDir, file), issues });
        }
      }
    }
  }
  
  // Agents: .md files must have name and description
  const agentsDir = path.join(pluginDir, 'agents');
  if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
    const files = await walkFiles(agentsDir);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.md' || ext === '.mdc' || ext === '.markdown') {
        const issues = [];
        try {
          const content = fs.readFileSync(file, 'utf8');
          const fm = parseFrontmatter(content);
          
          if (!fm) {
            issues.push({
              severity: 'error',
              code: 'AGENT_MISSING_FRONTMATTER',
              message: 'Agent file missing YAML frontmatter',
            });
          } else {
            if (!fm.name) {
              issues.push({
                severity: 'error',
                code: 'AGENT_MISSING_NAME',
                message: 'Agent frontmatter missing "name" field',
              });
            }
            if (!fm.description) {
              issues.push({
                severity: 'error',
                code: 'AGENT_MISSING_DESCRIPTION',
                message: 'Agent frontmatter missing "description" field',
              });
            }
          }
        } catch (e) {
          issues.push({
            severity: 'error',
            code: 'AGENT_READ_ERROR',
            message: `Failed to read agent file: ${e.message}`,
          });
        }
        
        if (issues.length > 0) {
          results.push({ file: path.relative(pluginDir, file), issues });
        }
      }
    }
  }
  
  // Commands: .md/.txt files must have name and description
  const commandsDir = path.join(pluginDir, 'commands');
  if (fs.existsSync(commandsDir) && fs.statSync(commandsDir).isDirectory()) {
    const files = await walkFiles(commandsDir);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.md' || ext === '.mdc' || ext === '.markdown' || ext === '.txt') {
        const issues = [];
        try {
          const content = fs.readFileSync(file, 'utf8');
          const fm = parseFrontmatter(content);
          
          if (!fm) {
            issues.push({
              severity: 'error',
              code: 'COMMAND_MISSING_FRONTMATTER',
              message: 'Command file missing YAML frontmatter',
            });
          } else {
            if (!fm.name) {
              issues.push({
                severity: 'error',
                code: 'COMMAND_MISSING_NAME',
                message: 'Command frontmatter missing "name" field',
              });
            }
            if (!fm.description) {
              issues.push({
                severity: 'error',
                code: 'COMMAND_MISSING_DESCRIPTION',
                message: 'Command frontmatter missing "description" field',
              });
            }
          }
        } catch (e) {
          issues.push({
            severity: 'error',
            code: 'COMMAND_READ_ERROR',
            message: `Failed to read command file: ${e.message}`,
          });
        }
        
        if (issues.length > 0) {
          results.push({ file: path.relative(pluginDir, file), issues });
        }
      }
    }
  }
  
  return results;
}

// Validate hooks configuration
function validateHooks(pluginDir) {
  const issues = [];
  const hooksPath = path.join(pluginDir, 'hooks', 'hooks.json');
  
  if (!fs.existsSync(hooksPath)) {
    // Hooks are optional, so just return empty
    return issues;
  }
  
  let hooks;
  try {
    const content = fs.readFileSync(hooksPath, 'utf8');
    hooks = JSON.parse(content);
  } catch (e) {
    issues.push({
      severity: 'error',
      code: 'HOOKS_INVALID_JSON',
      message: `Invalid JSON in hooks/hooks.json: ${e.message}`,
    });
    return issues;
  }
  
  // Check that all event names are valid
  if (hooks && typeof hooks === 'object') {
    for (const eventName of Object.keys(hooks)) {
      if (!VALID_HOOK_EVENTS.has(eventName)) {
        issues.push({
          severity: 'error',
          code: 'HOOKS_INVALID_EVENT',
          message: `Invalid hook event name: "${eventName}"`,
          hint: `Valid events: ${Array.from(VALID_HOOK_EVENTS).join(', ')}`,
        });
      }
    }
  }
  
  return issues;
}

// Validate MCP configuration
function validateMCP(pluginDir) {
  const issues = [];
  const mcpPath = path.join(pluginDir, '.mcp.json');
  
  if (!fs.existsSync(mcpPath)) {
    // MCP config is optional
    return issues;
  }
  
  let mcp;
  try {
    const content = fs.readFileSync(mcpPath, 'utf8');
    mcp = JSON.parse(content);
  } catch (e) {
    issues.push({
      severity: 'error',
      code: 'MCP_INVALID_JSON',
      message: `Invalid JSON in .mcp.json: ${e.message}`,
    });
    return issues;
  }
  
  // Check that each server entry has command or url
  if (mcp && typeof mcp === 'object') {
    for (const [serverName, config] of Object.entries(mcp)) {
      if (!config || typeof config !== 'object') continue;
      
      if (!config.command && !config.url) {
        issues.push({
          severity: 'warning',
          code: 'MCP_SERVER_NO_ENDPOINT',
          message: `MCP server "${serverName}" has neither "command" nor "url" field`,
        });
      }
    }
  }
  
  return issues;
}

// Validate marketplace.json
function validateMarketplace(pluginDir) {
  const issues = [];
  const marketplacePath = path.join(pluginDir, '.cursor-plugin', 'marketplace.json');
  
  if (!fs.existsSync(marketplacePath)) {
    // Marketplace file is optional
    return issues;
  }
  
  let marketplace;
  try {
    const content = fs.readFileSync(marketplacePath, 'utf8');
    marketplace = JSON.parse(content);
  } catch (e) {
    issues.push({
      severity: 'error',
      code: 'MARKETPLACE_INVALID_JSON',
      message: `Invalid JSON in marketplace.json: ${e.message}`,
    });
    return issues;
  }
  
  // Check required name field (stricter pattern - no periods)
  if (!marketplace.name) {
    issues.push({
      severity: 'error',
      code: 'MARKETPLACE_NAME_REQUIRED',
      message: 'marketplace.json must have a "name" field',
    });
  } else if (!MARKETPLACE_NAME_PATTERN.test(marketplace.name)) {
    issues.push({
      severity: 'error',
      code: 'MARKETPLACE_NAME_INVALID',
      message: `Marketplace name "${marketplace.name}" must be lowercase kebab-case (no periods)`,
    });
  }
  
  // Check owner.name
  if (!marketplace.owner || !marketplace.owner.name) {
    issues.push({
      severity: 'error',
      code: 'MARKETPLACE_OWNER_REQUIRED',
      message: 'marketplace.json must have "owner.name" field',
    });
  }
  
  // Check plugins array
  if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
    issues.push({
      severity: 'error',
      code: 'MARKETPLACE_PLUGINS_REQUIRED',
      message: 'marketplace.json "plugins" must be a non-empty array',
    });
    return issues;
  }
  
  // Check each plugin entry
  const seenNames = new Set();
  for (const [index, plugin] of marketplace.plugins.entries()) {
    if (!plugin || typeof plugin !== 'object') {
      issues.push({
        severity: 'error',
        code: 'MARKETPLACE_PLUGIN_INVALID',
        message: `Plugin entry ${index} must be an object`,
      });
      continue;
    }
    
    if (!plugin.name) {
      issues.push({
        severity: 'error',
        code: 'MARKETPLACE_PLUGIN_NAME_REQUIRED',
        message: `Plugin entry ${index} missing "name" field`,
      });
    } else {
      if (seenNames.has(plugin.name)) {
        issues.push({
          severity: 'error',
          code: 'MARKETPLACE_PLUGIN_DUPLICATE',
          message: `Duplicate plugin name in marketplace: "${plugin.name}"`,
        });
      }
      seenNames.add(plugin.name);
    }
    
    if (!plugin.source) {
      issues.push({
        severity: 'error',
        code: 'MARKETPLACE_PLUGIN_SOURCE_REQUIRED',
        message: `Plugin "${plugin.name || index}" missing "source" field`,
      });
    } else if (!isSafeRelativePath(plugin.source)) {
      issues.push({
        severity: 'error',
        code: 'MARKETPLACE_PLUGIN_SOURCE_UNSAFE',
        message: `Plugin "${plugin.name || index}" source path is unsafe (must be relative, no "..")`,
      });
    }
  }
  
  return issues;
}

// Main lint function
async function lintPlugin(dir) {
  const results = [];
  
  // Check if this looks like a plugin directory
  const pluginManifestPath = path.join(dir, '.cursor-plugin', 'plugin.json');
  const marketplaceManifestPath = path.join(dir, '.cursor-plugin', 'marketplace.json');
  
  if (!fs.existsSync(pluginManifestPath) && !fs.existsSync(marketplaceManifestPath)) {
    results.push({
      file: dir,
      issues: [{
        severity: 'error',
        code: 'NOT_A_PLUGIN',
        message: 'No .cursor-plugin/plugin.json or .cursor-plugin/marketplace.json found',
        hint: 'This does not appear to be a Cursor plugin directory',
      }],
    });
    return results;
  }
  
  // Validate manifest
  const manifestIssues = await validateManifest(dir);
  if (manifestIssues.length > 0) {
    results.push({
      file: '.cursor-plugin/plugin.json',
      issues: manifestIssues,
    });
  }
  
  // Validate component frontmatter
  const componentResults = await validateComponentFrontmatter(dir);
  results.push(...componentResults);
  
  // Validate hooks
  const hooksIssues = validateHooks(dir);
  if (hooksIssues.length > 0) {
    results.push({
      file: 'hooks/hooks.json',
      issues: hooksIssues,
    });
  }
  
  // Validate MCP config
  const mcpIssues = validateMCP(dir);
  if (mcpIssues.length > 0) {
    results.push({
      file: '.mcp.json',
      issues: mcpIssues,
    });
  }
  
  // Validate marketplace manifest if present
  const marketplaceIssues = validateMarketplace(dir);
  if (marketplaceIssues.length > 0) {
    results.push({
      file: '.cursor-plugin/marketplace.json',
      issues: marketplaceIssues,
    });
  }
  
  return results;
}

module.exports = { lintPlugin };
