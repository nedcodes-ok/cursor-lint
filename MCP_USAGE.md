# MCP Server Usage

cursor-doctor now includes an MCP (Model Context Protocol) server that lets AI assistants lint and fix Cursor rules through MCP tool calls.

## Quick Start

### 1. Start the MCP Server

```bash
npx cursor-doctor-mcp
```

The server communicates via JSON-RPC 2.0 over stdin/stdout.

### 2. Configure in Cursor/Claude Code

Add to `.cursor/mcp.json` or `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "cursor-doctor": {
      "command": "npx",
      "args": ["-y", "cursor-doctor-mcp"]
    }
  }
}
```

### 3. Available Tools

#### `lint_rules`
Lint all Cursor AI rules in a project directory.

**Input:**
```json
{
  "path": "/path/to/project"
}
```

**Output:**
```json
[
  {
    "file": ".cursor/rules/typescript.mdc",
    "issues": [
      {
        "severity": "warning",
        "message": "Rule body is very long (>2000 chars)",
        "hint": "Shorter rules outperform long ones. Consider splitting.",
        "line": null
      }
    ]
  }
]
```

#### `lint_file`
Lint a single .mdc rule file.

**Input:**
```json
{
  "path": "/path/to/rule.mdc"
}
```

**Output:** Same as `lint_rules` but for a single file.

#### `doctor`
Run a health check on Cursor AI setup.

**Input:**
```json
{
  "path": "/path/to/project"
}
```

**Output:**
```json
{
  "grade": "B+",
  "score": 87,
  "maxScore": 105,
  "checks": [
    {
      "name": "Rules exist",
      "status": "pass",
      "detail": ".cursor/rules/ found with .mdc files"
    }
  ],
  "suggestions": []
}
```

#### `fix_rules`
Auto-fix common issues in Cursor AI rules.

**Input:**
```json
{
  "path": "/path/to/project",
  "dryRun": true
}
```

**Output:**
```json
{
  "fixed": [
    {
      "file": ".cursor/rules/react.mdc",
      "action": "Added missing frontmatter"
    }
  ],
  "errors": []
}
```

## Manual Testing

Test the server directly:

```bash
# List available tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npx cursor-doctor-mcp

# Initialize
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | npx cursor-doctor-mcp

# Call a tool
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"doctor","arguments":{"path":"."}}}' | npx cursor-doctor-mcp
```

## Protocol

The server implements MCP protocol version `2024-11-05` with JSON-RPC 2.0 over stdin/stdout.

Supported methods:
- `initialize` — Returns server info and capabilities
- `tools/list` — Returns available tools
- `tools/call` — Executes a tool and returns results

## Error Codes

- `-32700`: Parse error (invalid JSON)
- `-32600`: Invalid request (missing jsonrpc/method)
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error

## Requirements

- Node.js 16+
- Zero external dependencies (uses only Node.js built-ins + cursor-doctor modules)
