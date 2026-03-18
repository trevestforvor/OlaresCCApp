// app/backend/models.js
const https = require('https')
const http = require('http')
const { URL } = require('url')
const router = require('express').Router()
const { loadSettings } = require('./settings')

router.get('/', async (req, res) => {
  const settings = loadSettings()
  const savedBaseUrl = settings.ANTHROPIC_BASE_URL

  if (!savedBaseUrl) {
    return res.status(400).json({ error: 'No base URL configured in settings' })
  }

  // SSRF guard: only allow the saved base URL
  const requested = req.query.baseUrl
  if (!requested || requested !== savedBaseUrl) {
    return res.status(403).json({ error: 'baseUrl must match configured base URL' })
  }

  try {
    const modelsUrl = new URL('/v1/models', savedBaseUrl)
    const proto = modelsUrl.protocol === 'https:' ? https : http
    const apiKey = settings.ANTHROPIC_API_KEY || settings.ANTHROPIC_AUTH_TOKEN || ''
    if (!apiKey) return res.status(400).json({ error: 'No API key configured in settings' })

    const data = await new Promise((resolve, reject) => {
      const reqOpts = {
        hostname: modelsUrl.hostname,
        port: modelsUrl.port,
        path: modelsUrl.pathname,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'x-api-key': apiKey },
        timeout: 5000,
      }
      const r = proto.request(reqOpts, resp => {
        let body = ''
        resp.on('data', c => body += c)
        resp.on('end', () => resolve(body))
      })
      r.on('error', reject)
      r.on('timeout', () => { r.destroy(); reject(new Error('timeout')) })
      r.end()
    })

    const parsed = JSON.parse(data)
    const models = (parsed.data || parsed.models || []).map(m => m.id || m).filter(Boolean)
    res.json({ models })
  } catch {
    res.json({ models: [], error: 'unavailable' })
  }
})

module.exports = { router }
