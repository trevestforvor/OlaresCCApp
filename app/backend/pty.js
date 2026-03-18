// app/backend/pty.js
const pty = require('node-pty')
const path = require('path')
const { execSync } = require('child_process')
const { loadSettings } = require('./settings')
const { registerPty, getPty } = require('./sessions')

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspace'

function buildEnv(settings) {
  const env = { ...process.env }
  const keys = ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_MODEL']
  for (const k of keys) {
    if (settings[k]) env[k] = settings[k]
  }
  // DEFAULT_MODEL: prefer settings.json value, fall back to container env var
  const defaultModel = settings.DEFAULT_MODEL || process.env.DEFAULT_MODEL || ''
  if (defaultModel) {
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = defaultModel
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = defaultModel
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = defaultModel
  }
  env.HOME = process.env.HOME || '/home/claude'
  env.TERM = 'xterm-256color'
  return env
}

function findNewestSessionId() {
  // After spawning a new session, poll claude --list to find the newest session ID.
  // Retry up to 3 times with 1s delay to allow Claude Code to write the session file.
  for (let i = 0; i < 3; i++) {
    try {
      const raw = execSync('claude --list 2>/dev/null', { timeout: 5000 }).toString()
      // Try JSON first
      try {
        const parsed = JSON.parse(raw)
        const arr = Array.isArray(parsed) ? parsed : parsed.sessions || []
        if (arr.length) return arr[0].id || arr[0].sessionId || null
      } catch {}
      // Fallback: first non-empty word of first line is the session ID
      const firstLine = raw.trim().split('\n')[0]
      if (firstLine) {
        const id = firstLine.trim().split(/\s+/)[0]
        if (id && id.length > 4) return id
      }
    } catch {}
    // Synchronous sleep (only in this startup helper, not in request path)
    const end = Date.now() + 1000
    while (Date.now() < end) {}
  }
  return null
}

function spawnClaude({ cwd, sessionId, model }) {
  const settings = loadSettings()
  const env = buildEnv(settings)

  const args = []
  if (sessionId && sessionId !== 'new') args.push('--resume', sessionId)
  if (model) args.push('--model', model)

  return pty.spawn('claude', args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 40,
    cwd: cwd || WORKSPACE_ROOT,
    env,
  })
}

function handleTerminalWs(ws, req) {
  const url = new URL(req.url, 'http://localhost')
  const segments = url.pathname.split('/')
  const sessionId = segments[segments.length - 1]
  const cwd = url.searchParams.get('cwd')
  const model = url.searchParams.get('model')

  // Validate cwd confinement for new sessions
  if (sessionId === 'new') {
    const resolved = path.resolve(cwd || WORKSPACE_ROOT)
    if (!resolved.startsWith(WORKSPACE_ROOT)) {
      ws.close(4003, 'cwd outside workspace')
      return
    }
    // Check API key is configured
    const settings = loadSettings()
    const hasKey = settings.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
    if (!hasKey) {
      if (ws.readyState === ws.OPEN) {
        ws.send('\r\n\x1b[31mNo API key configured. Please open Settings (\u2699) and enter your Anthropic API key.\x1b[0m\r\n')
      }
      ws.close(4001, 'missing API key')
      return
    }
  }

  // Re-attach to existing live PTY if available
  let ptyProcess = getPty(sessionId)

  if (!ptyProcess) {
    try {
      ptyProcess = spawnClaude({
        cwd: sessionId === 'new' ? (cwd || WORKSPACE_ROOT) : undefined,
        sessionId,
        model,
      })
      if (sessionId !== 'new') {
        registerPty(sessionId, ptyProcess)
      } else {
        // For new sessions, resolve the real session ID Claude Code assigns,
        // then register the PTY under that ID so it can be found for re-attach/stop.
        // Run in a brief async timeout to let Claude Code write the session file first.
        setTimeout(() => {
          const realId = findNewestSessionId()
          if (realId) registerPty(realId, ptyProcess)
        }, 1500)
      }
    } catch (err) {
      if (ws.readyState === ws.OPEN) {
        ws.send('\r\n\x1b[31mFailed to start Claude Code: ' + err.message + '\x1b[0m\r\n')
      }
      ws.close()
      return
    }
  }

  // Bridge PTY <-> WebSocket (single message handler — checks for resize before writing)
  ptyProcess.onData(data => {
    if (ws.readyState === ws.OPEN) ws.send(data)
  })

  ptyProcess.onExit(() => {
    if (ws.readyState === ws.OPEN) {
      ws.send('\r\n\x1b[33m[Session ended]\x1b[0m\r\n')
      ws.close()
    }
  })

  ws.on('message', data => {
    const str = data.toString()
    try {
      const msg = JSON.parse(str)
      if (msg.type === 'resize') {
        ptyProcess.resize(msg.cols, msg.rows)
        return  // Do NOT write resize JSON to the PTY
      }
    } catch {}
    // Plain input — write to PTY
    try { ptyProcess.write(str) } catch {}
  })

  // Do NOT kill PTY on disconnect — session stays alive for re-attach
}

module.exports = { handleTerminalWs }
