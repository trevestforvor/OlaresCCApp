// app/backend/files.js
const fs = require('fs')
const path = require('path')
const router = require('express').Router()

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspace'

function safeResolvePath(requestedPath) {
  const resolved = path.resolve(requestedPath || WORKSPACE_ROOT)
  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(WORKSPACE_ROOT + '/')) return null
  return resolved
}

router.get('/', (req, res) => {
  const target = safeResolvePath(req.query.path)
  if (!target) return res.status(403).json({ error: 'Path outside workspace' })

  try {
    const entries = fs.readdirSync(target, { withFileTypes: true })
    const items = entries
      .filter(e => !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        path: path.join(target, e.name),
        isDirectory: e.isDirectory(),
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    res.json({ path: target, items })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = { router }
