#!/usr/bin/env node

/**
 * cursor-doctor LSP server
 * Provides diagnostics for .mdc files in editors (Neovim, Zed, VS Code)
 * Zero dependencies, implements LSP over stdin/stdout
 */

const { lintMdcFile } = require('./index');
const readline = require('readline');

class CursorDoctorLSP {
  constructor() {
    this.documents = new Map(); // uri -> { version, content }
    this.initialized = false;
    
    // Setup stdin/stdout for LSP communication
    this.rl = readline.createInterface({
      input: process.stdin,
      output: null, // We write to stdout directly
    });
    
    this.buffer = '';
    this.contentLength = null;
    
    // Read from stdin
    this.rl.on('line', (line) => {
      if (line.startsWith('Content-Length: ')) {
        this.contentLength = parseInt(line.substring(16), 10);
      } else if (line === '' && this.contentLength !== null) {
        // Empty line after headers, next contentLength bytes are the message
        this.rl.once('line', (jsonRpcMessage) => {
          this.handleMessage(jsonRpcMessage);
          this.contentLength = null;
        });
      }
    });
  }

  log(message) {
    // Log to stderr to avoid interfering with LSP protocol
    process.stderr.write(`[cursor-doctor-lsp] ${message}\n`);
  }

  send(message) {
    const content = JSON.stringify(message);
    const contentLength = Buffer.byteLength(content, 'utf8');
    process.stdout.write(`Content-Length: ${contentLength}\r\n\r\n${content}`);
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      this.log(`Received: ${message.method || 'response'}`);
      
      if (message.method) {
        this.handleRequest(message);
      }
    } catch (error) {
      this.log(`Error parsing message: ${error.message}`);
    }
  }

  async handleRequest(message) {
    const { method, params, id } = message;

    switch (method) {
      case 'initialize':
        this.handleInitialize(id, params);
        break;
      
      case 'initialized':
        this.initialized = true;
        break;
      
      case 'textDocument/didOpen':
        await this.handleDidOpen(params);
        break;
      
      case 'textDocument/didChange':
        await this.handleDidChange(params);
        break;
      
      case 'textDocument/didSave':
        await this.handleDidSave(params);
        break;
      
      case 'textDocument/didClose':
        this.handleDidClose(params);
        break;
      
      case 'textDocument/codeAction':
        this.handleCodeAction(id, params);
        break;
      
      case 'shutdown':
        this.send({ id, result: null });
        break;
      
      case 'exit':
        process.exit(0);
        break;
      
      default:
        if (id) {
          this.send({ id, error: { code: -32601, message: 'Method not found' } });
        }
    }
  }

  handleInitialize(id, params) {
    this.send({
      id,
      result: {
        capabilities: {
          textDocumentSync: {
            openClose: true,
            change: 1, // Full document sync
            save: true,
          },
          codeActionProvider: {
            codeActionKinds: ['quickfix'],
          },
        },
        serverInfo: {
          name: 'cursor-doctor-lsp',
          version: '1.5.0',
        },
      },
    });
  }

  async handleDidOpen(params) {
    const { textDocument } = params;
    const { uri, version, text } = textDocument;
    
    if (!uri.endsWith('.mdc')) return;
    
    this.documents.set(uri, { version, content: text });
    await this.publishDiagnostics(uri, text);
  }

  async handleDidChange(params) {
    const { textDocument, contentChanges } = params;
    const { uri, version } = textDocument;
    
    if (!uri.endsWith('.mdc')) return;
    
    // Full document sync
    const content = contentChanges[0].text;
    this.documents.set(uri, { version, content });
    await this.publishDiagnostics(uri, content);
  }

  async handleDidSave(params) {
    const { textDocument } = params;
    const { uri } = textDocument;
    
    if (!uri.endsWith('.mdc')) return;
    
    const doc = this.documents.get(uri);
    if (doc) {
      await this.publishDiagnostics(uri, doc.content);
    }
  }

  handleDidClose(params) {
    const { textDocument } = params;
    this.documents.delete(textDocument.uri);
  }

  handleCodeAction(id, params) {
    // For now, return empty array
    // Future: implement quick fixes for auto-fixable issues
    this.send({ id, result: [] });
  }

  async publishDiagnostics(uri, content) {
    try {
      // Write content to temp file for linting
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      
      const tmpFile = path.join(os.tmpdir(), `cursor-doctor-${Date.now()}.mdc`);
      fs.writeFileSync(tmpFile, content, 'utf-8');
      
      const result = await lintMdcFile(tmpFile);
      
      // Clean up temp file
      fs.unlinkSync(tmpFile);
      
      const diagnostics = result.issues.map(issue => {
        const severity = issue.severity === 'error' ? 1 : 
                        issue.severity === 'warning' ? 2 : 3;
        
        // Try to find the line if available
        const line = issue.line ? issue.line - 1 : 0;
        
        return {
          range: {
            start: { line, character: 0 },
            end: { line, character: 1000 }, // End of line
          },
          severity,
          source: 'cursor-doctor',
          message: issue.message,
          code: issue.hint || undefined,
        };
      });
      
      this.send({
        method: 'textDocument/publishDiagnostics',
        params: {
          uri,
          diagnostics,
        },
      });
    } catch (error) {
      this.log(`Error linting ${uri}: ${error.message}`);
    }
  }

  start() {
    this.log('cursor-doctor LSP server started');
  }
}

// Start the server
const server = new CursorDoctorLSP();
server.start();
