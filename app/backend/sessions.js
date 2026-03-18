// app/backend/sessions.js
const { exec } = require('child_process')
const router = require('express').Router()

// In-memory registry of live PTY processes: sessionId -> pty instance
const livePtys = new Map()

function registerPty(sessionId, ptyProcess) {
  livePtys.set(sessionId, ptyProcess)
  ptyProcess.onExit(() => livePtys.delete(sessionId))
}

function getPty(sessionId) {
  return livePtys.get(sessionId) || null
}

function killPty(sessionId) {
  const pty = livePtys.get(sessionId)
  if (pty) {
    try { pty.kill() } catch {}
    livePtys.delete(sessionId)
    return true
  }
  return false
}

function parseSessions(raw) {
  // Try JSON first
  try {
    const parsed = JSON.parse(raw)
    const arr = Array.isArray(parsed) ? parsed : parsed.sessions || []
    return arr.map(s => ({
      id: s.id || s.sessionId || '',
      title: s.title || s.summary || '',
      projectPath: s.projectPath || s.cwd || s.directory || '',
      updatedAt: s.updatedAt || s.updated_at || s.timestamp || '',
    }))
  } catch {}

  // Fallback: parse tabular text
  // Expected format (approximate): "id  title  path  date"
  const lines = raw.trim().split('\n').filter(Boolean)
  return lines.map(line => {
    const parts = line.trim().split(/\s{2,}/)
    return {
      id: parts[0] || '',
      title: parts[1] || '',
      projectPath: parts[2] || '',
      updatedAt: parts[3] || '',
    }
  }).filter(s => s.id)
}

router.get('/', (req, res) => {
  exec('claude --list --all 2>/dev/null', { timeout: 10000 }, (err, stdout) => {
    if (err && !stdout) return res.json([])
    try {
      const sessions = parseSessions(stdout).map(s => ({
        ...s,
        live: livePtys.has(s.id),
      }))
      res.json(sessions)
    } catch {
      res.json([])
    }
  })
})

router.post('/:id/stop', (req, res) => {
  killPty(req.params.id)
  res.status(204).end()
})

module.exports = { router, registerPty, getPty, killPty }
