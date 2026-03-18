// app/backend/settings.js
const fs = require('fs')
const path = require('path')
const router = require('express').Router()

const SETTINGS_PATH = process.env.SETTINGS_PATH || path.join(__dirname, 'dev-settings.json')

const MASKED_KEYS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function saveSettings(data) {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true })
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2))
}

function maskValue(key, value) {
  if (!value || !MASKED_KEYS.includes(key)) return value
  if (value.length <= 4) return '****'
  return '****' + value.slice(-4)
}

router.get('/', (req, res) => {
  const settings = loadSettings()
  const masked = {}
  for (const [k, v] of Object.entries(settings)) {
    masked[k] = typeof v === 'string' ? maskValue(k, v) : v
  }
  res.json(masked)
})

router.put('/', (req, res) => {
  try {
    const existing = loadSettings()
    const incoming = req.body
    const merged = { ...existing }
    for (const [k, v] of Object.entries(incoming)) {
      // Skip masked placeholders — user didn't change the value
      if (typeof v === 'string' && v.startsWith('****') && v.length <= 8) continue
      merged[k] = v
    }
    saveSettings(merged)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = { router, loadSettings }
