// app/backend/server.js
const express = require('express')
const http = require('http')
const path = require('path')
const { WebSocketServer } = require('ws')
const { handleTerminalWs } = require('./pty')

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// Routes mounted in later tasks
app.use('/api/settings', require('./settings').router)
app.use('/api/files', require('./files').router)
app.use('/api/sessions', require('./sessions').router)
app.use('/api/models', require('./models').router)

// 404 for unmatched /api/* routes (prevents SPA fallback returning HTML to API clients)
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }))

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

const server = http.createServer(app)

const wss = new WebSocketServer({ noServer: true })
wss.on('connection', handleTerminalWs)

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname.startsWith('/ws/terminal/')) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  } else {
    socket.destroy()
  }
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => console.log(`Claude Code UI listening on :${PORT}`))
