# Headless Claude Code Terminal — Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken ttyd web terminal with a minimal node-pty + WebSocket + xterm.js stack so Claude Code renders correctly and its interactive auth flow works. Consolidate the repo to a single "Claude Code" app (dropping the full UI app and the "headless" naming).

**Architecture:** A tiny Node.js HTTP + WebSocket server spawns a genuine PTY via node-pty and bridges it to an xterm.js frontend. The browser sends terminal dimensions before the PTY is spawned, guaranteeing correct initial size. Claude Code runs as a real interactive process — `isatty()` returns true, TUI mode activates, and the auth flow triggers normally.

**Tech Stack:** node-pty@^1.1.0, ws@^8.18.0, @xterm/xterm@5 (CDN), @xterm/addon-fit@0.10 (CDN), dumb-init, Ubuntu 24.04, Node.js 20, Docker multi-stage build.

**Spec:** `docs/superpowers/specs/2026-03-18-headless-redesign.md`

---

## File Map

| File | Action | What it does |
|---|---|---|
| `claudecode/` | Rename from `claudecodeheadless/` | The one and only Claude Code Olares chart |
| `claudecode/OlaresManifest.yaml` | Modify (was headless manifest) | Update appid, title, image ref, description |
| `claudecode/values.yaml` | Modify | Update image repo to `claudecode-olares` |
| `claudecode/templates/deployment.yaml` | Modify | Update service name + add env vars |
| `image-headless/package.json` | Create | ws + node-pty deps |
| `image-headless/server.js` | Create | HTTP + WebSocket PTY server |
| `image-headless/index.html` | Create | Full-screen xterm.js frontend |
| `image-headless/Dockerfile` | Rewrite | Multi-stage: compile node-pty, runtime with claude + dumb-init |
| `.github/workflows/docker-publish.yml` | Modify | Single job: build `image-headless/Dockerfile` → `claudecode-olares` |
| `app/` | Delete | Full UI source — replaced by headless approach |
| `claudecodeheadless/` (old name) | Deleted by rename | Replaced by `claudecode/` |
| `image/` | Delete | Full UI Dockerfile — replaced by `image-headless/` |

---

### Task 1: Consolidate repo — remove full UI, rename chart

**Files:**
- Delete: `app/` (entire directory)
- Delete: `image/` (entire directory)
- Rename: `claudecodeheadless/` → `claudecode/`

The old `claudecode/` chart is replaced by the renamed `claudecodeheadless/` chart.

- [ ] **Step 1: Remove the old full UI chart**

```bash
git rm -r claudecode/
```

- [ ] **Step 2: Remove the full UI app source and image**

```bash
git rm -r app/ image/
```

- [ ] **Step 3: Rename the headless chart to claudecode**

```bash
git mv claudecodeheadless claudecode
```

- [ ] **Step 4: Verify the rename**

```bash
ls claudecode/
```

Expected: `Chart.yaml  OlaresManifest.yaml  i18n  owners  templates  values.yaml`

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: consolidate to single Claude Code app — remove full UI, rename headless chart"
```

---

### Task 2: Update chart identity — appid, title, image name

**Files:**
- Modify: `claudecode/OlaresManifest.yaml`
- Modify: `claudecode/values.yaml`
- Modify: `claudecode/Chart.yaml`
- Modify: `claudecode/owners`
- Modify: `claudecode/i18n/en-US/OlaresManifest.yaml`
- Modify: `claudecode/i18n/zh-CN/OlaresManifest.yaml`

- [ ] **Step 1: Update OlaresManifest.yaml**

Replace the entire content of `claudecode/OlaresManifest.yaml`:

```yaml
olaresManifest.version: '0.11.0'
olaresManifest.type: app
metadata:
  name: claudecode
  icon: https://app.cdn.olares.com/appstore/codeserver/icon.png
  description: Claude Code terminal for Olares. Claude starts on launch and manages its own auth.
  appid: claudecode
  title: Claude Code
  version: '0.2.0'
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
  versionName: '0.2.0'
  fullDescription: |
    Claude Code running directly in a web terminal on your Olares device.

    Claude starts on launch and handles its own authentication interactively —
    exactly as it would in a local terminal. No file tree, no settings panel,
    no pre-configured credentials required.

    Optional: set ANTHROPIC_API_KEY in Studio's Environment Variables configuration
    to skip the interactive login flow entirely. Without it, Claude will prompt you
    to authenticate on first launch; credentials are saved and not required again.

    Features:
    - Instant Claude Code terminal on open — no extra clicks
    - Claude-managed authentication (Anthropic account or API key, your choice)
    - Optional ANTHROPIC_API_KEY for zero-prompt startup
    - Persistent home directory: auth and session history survive restarts
  upgradeDescription: |
    Rebuilt terminal layer: replaced ttyd with node-pty + xterm.js for correct
    TUI rendering and working interactive auth flow.
  developer: trevestforvor
  website: https://claude.ai/code
  sourceCode: https://docs.anthropic.com/en/docs/claude-code
  submitter: trevestforvor
  locale:
  - en-US
  - zh-CN
  doc: https://docs.anthropic.com/en/docs/claude-code
  license:
  - text: Proprietary
    url: https://www.anthropic.com/legal/commercial-terms
  requiredMemory: 256Mi
  limitedMemory: 4Gi
  requiredDisk: 128Mi
  limitedDisk: 4Gi
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
```

- [ ] **Step 2: Update values.yaml**

Replace the entire content of `claudecode/values.yaml`:

```yaml
image:
  repository: ghcr.io/trevestforvor/claudecode-olares
  tag: stable
  pullPolicy: IfNotPresent

resources:
  requests:
    cpu: 250m
    memory: 256Mi
  limits:
    cpu: '2'
    memory: 4Gi
```

- [ ] **Step 3: Update Chart.yaml**

Replace the entire content of `claudecode/Chart.yaml`:

```yaml
apiVersion: v2
name: claudecode
description: Claude Code terminal for Olares
type: application
version: 0.2.0
appVersion: '0.2.0'
```

- [ ] **Step 4: Update owners**

`claudecode/owners` should contain only:
```
trevestforvor
```

(Likely unchanged, but verify it doesn't still say `claudecodeheadless`.)

- [ ] **Step 5: Update i18n files**

`claudecode/i18n/en-US/OlaresManifest.yaml`:
```yaml
metadata:
  title: Claude Code
  description: Claude Code terminal for Olares
```

`claudecode/i18n/zh-CN/OlaresManifest.yaml`:
```yaml
metadata:
  title: Claude Code
  description: 在 Olares 上运行的 Claude Code 终端
```

- [ ] **Step 6: Commit**

```bash
git add claudecode/
git commit -m "chore(claudecode): update appid, title, image name — drop headless branding"
```

---

### Task 3: Update deployment.yaml — rename service, add env vars

**Files:**
- Modify: `claudecode/templates/deployment.yaml`

Replace the entire content with the updated version — renaming all `claudecodeheadless` references to `claudecode` and adding the three new env vars:

- [ ] **Step 1: Rewrite deployment.yaml**

```yaml
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
              mkdir -p /home/claude/.claude
              chown -R 1001:1001 /home/claude
          securityContext:
            runAsUser: 0
          volumeMounts:
            - name: app-home
              mountPath: /home/claude
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
            - name: COLORTERM
              value: truecolor
            - name: LANG
              value: en_US.UTF-8
            - name: CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
              value: "1"
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

- [ ] **Step 2: Commit**

```bash
git add claudecode/templates/deployment.yaml
git commit -m "feat(claudecode): rename deployment/service, add COLORTERM/LANG/DISABLE_NONESSENTIAL env vars"
```

---

### Task 4: package.json

**Files:**
- Create: `image-headless/package.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "claudecode-server",
  "version": "1.0.0",
  "type": "commonjs",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "node-pty": "^1.1.0",
    "ws": "^8.18.0"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add image-headless/package.json
git commit -m "feat(headless): add package.json for node-pty + ws server"
```

---

### Task 5: server.js — PTY WebSocket server

**Files:**
- Create: `image-headless/server.js`

- [ ] **Step 1: Create server.js**

```javascript
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
```

- [ ] **Step 2: Syntax-check**

```bash
node --check image-headless/server.js
```

Expected: no output, exit code 0. (`--check` only parses — missing deps are fine.)

- [ ] **Step 3: Commit**

```bash
git add image-headless/server.js
git commit -m "feat(headless): PTY WebSocket server — node-pty + ws"
```

---

### Task 6: index.html — full-screen xterm.js frontend

**Files:**
- Create: `image-headless/index.html`

- [ ] **Step 1: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Code</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5/css/xterm.css"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    #terminal { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="terminal"></div>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5/lib/xterm.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10/lib/addon-fit.js"></script>
  <script>
    const term = new Terminal({
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true,
      theme: { background: '#000000' },
    });
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById('terminal'));
    fitAddon.fit();

    let ws = null;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 3000;

    function connect() {
      ws = new WebSocket(`ws://${location.host}`);

      ws.onopen = () => {
        retryCount = 0;
        // Send terminal dimensions before anything else so the PTY spawns at the right size
        ws.send(JSON.stringify({ type: 'init', cols: term.cols, rows: term.rows }));
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'output') {
          term.write(msg.data);
        }
        // 'exit' is informational — onclose handles the actual reconnect
      };

      ws.onclose = () => {
        if (retryCount >= MAX_RETRIES) {
          term.write('\r\n\x1b[31m[Could not reconnect. Refresh the page to try again.]\x1b[0m');
          return;
        }
        retryCount++;
        term.write(
          `\r\n\x1b[33m[Session ended \u2014 reconnecting in 3s\u2026 (${retryCount}/${MAX_RETRIES})]\x1b[0m`
        );
        setTimeout(connect, RETRY_DELAY);
      };
    }

    // Keyboard input → PTY
    term.onData((data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Terminal resize (from fitAddon) → PTY resize (TIOCSWINSZ)
    term.onResize(({ cols, rows }) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
      fitAddon.fit();
    });

    // Browser window resize → re-fit terminal → triggers term.onResize above
    window.addEventListener('resize', () => fitAddon.fit());

    connect();
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add image-headless/index.html
git commit -m "feat(headless): full-screen xterm.js frontend"
```

---

### Task 7: Dockerfile — multi-stage build replacing ttyd

**Files:**
- Modify: `image-headless/Dockerfile`

The Docker build context is `.` (project root), set in the workflow via `context: .`. All COPY paths must be relative to the project root.

- [ ] **Step 1: Rewrite Dockerfile**

Replace the entire content of `image-headless/Dockerfile`:

```dockerfile
# image-headless/Dockerfile
# Build context: project root (.)
# Multi-stage: Stage 1 compiles node-pty native addon; Stage 2 is the lean runtime.

# ── Stage 1: compile node-pty native addon ────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app
# Copy package files from image-headless/ (build context is project root)
COPY image-headless/package*.json ./
# python3 make g++ compile node-pty's C++ addon.
# These build tools are NOT carried into the runtime stage.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN npm ci

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash curl ca-certificates git dumb-init \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

# Install Claude Code globally — binary at /usr/local/bin/claude, on PATH for all users
RUN npm install -g @anthropic-ai/claude-code

RUN useradd -m -u 1001 -s /bin/bash claude

# Copy compiled node_modules and server source from their locations under project root
WORKDIR /app
COPY --from=builder /app/node_modules /app/node_modules
COPY image-headless/server.js image-headless/index.html /app/

USER claude
WORKDIR /home/claude
EXPOSE 3000

# dumb-init as PID 1: correctly reaps zombie processes from Claude Code's subprocesses
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "/app/server.js"]
```

- [ ] **Step 2: Commit**

```bash
git add image-headless/Dockerfile
git commit -m "feat(headless): multi-stage Dockerfile — node-pty server replaces ttyd"
```

---

### Task 8: Update GitHub Actions workflow — single job

**Files:**
- Modify: `.github/workflows/docker-publish.yml`

Replace the entire workflow with a single job that builds `image-headless/Dockerfile` and pushes to `claudecode-olares` (the original image name, now the only one):

- [ ] **Step 1: Rewrite workflow**

```yaml
name: Build and Push Docker Image

on:
  push:
    branches:
      - main
    tags:
      - 'v*'

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Get short SHA
        id: sha
        run: echo "short=${GITHUB_SHA::7}" >> $GITHUB_OUTPUT

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: image-headless/Dockerfile
          platforms: linux/amd64,linux/arm64
          push: true
          tags: |
            ghcr.io/trevestforvor/claudecode-olares:stable
            ghcr.io/trevestforvor/claudecode-olares:${{ steps.sha.outputs.short }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Print image tag
        run: echo "Image tag => ${{ steps.sha.outputs.short }}"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/docker-publish.yml
git commit -m "chore: simplify workflow to single job — headless image → claudecode-olares"
```

---

### Task 9: Push and verify CI

- [ ] **Step 1: Push to main**

```bash
git push origin main
```

- [ ] **Step 2: Check GitHub Actions**

Go to `https://github.com/trevestforvor/OlaresCCApp/actions`. Confirm the single `build-and-push` job succeeds and prints the new SHA tag.

- [ ] **Step 3: Update Studio**

In Olares Studio, update the `claudecode` app's image tag to the new SHA. Restart the app.

- [ ] **Step 4: Smoke test**

Open the Claude Code app. Expected:
- Black full-screen terminal loads immediately
- Claude Code starts within a few seconds
- If no `ANTHROPIC_API_KEY` is set: Claude prints a login URL and waits
- If `ANTHROPIC_API_KEY` is set in Studio env vars: Claude starts without prompting
- Typing works, Claude responds, terminal resizes correctly when the browser window is resized
