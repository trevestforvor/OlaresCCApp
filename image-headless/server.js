'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');

const PORT = process.env.PORT || 3000;
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'));

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(HTML);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let ptyProcess = null;

  // Wait for the browser's first message: { type: 'init', cols, rows }
  // This guarantees PTY spawns at the correct terminal size, not a hardcoded default.
  ws.once('message', (data) => {
    let cols = 220, rows = 50;
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'init') {
        cols = msg.cols || cols;
        rows = msg.rows || rows;
      }
    } catch {}

    try {
      ptyProcess = pty.spawn('claude', [], {
        name: 'xterm-256color',   // TERM value — Claude checks this for TUI mode
        cols,
        rows,
        cwd: process.env.HOME || '/home/claude',
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',           // 24-bit colour for Claude's output
          LANG: 'en_US.UTF-8',              // prevents Unicode rendering issues
          HOME: process.env.HOME || '/home/claude',
          SHELL: '/bin/bash',
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
          // ANTHROPIC_API_KEY passed through only if set — if absent, Claude prompts
          ...(process.env.ANTHROPIC_API_KEY
            ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY }
            : {}),
        },
        // handleFlowControl enables XON/XOFF for streaming output stability.
        // Trade-off: Ctrl+S and Ctrl+Q are consumed by the PTY layer.
        // Claude Code does not use these keys, so this is acceptable.
        handleFlowControl: true,
      });
    } catch (err) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'output',
          data: `\r\n\x1b[31mFailed to start Claude: ${err.message}\x1b[0m\r\n`,
        }));
        ws.close();
      }
      return;
    }

    // PTY output → WebSocket
    ptyProcess.onData((data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'output', data }));
      }
    });

    // PTY exit → notify client then close WebSocket
    ptyProcess.onExit(() => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'exit' }));
        ws.close();
      }
    });

    // WebSocket messages after init: input or resize
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'input') {
          try { ptyProcess.write(msg.data); } catch {}
        } else if (msg.type === 'resize') {
          // Sends TIOCSWINSZ ioctl to sync PTY dimensions with browser terminal
          try { ptyProcess.resize(msg.cols, msg.rows); } catch {}
        }
      } catch {}
    });
  });

  // Kill PTY when browser disconnects
  ws.on('close', () => {
    if (ptyProcess) {
      try { ptyProcess.kill(); } catch {}
    }
  });
});

server.listen(PORT, () => console.log(`Claude Code terminal on :${PORT}`));
