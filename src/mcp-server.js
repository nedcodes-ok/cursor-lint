#!/usr/bin/env node
// MCP server for cursor-doctor
// Protocol: JSON-RPC 2.0 over stdin/stdout
// Spec: https://spec.modelcontextprotocol.io

const readline = require('readline');
const { lintProject, lintMdcFile } = require('./index');
const { doctor } = require('./doctor');
const { autoFix } = require('./autofix');
const { isLicensed } = require('./license');

// JSON-RPC 2.0 message handler
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

// Server metadata
const SERVER_INFO = {
  name: 'cursor-doctor',
  version: '1.8.0',
};

// Available tools
const TOOLS = [
  {
    name: 'lint_rules',
    description: 'Lint Cursor AI rules (.mdc files) in a project directory',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Project directory path containing .cursor/rules/',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'lint_file',
    description: 'Lint a single .mdc rule file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to a .mdc rule file',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'doctor',
    description: 'Run a health check on Cursor AI setup and get a grade (F to A+)',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Project directory path',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'fix_rules',
    description: 'Auto-fix common issues in Cursor AI rules',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Project directory path containing .cursor/rules/',
        },
        dryRun: {
          type: 'boolean',
          description: 'If true, show what would be fixed without making changes',
          default: false,
        },
      },
      required: ['path'],
    },
  },
];

// Tool execution handlers
async function executeTool(name, args) {
  try {
    switch (name) {
      case 'lint_rules':
        return await lintProject(args.path);
      
      case 'lint_file':
        return await lintMdcFile(args.path);
      
      case 'doctor': {
        const result = await doctor(args.path);
        return {
          grade: result.grade,
          score: result.score,
          maxScore: result.maxScore,
          checks: result.checks,
          suggestions: result.suggestions || [],
        };
      }
      
      case 'fix_rules': {
        if (!isLicensed()) {
          throw new Error('Pro feature — activate with: npx cursor-doctor activate <key>. Get a key at https://nedcodes.gumroad.com/l/cursor-doctor-pro');
        }
        const result = await autoFix(args.path, { dryRun: args.dryRun || false });
        return {
          fixed: result.fixed || [],
          errors: result.errors || [],
        };
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    throw new Error(`Tool execution failed: ${error.message}`);
  }
}

// JSON-RPC 2.0 response helper
function sendResponse(id, result) {
  const response = {
    jsonrpc: '2.0',
    id,
    result,
  };
  console.log(JSON.stringify(response));
}

// JSON-RPC 2.0 error response helper
function sendError(id, code, message, data) {
  const response = {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data && { data }),
    },
  };
  console.log(JSON.stringify(response));
}

// Handle JSON-RPC 2.0 requests
async function handleRequest(request) {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize':
        sendResponse(id, {
          protocolVersion: '2024-11-05',
          serverInfo: SERVER_INFO,
          capabilities: {
            tools: {},
          },
        });
        break;

      case 'tools/list':
        sendResponse(id, {
          tools: TOOLS,
        });
        break;

      case 'tools/call': {
        if (!params || !params.name) {
          sendError(id, -32602, 'Invalid params: missing tool name');
          return;
        }
        
        const result = await executeTool(params.name, params.arguments || {});
        sendResponse(id, {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        });
        break;
      }

      default:
        sendError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    sendError(id, -32603, error.message, { stack: error.stack });
  }
}

// Main loop: read JSON-RPC messages from stdin
rl.on('line', async (line) => {
  if (!line.trim()) return;

  let request;
  try {
    request = JSON.parse(line);
  } catch (error) {
    sendError(null, -32700, 'Parse error: invalid JSON');
    return;
  }

  // Validate JSON-RPC 2.0 structure
  if (request.jsonrpc !== '2.0') {
    sendError(request.id || null, -32600, 'Invalid Request: missing jsonrpc: "2.0"');
    return;
  }

  if (!request.method) {
    sendError(request.id || null, -32600, 'Invalid Request: missing method');
    return;
  }

  await handleRequest(request);
});

// Error handling
rl.on('error', (error) => {
  sendError(null, -32603, `Internal error: ${error.message}`);
});

process.on('uncaughtException', (error) => {
  sendError(null, -32603, `Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  sendError(null, -32603, `Unhandled rejection: ${error.message}`);
  process.exit(1);
});
