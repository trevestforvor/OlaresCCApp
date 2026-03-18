# Olares Claude Code Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and package a browser-accessible Claude Code developer environment as an Olares marketplace app.

**Architecture:** Single Docker container running a Node.js backend (Express + node-pty + WebSocket) that spawns Claude Code processes and serves a React/xterm.js frontend. Packaged as an Olares Application Chart (`claudecode/`) for marketplace submission.

**Tech Stack:** Node.js 20, Express, ws, node-pty, React 18, Vite 5, xterm.js v5, allotment (split pane), Helm/Olares OAC

**Spec:** `docs/specs/2026-03-18-olares-claude-code-design.md`

---

## File Map

```
OlaresCCApp/
├── image/
│   └── Dockerfile
├── app/
│   ├── backend/
│   │   ├── package.json
│   │   ├── server.js          # Express app entry: static, REST routes, WS upgrade
│   │   ├── settings.js        # Read/write /config/settings.json, masking logic
│   │   ├── files.js           # GET /api/files — shallow dir listing
│   │   ├── sessions.js        # Session registry + claude --list --all parser
│   │   ├── pty.js             # node-pty spawn/attach, WS bridge
│   │   └── models.js          # GET /api/models — SSRF-guarded proxy
│   └── frontend/
│       ├── package.json
│       ├── vite.config.js
│       ├── index.html
│       └── src/
│           ├── main.jsx
│           ├── App.jsx
│           ├── App.css
│           ├── components/
│           │   ├── TopBar.jsx         # Provider/model/session dropdowns, color picker
│           │   ├── FileTree.jsx       # /workspace browser, Open Here button
│           │   ├── Terminal.jsx       # xterm.js + WebSocket PTY
│           │   └── SettingsPanel.jsx  # Settings form (API keys, theme)
│           └── hooks/
│               ├── useSettings.js
│               └── useSessions.js
├── claudecode/
│   ├── Chart.yaml
│   ├── OlaresManifest.yaml
│   ├── values.yaml
│   ├── owners
│   ├── i18n/
│   │   ├── en-US/OlaresManifest.yaml
│   │   └── zh-CN/OlaresManifest.yaml
│   └── templates/
│       ├── deployment.yaml
│       └── configmap.yaml
└── docs/
    ├── specs/
    └── plans/
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `app/backend/package.json`
- Create: `app/frontend/package.json`
- Create: `app/frontend/vite.config.js`
- Create: `app/frontend/index.html`
- Create: `.gitignore`

- [ ] **Step 1: Create backend package.json**

```json
// app/backend/package.json
{
  "name": "claudecode-backend",
  "version": "1.0.0",
  "type": "commonjs",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.19.0",
    "ws": "^8.17.0",
    "node-pty": "^1.0.0"
  }
}
```

- [ ] **Step 2: Create frontend package.json**

```json
// app/frontend/package.json
{
  "name": "claudecode-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@xterm/xterm": "^5.5.0",
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/addon-web-links": "^0.11.0",
    "allotment": "^1.20.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.3.0"
  }
}
```

- [ ] **Step 3: Create vite.config.js**

```js
// app/frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../backend/public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
})
```

- [ ] **Step 4: Create index.html**

```html
<!-- app/frontend/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claude Code</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
app/backend/public/
dist/
*.tgz
.env
```

- [ ] **Step 6: Install dependencies**

```bash
cd app/backend && npm install
cd ../frontend && npm install
```

- [ ] **Step 7: Commit**

```bash
git add app/ .gitignore
git commit -m "chore: project scaffolding — backend and frontend package setup"
```

---

## Task 2: Backend Foundation

**Files:**
- Create: `app/backend/server.js`

- [ ] **Step 1: Write server.js**

```js
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
```

- [ ] **Step 2: Smoke-test server starts**

First create stub files so requires don't fail:
```bash
# In app/backend/
echo "const router = require('express').Router(); module.exports = { router };" > settings.js
echo "const router = require('express').Router(); module.exports = { router };" > files.js
echo "const router = require('express').Router(); module.exports = { router };" > sessions.js
echo "const router = require('express').Router(); module.exports = { router };" > models.js
echo "function handleTerminalWs() {} module.exports = { handleTerminalWs };" > pty.js
node server.js
```
Expected: `Claude Code UI listening on :3000`
Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add app/backend/server.js app/backend/settings.js app/backend/files.js app/backend/sessions.js app/backend/models.js app/backend/pty.js
git commit -m "feat: backend server foundation with stub routes"
```

---

## Task 3: Settings API

**Files:**
- Modify: `app/backend/settings.js`

The settings file lives at `/config/settings.json` in production; locally use `./dev-settings.json` (excluded from git).

- [ ] **Step 1: Write settings.js**

```js
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
    // Merge incoming over existing (don't overwrite masked placeholders)
    const existing = loadSettings()
    const incoming = req.body
    const merged = { ...existing }
    for (const [k, v] of Object.entries(incoming)) {
      // Skip if value looks like a mask placeholder (user didn't change it)
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
```

- [ ] **Step 2: Smoke-test settings endpoints**

```bash
node server.js &
curl http://localhost:3000/api/settings
# Expected: {}
curl -X PUT http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"ANTHROPIC_API_KEY":"sk-ant-test1234"}'
curl http://localhost:3000/api/settings
# Expected: {"ANTHROPIC_API_KEY":"****1234"}
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add app/backend/settings.js
git commit -m "feat: settings API with masked read and merge write"
```

---

## Task 4: File Tree API

**Files:**
- Modify: `app/backend/files.js`

- [ ] **Step 1: Write files.js**

```js
// app/backend/files.js
const fs = require('fs')
const path = require('path')
const router = require('express').Router()

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspace'

function safeResolvePath(requestedPath) {
  const resolved = path.resolve(requestedPath || WORKSPACE_ROOT)
  if (!resolved.startsWith(WORKSPACE_ROOT)) return null
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
```

- [ ] **Step 2: Smoke-test file listing**

```bash
WORKSPACE_ROOT=$(pwd) node server.js &
curl "http://localhost:3000/api/files"
# Expected: JSON listing of current directory, no dot files
curl "http://localhost:3000/api/files?path=../../etc"
# Expected: 403 {"error":"Path outside workspace"}
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add app/backend/files.js
git commit -m "feat: file tree API with workspace path confinement"
```

---

## Task 5: Sessions API

**Files:**
- Modify: `app/backend/sessions.js`

> **Note:** Before implementing the parser, run `claude --list --all` manually on the Olares device and inspect the raw output format (JSON vs tabular text). The parser below handles both; adjust if needed.

- [ ] **Step 1: Write sessions.js**

```js
// app/backend/sessions.js
const { execSync } = require('child_process')
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
  try {
    const raw = execSync('claude --list --all 2>/dev/null', {
      env: { ...process.env },
      timeout: 10000,
    }).toString()
    const sessions = parseSessions(raw).map(s => ({
      ...s,
      live: livePtys.has(s.id),
    }))
    res.json(sessions)
  } catch {
    // claude not found or no sessions yet
    res.json([])
  }
})

router.post('/:id/stop', (req, res) => {
  killPty(req.params.id)
  res.status(204).end()
})

module.exports = { router, registerPty, getPty, killPty }
```

- [ ] **Step 2: Smoke-test sessions endpoint**

```bash
node server.js &
curl http://localhost:3000/api/sessions
# Expected: [] (no claude binary locally) or a list of sessions
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add app/backend/sessions.js
git commit -m "feat: sessions API with live PTY registry and claude --list --all parser"
```

---

## Task 6: PTY & WebSocket

**Files:**
- Modify: `app/backend/pty.js`

- [ ] **Step 1: Write pty.js**

```js
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
        ws.send('\r\n\x1b[31mNo API key configured. Please open Settings (⚙) and enter your Anthropic API key.\x1b[0m\r\n')
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
```

- [ ] **Step 2: Smoke-test WebSocket connection (requires claude in PATH)**

```bash
node server.js &
# In another terminal, use wscat or a quick Node script:
node -e "
const ws = new (require('ws'))('ws://localhost:3000/ws/terminal/new?cwd=' + encodeURIComponent(process.cwd()));
ws.on('message', d => process.stdout.write(d.toString()));
setTimeout(() => { ws.send('claude --version\n'); }, 1000);
setTimeout(() => ws.close(), 3000);
"
kill %1
```
Expected: Claude version string in output.

- [ ] **Step 3: Commit**

```bash
git add app/backend/pty.js
git commit -m "feat: PTY spawn and WebSocket bridge with session re-attach"
```

---

## Task 7: Models Proxy API

**Files:**
- Modify: `app/backend/models.js`

- [ ] **Step 1: Write models.js**

```js
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

    const data = await new Promise((resolve, reject) => {
      const reqOpts = {
        hostname: modelsUrl.hostname,
        port: modelsUrl.port,
        path: modelsUrl.pathname,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` },
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
```

- [ ] **Step 2: Commit**

```bash
git add app/backend/models.js
git commit -m "feat: models proxy API with SSRF guard"
```

---

## Task 8: Frontend Scaffold & Layout

**Files:**
- Create: `app/frontend/src/main.jsx`
- Create: `app/frontend/src/App.jsx`
- Create: `app/frontend/src/App.css`

- [ ] **Step 1: Write main.jsx**

```jsx
// app/frontend/src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import 'allotment/dist/style.css'
import './App.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
```

- [ ] **Step 2: Write App.jsx**

```jsx
// app/frontend/src/App.jsx
import { useState } from 'react'
import { Allotment } from 'allotment'
import TopBar from './components/TopBar'
import FileTree from './components/FileTree'
import Terminal from './components/Terminal'
import SettingsPanel from './components/SettingsPanel'
import { useSettings } from './hooks/useSettings'
import { useSessions } from './hooks/useSessions'

export default function App() {
  const { settings, saveSettings } = useSettings()
  const { sessions, refresh: refreshSessions } = useSessions()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeSession, setActiveSession] = useState(null)
  const [selectedCwd, setSelectedCwd] = useState('/workspace')
  const [model, setModel] = useState('')

  const headerColor = settings?.theme?.headerColor || '#1a1a2e'

  function openSession(session) {
    setActiveSession(session)
  }

  function openHere(dirPath) {
    setSelectedCwd(dirPath)
    setActiveSession({ id: 'new', cwd: dirPath })
  }

  return (
    <div className="app">
      <TopBar
        headerColor={headerColor}
        sessions={sessions}
        model={model}
        onModelChange={setModel}
        onSessionSelect={openSession}
        onNewSession={() => openSession({ id: 'new', cwd: selectedCwd })}
        onSettingsOpen={() => setSettingsOpen(true)}
        settings={settings}
        onSettingsSave={saveSettings}
      />
      <div className="main-area">
        <Allotment defaultSizes={[250, 750]}>
          <Allotment.Pane minSize={150}>
            <FileTree onOpenHere={openHere} />
          </Allotment.Pane>
          <Allotment.Pane>
            <Terminal
              session={activeSession}
              model={model}
              onSessionEnd={refreshSessions}
            />
          </Allotment.Pane>
        </Allotment>
      </div>
      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onSave={async (data) => { await saveSettings(data); setSettingsOpen(false) }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Write App.css**

```css
/* app/frontend/src/App.css */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, #root { height: 100%; width: 100%; overflow: hidden; }

body {
  font-family: 'Segoe UI', system-ui, sans-serif;
  background: #0d0d14;
  color: #e0e0e0;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.main-area {
  flex: 1;
  overflow: hidden;
}

/* Allotment sash styling */
.sash { background: #2a2a3e; }
```

- [ ] **Step 4: Create stub hooks and components so Vite compiles**

```jsx
// app/frontend/src/hooks/useSettings.js
import { useState, useEffect } from 'react'
export function useSettings() {
  const [settings, setSettings] = useState({})
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setSettings).catch(() => {})
  }, [])
  async function saveSettings(data) {
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    const fresh = await fetch('/api/settings').then(r => r.json())
    setSettings(fresh)
  }
  return { settings, saveSettings }
}
```

```jsx
// app/frontend/src/hooks/useSessions.js
import { useState, useEffect, useCallback } from 'react'
export function useSessions() {
  const [sessions, setSessions] = useState([])
  const refresh = useCallback(() => {
    fetch('/api/sessions').then(r => r.json()).then(setSessions).catch(() => {})
  }, [])
  useEffect(() => { refresh() }, [refresh])
  return { sessions, refresh }
}
```

```jsx
// app/frontend/src/components/TopBar.jsx
export default function TopBar() { return <div style={{height:48,background:'#1a1a2e'}}>TopBar stub</div> }
```
```jsx
// app/frontend/src/components/FileTree.jsx
export default function FileTree() { return <div>FileTree stub</div> }
```
```jsx
// app/frontend/src/components/Terminal.jsx
export default function Terminal() { return <div style={{height:'100%',background:'#0d0d14'}}>Terminal stub</div> }
```
```jsx
// app/frontend/src/components/SettingsPanel.jsx
export default function SettingsPanel({ onClose }) { return <div><button onClick={onClose}>Close</button></div> }
```

- [ ] **Step 5: Verify Vite compiles**

```bash
cd app/frontend && npm run build
# Expected: build succeeds, app/backend/public/ created
```

- [ ] **Step 6: Commit**

```bash
git add app/frontend/src/
git commit -m "feat: frontend scaffold with allotment layout and stub components"
```

---

## Task 9: TopBar Component

**Files:**
- Modify: `app/frontend/src/components/TopBar.jsx`

- [ ] **Step 1: Write TopBar.jsx**

```jsx
// app/frontend/src/components/TopBar.jsx
import { useState, useEffect } from 'react'

const ANTHROPIC_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]

export default function TopBar({
  headerColor, sessions, model, onModelChange,
  onSessionSelect, onNewSession, onSettingsOpen, settings
}) {
  const [provider, setProvider] = useState('anthropic')
  const [thirdPartyModels, setThirdPartyModels] = useState([])
  const [modelInput, setModelInput] = useState(model)
  const [modelsFailed, setModelsFailed] = useState(false)

  useEffect(() => {
    if (provider === '3rdparty' && settings?.ANTHROPIC_BASE_URL) {
      fetch(`/api/models?baseUrl=${encodeURIComponent(settings.ANTHROPIC_BASE_URL)}`)
        .then(r => r.json())
        .then(d => {
          if (d.models?.length) { setThirdPartyModels(d.models); setModelsFailed(false) }
          else setModelsFailed(true)
        })
        .catch(() => setModelsFailed(true))
    }
  }, [provider, settings?.ANTHROPIC_BASE_URL])

  const modelList = provider === 'anthropic' ? ANTHROPIC_MODELS : thirdPartyModels

  function handleModelChange(val) {
    setModelInput(val)
    onModelChange(val)
  }

  const liveCount = sessions.filter(s => s.live).length

  return (
    <div style={{
      height: 48,
      background: headerColor,
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 12,
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      flexShrink: 0,
    }}>
      <span style={{ fontWeight: 700, color: '#fff', marginRight: 8, letterSpacing: 1 }}>
        Claude Code
      </span>

      {/* Provider */}
      <select
        value={provider}
        onChange={e => setProvider(e.target.value)}
        style={selectStyle}
      >
        <option value="anthropic">Anthropic</option>
        <option value="3rdparty">3rd Party</option>
      </select>

      {/* Model */}
      {provider === '3rdparty' && modelsFailed ? (
        <input
          value={modelInput}
          onChange={e => handleModelChange(e.target.value)}
          placeholder="model name"
          style={{ ...selectStyle, width: 160 }}
        />
      ) : (
        <select
          value={model}
          onChange={e => handleModelChange(e.target.value)}
          style={selectStyle}
        >
          <option value="">— model —</option>
          {modelList.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      )}

      {/* Sessions */}
      <select
        onChange={e => {
          if (e.target.value === '__new__') { onNewSession(); e.target.value = '' }
          else {
            const s = sessions.find(s => s.id === e.target.value)
            if (s) onSessionSelect(s)
          }
        }}
        style={selectStyle}
        defaultValue=""
      >
        <option value="" disabled>Sessions {liveCount > 0 ? `(${liveCount} live)` : ''}</option>
        <option value="__new__">+ New session</option>
        {sessions.map(s => (
          <option key={s.id} value={s.id}>
            {s.live ? '● ' : '○ '}{s.title || s.id.slice(0, 8)} — {(s.projectPath || '').split('/').pop()}
          </option>
        ))}
      </select>

      <span style={{ flex: 1 }} />

      {/* Settings */}
      <button onClick={onSettingsOpen} style={btnStyle} title="Settings">⚙</button>
    </div>
  )
}

const selectStyle = {
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 13,
  cursor: 'pointer',
}

const btnStyle = {
  background: 'transparent',
  color: '#fff',
  border: 'none',
  fontSize: 18,
  cursor: 'pointer',
  padding: '4px 8px',
}
```

- [ ] **Step 2: Build and visually verify TopBar renders**

```bash
cd app/frontend && npm run build
# Start backend: cd app/backend && node server.js
# Open http://localhost:3000 — verify top bar with dropdowns appears
```

- [ ] **Step 3: Commit**

```bash
git add app/frontend/src/components/TopBar.jsx
git commit -m "feat: TopBar with provider/model/session dropdowns and color theming"
```

---

## Task 10: FileTree Component

**Files:**
- Modify: `app/frontend/src/components/FileTree.jsx`

- [ ] **Step 1: Write FileTree.jsx**

```jsx
// app/frontend/src/components/FileTree.jsx
import { useState, useEffect } from 'react'

export default function FileTree({ onOpenHere }) {
  const [currentPath, setCurrentPath] = useState('/workspace')
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => { loadPath(currentPath) }, [currentPath])

  function loadPath(p) {
    fetch(`/api/files?path=${encodeURIComponent(p)}`)
      .then(r => r.json())
      .then(d => { setItems(d.items || []); setError(null) })
      .catch(() => setError('Failed to load'))
  }

  function navigate(item) {
    if (item.isDirectory) setCurrentPath(item.path)
  }

  const parts = currentPath.replace('/workspace', '').split('/').filter(Boolean)

  return (
    <div style={{ height: '100%', overflow: 'auto', background: '#111118', padding: 8 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
        <span
          style={{ cursor: 'pointer', color: '#888' }}
          onClick={() => setCurrentPath('/workspace')}
        >/workspace</span>
        {parts.map((p, i) => {
          const path = '/workspace/' + parts.slice(0, i + 1).join('/')
          return (
            <span key={path}>
              <span style={{ color: '#444' }}>/</span>
              <span style={{ cursor: 'pointer', color: '#888' }} onClick={() => setCurrentPath(path)}>{p}</span>
            </span>
          )
        })}
      </div>

      {error && <div style={{ color: '#f55', fontSize: 12 }}>{error}</div>}

      {items.map(item => (
        <div key={item.path} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <span
            onClick={() => navigate(item)}
            style={{
              flex: 1,
              cursor: item.isDirectory ? 'pointer' : 'default',
              color: item.isDirectory ? '#7eb8f7' : '#c8c8d4',
              fontSize: 13,
              padding: '2px 4px',
              borderRadius: 3,
            }}
          >
            {item.isDirectory ? '📁' : '📄'} {item.name}
          </span>
          {item.isDirectory && (
            <button
              onClick={() => onOpenHere(item.path)}
              style={{
                background: 'rgba(126,184,247,0.15)',
                color: '#7eb8f7',
                border: 'none',
                borderRadius: 3,
                fontSize: 11,
                padding: '1px 6px',
                cursor: 'pointer',
              }}
            >
              Open
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Build and verify file tree renders**

```bash
cd app/frontend && npm run build
# Open http://localhost:3000 — file tree should show workspace contents
```

- [ ] **Step 3: Commit**

```bash
git add app/frontend/src/components/FileTree.jsx
git commit -m "feat: FileTree component with breadcrumb nav and Open Here button"
```

---

## Task 11: Terminal Component

**Files:**
- Modify: `app/frontend/src/components/Terminal.jsx`

- [ ] **Step 1: Write Terminal.jsx**

```jsx
// app/frontend/src/components/Terminal.jsx
import { useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

export default function Terminal({ session, model, onSessionEnd }) {
  const containerRef = useRef(null)
  const xtermRef = useRef(null)
  const fitAddonRef = useRef(null)
  const wsRef = useRef(null)

  const connect = useCallback((sess) => {
    if (!sess) return
    if (wsRef.current) wsRef.current.close()

    const term = xtermRef.current
    term.clear()

    let url
    if (sess.id === 'new') {
      const cwd = encodeURIComponent(sess.cwd || '/workspace')
      const m = model ? `&model=${encodeURIComponent(model)}` : ''
      url = `ws://${location.host}/ws/terminal/new?cwd=${cwd}${m}`
    } else {
      const m = model ? `?model=${encodeURIComponent(model)}` : ''
      url = `ws://${location.host}/ws/terminal/${sess.id}${m}`
    }

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      // Send initial size
      const { cols, rows } = term
      ws.send(JSON.stringify({ type: 'resize', cols, rows }))
    }

    ws.onmessage = e => term.write(e.data)

    ws.onclose = (e) => {
      if (e.code === 4003) {
        term.write('\r\n\x1b[31mError: working directory is outside workspace\x1b[0m\r\n')
      }
      if (onSessionEnd) onSessionEnd()
    }

    ws.onerror = () => term.write('\r\n\x1b[31mWebSocket error\x1b[0m\r\n')

    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data)
    })
  }, [model, onSessionEnd])

  // Init xterm on mount
  useEffect(() => {
    const term = new XTerm({
      theme: { background: '#0d0d14', foreground: '#e0e0e0', cursor: '#7eb8f7' },
      fontFamily: '"Cascadia Code", "Fira Code", monospace',
      fontSize: 14,
      cursorBlink: true,
      scrollback: 5000,
    })
    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(containerRef.current)
    fitAddon.fit()
    xtermRef.current = term
    fitAddonRef.current = fitAddon

    const obs = new ResizeObserver(() => {
      fitAddon.fit()
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    })
    obs.observe(containerRef.current)

    return () => { obs.disconnect(); term.dispose(); wsRef.current?.close() }
  }, [])

  // Connect when session changes
  useEffect(() => {
    if (xtermRef.current) connect(session)
  }, [session, connect])

  return (
    <div
      ref={containerRef}
      style={{ height: '100%', background: '#0d0d14', padding: 4 }}
    />
  )
}
```

- [ ] **Step 2: Build and verify terminal renders**

```bash
cd app/frontend && npm run build
# Start backend, open http://localhost:3000
# Click "Open" on a directory in the file tree — terminal should connect and show claude
```

- [ ] **Step 3: Commit**

```bash
git add app/frontend/src/components/Terminal.jsx
git commit -m "feat: Terminal component with xterm.js, WebSocket PTY, and auto-resize"
```

---

## Task 12: Settings Panel Component

**Files:**
- Modify: `app/frontend/src/components/SettingsPanel.jsx`

- [ ] **Step 1: Write SettingsPanel.jsx**

```jsx
// app/frontend/src/components/SettingsPanel.jsx
import { useState } from 'react'

const FIELDS = [
  { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', type: 'password' },
  { key: 'ANTHROPIC_BASE_URL', label: '3rd Party Base URL', type: 'text', placeholder: 'http://ollama:11434' },
  { key: 'ANTHROPIC_AUTH_TOKEN', label: 'Auth Token', type: 'password' },
  { key: 'DEFAULT_MODEL', label: 'Default Model (single name for all tiers)', type: 'text' },
]

export default function SettingsPanel({ settings, onSave, onClose }) {
  const [form, setForm] = useState({
    ANTHROPIC_API_KEY: settings?.ANTHROPIC_API_KEY || '',
    ANTHROPIC_BASE_URL: settings?.ANTHROPIC_BASE_URL || '',
    ANTHROPIC_AUTH_TOKEN: settings?.ANTHROPIC_AUTH_TOKEN || '',
    DEFAULT_MODEL: settings?.DEFAULT_MODEL || '',
    theme: settings?.theme || { headerColor: '#1a1a2e' },
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: '#1a1a2e', borderRadius: 8, padding: 24, minWidth: 400,
        border: '1px solid rgba(255,255,255,0.1)',
      }}>
        <h2 style={{ color: '#fff', marginBottom: 20, fontSize: 16 }}>Settings</h2>

        {FIELDS.map(f => (
          <div key={f.key} style={{ marginBottom: 14 }}>
            <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>{f.label}</label>
            <input
              type={f.type}
              value={form[f.key] || ''}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.placeholder || ''}
              style={inputStyle}
            />
          </div>
        ))}

        <div style={{ marginBottom: 20 }}>
          <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>Header Color</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              value={form.theme?.headerColor || '#1a1a2e'}
              onChange={e => setForm(p => ({ ...p, theme: { ...p.theme, headerColor: e.target.value } }))}
              style={{ width: 40, height: 32, border: 'none', cursor: 'pointer', background: 'none' }}
            />
            <input
              type="text"
              value={form.theme?.headerColor || ''}
              onChange={e => setForm(p => ({ ...p, theme: { ...p.theme, headerColor: e.target.value } }))}
              style={{ ...inputStyle, width: 100 }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={btnPrimary}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', background: 'rgba(255,255,255,0.05)', color: '#e0e0e0',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4,
  padding: '6px 10px', fontSize: 13,
}
const btnPrimary = {
  background: '#3a5fc8', color: '#fff', border: 'none',
  borderRadius: 4, padding: '8px 16px', cursor: 'pointer', fontSize: 13,
}
const btnSecondary = {
  background: 'rgba(255,255,255,0.07)', color: '#aaa', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 4, padding: '8px 16px', cursor: 'pointer', fontSize: 13,
}
```

- [ ] **Step 2: Build and verify settings panel opens and saves**

```bash
cd app/frontend && npm run build
# Open http://localhost:3000, click ⚙, fill in API key, save, verify it persists
```

- [ ] **Step 3: Commit**

```bash
git add app/frontend/src/components/SettingsPanel.jsx
git commit -m "feat: SettingsPanel with API key fields and header color picker"
```

---

## Task 13: Integration Test

**Files:**
- Create: `app/backend/test-integration.js`

- [ ] **Step 1: Write integration test script**

```js
// app/backend/test-integration.js
// Run: SETTINGS_PATH=./dev-settings.json WORKSPACE_ROOT=$(pwd) node test-integration.js
const http = require('http')
const { WebSocket } = require('ws')

const BASE = 'http://localhost:3000'
let passed = 0
let failed = 0

function assert(condition, msg) {
  if (condition) { console.log(`  ✓ ${msg}`); passed++ }
  else { console.error(`  ✗ ${msg}`); failed++ }
}

async function get(path) {
  return new Promise((resolve, reject) => {
    http.get(BASE + path, res => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }))
    }).on('error', reject)
  })
}

async function testSettings() {
  console.log('\n[Settings API]')
  const r = await get('/api/settings')
  assert(r.status === 200, 'GET /api/settings returns 200')
  assert(typeof r.body === 'object', 'response is object')
}

async function testFiles() {
  console.log('\n[Files API]')
  const r = await get('/api/files')
  assert(r.status === 200, 'GET /api/files returns 200')
  assert(Array.isArray(r.body.items), 'items is array')
  const r2 = await get('/api/files?path=../../etc')
  assert(r2.status === 403, 'path traversal returns 403')
}

async function testSessions() {
  console.log('\n[Sessions API]')
  const r = await get('/api/sessions')
  assert(r.status === 200, 'GET /api/sessions returns 200')
  assert(Array.isArray(r.body), 'response is array')
}

async function testWsPty() {
  console.log('\n[WebSocket PTY]')
  return new Promise(resolve => {
    const cwd = encodeURIComponent(process.cwd())
    const ws = new WebSocket(`ws://localhost:3000/ws/terminal/new?cwd=${cwd}`)
    let output = ''
    const timer = setTimeout(() => {
      assert(false, 'PTY round-trip (timeout)')
      ws.close()
      resolve()
    }, 8000)

    ws.on('open', () => {
      setTimeout(() => ws.send('claude --version\n'), 500)
    })
    ws.on('message', d => {
      output += d.toString()
      if (output.includes('claude') && output.includes('.')) {
        clearTimeout(timer)
        assert(true, `PTY round-trip: received "${output.replace(/\r?\n/g,' ').trim().slice(0,60)}"`)
        ws.close()
        resolve()
      }
    })
    ws.on('error', () => { clearTimeout(timer); assert(false, 'WebSocket error'); resolve() })
  })
}

async function main() {
  console.log('Starting integration tests (server must be running on :3000)...')
  await testSettings()
  await testFiles()
  await testSessions()
  await testWsPty()
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Run integration tests**

```bash
cd app/backend
SETTINGS_PATH=./dev-settings.json WORKSPACE_ROOT=$(pwd) node server.js &
sleep 1
SETTINGS_PATH=./dev-settings.json WORKSPACE_ROOT=$(pwd) node test-integration.js
kill %1
```
Expected: all tests pass (PTY test requires `claude` in PATH)

- [ ] **Step 3: Commit**

```bash
git add app/backend/test-integration.js
git commit -m "test: integration test for REST endpoints and WebSocket PTY round-trip"
```

---

## Task 14: Dockerfile

**Files:**
- Create: `image/Dockerfile`

- [ ] **Step 1: Write Dockerfile**

```dockerfile
# image/Dockerfile
FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash curl ca-certificates git jq less ripgrep tini \
    python3 make g++ \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

# Create user
RUN useradd -m -u 1000 -s /bin/bash claude

# Install Claude Code as root first (install.sh installs to $HOME/.local/bin)
USER claude
ENV HOME=/home/claude
ENV PATH=/home/claude/.local/bin:${PATH}
RUN curl -fsSL https://claude.ai/install.sh | bash -s stable

# Switch back to root to install app
USER root

# Build frontend
COPY app/frontend /build/frontend
WORKDIR /build/frontend
RUN npm ci && npm run build
# Output lands in app/backend/public via vite.config.js outDir — but we're in /build
# so we need to copy manually:
RUN cp -r /build/frontend/../backend/public /app-public 2>/dev/null || true

# Install backend
COPY app/backend /app
WORKDIR /app
# Remove stubs if any were committed, copy built frontend
RUN npm ci
COPY --from=0 /build/frontend/. /build/frontend/.
# Re-run build to put output directly
RUN mkdir -p /app/public

# Actually let's do the build inside the same stage properly:
# (see note below — multi-stage is cleaner)

EXPOSE 3000
ENV HOME=/home/claude
ENV PATH=/home/claude/.local/bin:${PATH}
ENV SETTINGS_PATH=/config/settings.json
ENV WORKSPACE_ROOT=/workspace

USER claude
WORKDIR /workspace
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "/app/server.js"]
```

> **Note:** The Dockerfile above is a single-stage draft. For a cleaner build, use a two-stage approach: stage 1 builds the frontend (Node.js build tools), stage 2 is the runtime image. Refine as needed during the actual build.

- [ ] **Step 2: Write a cleaner two-stage Dockerfile**

```dockerfile
# image/Dockerfile  (final version)
FROM ubuntu:24.04 AS builder

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY app/frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY app/frontend ./frontend
# Override outDir for the build stage
RUN cd frontend && npx vite build --outDir /build/public

COPY app/backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev
COPY app/backend ./backend

# ── Runtime stage ──────────────────────────────────────────────
FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash curl ca-certificates git jq less ripgrep tini \
    python3 make g++ \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 -s /bin/bash claude

USER claude
ENV HOME=/home/claude
ENV PATH=/home/claude/.local/bin:${PATH}
RUN curl -fsSL https://claude.ai/install.sh | bash -s stable

USER root
COPY --from=builder /build/backend /app
COPY --from=builder /build/public /app/public

ENV HOME=/home/claude
ENV PATH=/home/claude/.local/bin:${PATH}
ENV SETTINGS_PATH=/config/settings.json
ENV WORKSPACE_ROOT=/workspace
ENV PORT=3000

EXPOSE 3000
USER claude
WORKDIR /workspace
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "/app/server.js"]
```

The Dockerfile overrides the outDir via the Vite CLI flag `--outDir /build/public`. Do NOT change `vite.config.js` — the `outDir: '../backend/public'` setting must remain for local dev builds (Tasks 9–12 smoke tests depend on it).

- [ ] **Step 3: Build and verify image**

```bash
cd OlaresCCApp
docker build -f image/Dockerfile -t claudecode-olares:local .
docker run --rm -p 3000:3000 \
  -e SETTINGS_PATH=/tmp/settings.json \
  -e WORKSPACE_ROOT=/tmp \
  claudecode-olares:local
# Open http://localhost:3000 — UI should load
```

- [ ] **Step 4: Commit**

```bash
git add image/Dockerfile
git commit -m "feat: two-stage Dockerfile — builder for frontend, runtime with Claude Code"
```

> **Note:** `vite.config.js` is NOT changed here. The Dockerfile CLI flag `--outDir /build/public` overrides the output directory only during Docker builds. Local dev builds continue to write to `app/backend/public/`.

---

## Task 15: Olares Application Chart

**Files:**
- Create: `claudecode/Chart.yaml`
- Create: `claudecode/OlaresManifest.yaml`
- Create: `claudecode/values.yaml`
- Create: `claudecode/owners`
- Create: `claudecode/i18n/en-US/OlaresManifest.yaml`
- Create: `claudecode/i18n/zh-CN/OlaresManifest.yaml`
- Create: `claudecode/templates/deployment.yaml`
- Create: `claudecode/templates/configmap.yaml`

- [ ] **Step 1: Chart.yaml**

```yaml
# claudecode/Chart.yaml
apiVersion: v2
name: claudecode
description: Claude Code Web UI — browser-based terminal and file tree for Claude Code on Olares
type: application
version: '0.1.0'
appVersion: 'stable'
```

- [ ] **Step 2: OlaresManifest.yaml**

```yaml
# claudecode/OlaresManifest.yaml
olaresManifest.version: '0.11.0'
olaresManifest.type: app
metadata:
  name: claudecode
  icon: https://app.cdn.olares.com/appstore/codeserver/icon.png
  description: Browser-based Claude Code terminal with file tree, session management, and provider configuration.
  appid: claudecode
  title: Claude Code
  version: '0.1.0'
  categories:
  - Developer Tools
  - Productivity
entrances:
- name: claudecode
  port: 3000
  host: claudecode
  title: Claude Code
  icon: https://app.cdn.olares.com/appstore/codeserver/icon.png
  openMethod: window
  authLevel: internal
spec:
  versionName: '0.1.0'
  fullDescription: |
    Claude Code running in a browser-based developer environment on your Olares device.

    Features:
    - Split-pane layout: file tree on the left, xterm.js terminal on the right
    - Session management: create, resume, and switch Claude Code sessions
    - Provider configuration: Anthropic API or any OpenAI-compatible 3rd-party endpoint
    - Model selection: choose Claude model at session spawn time
    - Persistent sessions and plugins: Claude Code sessions and installed plugins survive container restarts
    - Customizable header color

    Designed for remote development of Olares marketplace apps from another machine.
  upgradeDescription: |
    Initial release.
  developer: trevor
  website: https://code.claude.com/
  sourceCode: https://docs.anthropic.com/en/docs/claude-code
  submitter: trevor
  locale:
  - en-US
  - zh-CN
  doc: https://docs.anthropic.com/en/docs/claude-code
  license:
  - text: Proprietary
    url: https://www.anthropic.com/legal/commercial-terms
  requiredMemory: 1Gi
  limitedMemory: 4Gi
  requiredDisk: 256Mi
  limitedDisk: 8Gi
  requiredCpu: 250m
  limitedCpu: '2'
  supportArch:
  - amd64
  - arm64
permission:
  appData: true
  appCache: true
  userData:
  - Home
options:
  allowMultipleInstall: false
  apiTimeout: 0
  dependencies:
  - name: olares
    type: system
    version: '>=1.12.3-0'
envs:
- envName: ANTHROPIC_BASE_URL
  type: string
  required: false
  applyOnChange: true
  editable: true
  default: ''
  description: 'Anthropic-compatible backend URL for 3rd-party providers. Example: http://ollama:11434'
- envName: ANTHROPIC_API_KEY
  type: string
  required: false
  applyOnChange: true
  editable: true
  default: ''
  description: 'Anthropic API key. Required for Anthropic provider.'
- envName: ANTHROPIC_AUTH_TOKEN
  type: string
  required: false
  applyOnChange: true
  editable: true
  default: ''
  description: 'Alternative auth token for 3rd-party integrations.'
- envName: DEFAULT_MODEL
  type: string
  required: false
  applyOnChange: true
  editable: true
  default: ''
  description: 'Default model name mapped to all Claude tiers (Opus, Sonnet, Haiku). Used for 3rd-party backends.'
```

- [ ] **Step 3: values.yaml**

```yaml
# claudecode/values.yaml
image:
  repository: docker.io/YOUR_DOCKERHUB_HANDLE/claudecode-olares
  tag: stable
  pullPolicy: IfNotPresent

resources:
  requests:
    cpu: 250m
    memory: 512Mi
  limits:
    cpu: '2'
    memory: 4Gi
```

- [ ] **Step 4: owners**

```
# claudecode/owners
owners:
- YOUR_GITHUB_HANDLE
```

- [ ] **Step 5: i18n/en-US/OlaresManifest.yaml**

```yaml
# claudecode/i18n/en-US/OlaresManifest.yaml
metadata:
  title: Claude Code
  description: Browser-based Claude Code terminal with file tree and session management.
spec:
  fullDescription: |
    Claude Code running in a browser-based developer environment on your Olares device.
    Features file tree, session management, provider configuration, and persistent plugins.
  upgradeDescription: |
    Initial release.
```

- [ ] **Step 6: i18n/zh-CN/OlaresManifest.yaml**

```yaml
# claudecode/i18n/zh-CN/OlaresManifest.yaml
metadata:
  title: Claude Code
  description: 在 Olares 设备上运行的基于浏览器的 Claude Code 终端，支持文件树和会话管理。
spec:
  fullDescription: |
    在您的 Olares 设备上运行的基于浏览器的 Claude Code 开发环境。
    支持文件树、会话管理、提供商配置和插件持久化。
  upgradeDescription: |
    初始版本。
```

- [ ] **Step 7: templates/configmap.yaml**

The init container handles directory setup; the backend starts directly via the Dockerfile CMD. No runtime startup script is needed. Create a minimal placeholder ConfigMap so Helm templating stays clean:

```yaml
# claudecode/templates/configmap.yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: "{{ .Release.Name }}-config"
  namespace: "{{ .Release.Namespace }}"
data:
  # Reserved for future runtime configuration
  APP_VERSION: "0.1.0"
```

- [ ] **Step 8: templates/deployment.yaml**

```yaml
# claudecode/templates/deployment.yaml
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claudecode
  namespace: "{{ .Release.Namespace }}"
  labels:
    io.kompose.service: claudecode
spec:
  replicas: 1
  selector:
    matchLabels:
      io.kompose.service: claudecode
  strategy:
    type: Recreate
  template:
    metadata:
      labels:
        io.kompose.network/chrome-default: "true"
        io.kompose.service: claudecode
    spec:
      initContainers:
        - name: init-home
          image: "docker.io/beclab/aboveos-busybox:1.37.0"
          command:
            - sh
            - '-c'
            - |
              mkdir -p /home/claude/.claude /config /workspace
              chown -R 1000:1000 /home/claude /config /workspace
          securityContext:
            runAsUser: 0
          volumeMounts:
            - name: app-home
              mountPath: /home/claude
            - name: app-config
              mountPath: /config
            - name: user-workspace
              mountPath: /workspace
      containers:
        - name: claudecode
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: 3000
              protocol: TCP
          env:
            - name: HOME
              value: /home/claude
            - name: SHELL
              value: /bin/bash
            - name: TERM
              value: xterm-256color
            - name: SETTINGS_PATH
              value: /config/settings.json
            - name: WORKSPACE_ROOT
              value: /workspace
            - name: PORT
              value: "3000"
            - name: ANTHROPIC_BASE_URL
              value: {{ .Values.olaresEnv.ANTHROPIC_BASE_URL | default "" | quote }}
            - name: ANTHROPIC_API_KEY
              value: {{ .Values.olaresEnv.ANTHROPIC_API_KEY | default "" | quote }}
            - name: ANTHROPIC_AUTH_TOKEN
              value: {{ .Values.olaresEnv.ANTHROPIC_AUTH_TOKEN | default "" | quote }}
            - name: DEFAULT_MODEL
              value: {{ .Values.olaresEnv.DEFAULT_MODEL | default "" | quote }}
          resources:
            requests:
              cpu: {{ .Values.resources.requests.cpu | quote }}
              memory: {{ .Values.resources.requests.memory | quote }}
            limits:
              cpu: {{ .Values.resources.limits.cpu | quote }}
              memory: {{ .Values.resources.limits.memory | quote }}
          readinessProbe:
            tcpSocket:
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            tcpSocket:
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          volumeMounts:
            - name: app-home
              mountPath: /home/claude
            - name: app-config
              mountPath: /config
            - name: user-workspace
              mountPath: /workspace
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
      restartPolicy: Always
      volumes:
        - name: app-home
          hostPath:
            {{- if .Values.sysVersion }}
              {{- if semverCompare ">=1.12.3-0" (toString .Values.sysVersion) }}
            path: '{{ .Values.userspace.appData }}'
              {{- else }}
            path: '{{ .Values.userspace.appData }}/claudecode'
              {{- end }}
            {{- else }}
            path: '{{ .Values.userspace.appData }}/claudecode'
            {{- end }}
            type: DirectoryOrCreate
        - name: app-config
          hostPath:
            {{- if .Values.sysVersion }}
              {{- if semverCompare ">=1.12.3-0" (toString .Values.sysVersion) }}
            path: '{{ .Values.userspace.appData }}/config'
              {{- else }}
            path: '{{ .Values.userspace.appData }}/claudecode/config'
              {{- end }}
            {{- else }}
            path: '{{ .Values.userspace.appData }}/claudecode/config'
            {{- end }}
            type: DirectoryOrCreate
        - name: user-workspace
          hostPath:
            path: '{{ .Values.userspace.userData }}'
            type: DirectoryOrCreate

---
apiVersion: v1
kind: Service
metadata:
  name: claudecode
  namespace: "{{ .Release.Namespace }}"
  labels:
    io.kompose.service: claudecode
spec:
  type: ClusterIP
  selector:
    io.kompose.service: claudecode
  ports:
    - name: "3000"
      protocol: TCP
      port: 3000
      targetPort: 3000
```

- [ ] **Step 9: Verify Helm template renders without errors**

```bash
# Install helm if not present: https://helm.sh/docs/intro/install/
helm template claudecode ./claudecode \
  --set userspace.appData=/tmp/appdata \
  --set userspace.userData=/tmp/userdata \
  --set sysVersion=1.12.3 \
  --set olaresEnv.ANTHROPIC_API_KEY=test \
  --set olaresEnv.ANTHROPIC_BASE_URL="" \
  --set olaresEnv.ANTHROPIC_AUTH_TOKEN="" \
  --set olaresEnv.DEFAULT_MODEL=""
# Expected: valid YAML output, no template errors
```

- [ ] **Step 10: Commit**

```bash
git add claudecode/
git commit -m "feat: Olares Application Chart for claudecode marketplace submission"
```

---

## Task 16: Build, Push & Olares Install Test

- [ ] **Step 1: Build and push Docker image**

```bash
docker build -f image/Dockerfile -t docker.io/YOUR_HANDLE/claudecode-olares:stable .
docker push docker.io/YOUR_HANDLE/claudecode-olares:stable
```

- [ ] **Step 2: Update values.yaml with real image reference**

Edit `claudecode/values.yaml`:
```yaml
image:
  repository: docker.io/YOUR_HANDLE/claudecode-olares
  tag: stable
```

- [ ] **Step 3: Package the chart**

```bash
helm package claudecode/
# Creates claudecode-0.1.0.tgz
```

- [ ] **Step 4: Install via Olares Studio**

Follow Olares Studio docs to sideload the chart onto your Olares device and verify:
- App appears in Olares desktop
- Clicking opens the browser UI
- File tree shows your home directory contents under `/workspace`
- Entering API key in Settings persists across pod restarts
- Opening a session from the file tree launches Claude Code in the terminal

- [ ] **Step 5: Final commit**

```bash
git add claudecode/values.yaml
git commit -m "chore: update image reference for marketplace submission"
```

---

## Marketplace Submission Checklist

- [ ] Replace all `YOUR_HANDLE` / `YOUR_DOCKERHUB_HANDLE` / `YOUR_GITHUB_HANDLE` placeholders
- [ ] Add a proper app icon URL (replace the placeholder codeserver icon)
- [ ] Verify `claude --list --all` output format on the actual Olares device and adjust `parseSessions()` in `sessions.js` if needed
- [ ] Fork `beclab/apps` on GitHub
- [ ] Add `claudecode/` folder to your fork
- [ ] Open Draft PR: `[New][claudecode][0.1.0] Claude Code Web UI`
