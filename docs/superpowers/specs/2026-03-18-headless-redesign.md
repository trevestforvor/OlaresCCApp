# Headless Claude Code Terminal — Redesign

**Date:** 2026-03-18
**Scope:** `image-headless/` and `claudecodeheadless/` only. Full app untouched.

---

## Goal

Replace the broken ttyd approach with a minimal Node.js PTY server + xterm.js frontend that renders Claude Code perfectly and allows Claude to handle its own auth interactively.

---

## Why ttyd Fails

ttyd has architectural gaps that cannot be fixed with flags:

- Does not respond to ANSI terminal size queries (`\e[18t`) that Claude Code sends on startup
- Race condition drops output on first render (auth prompts disappear)
- stdin is not fully interactive before first output flush — auth flow never triggers
- Key intercept issues and SSL data corruption under load

node-pty creates a genuine PTY (`isatty()` returns true), which is what Claude Code requires for TUI mode, color output, and interactive auth. The full app (`claudecode`) already uses node-pty with the same Kubernetes `securityContext` (`allowPrivilegeEscalation: false`, `capabilities: drop: ALL`) and works correctly — confirming that Olares does not apply a seccomp profile that blocks `openpty` or `TIOCSWINSZ`.

---

## Architecture

```
Browser
  xterm.js (full-screen, zero chrome)
  WebSocket ──────────────────────────────┐
                                          ▼
                              Node.js server (server.js)
                                  ws + node-pty
                                          │
                                    PTY (real TTY)
                                          │
                                    claude process
```

---

## File Structure

| File | Status | Purpose |
|---|---|---|
| `image-headless/Dockerfile` | Modify | Multi-stage: builder compiles node-pty native addon, runtime has claude + dumb-init |
| `image-headless/package.json` | Create | `ws` + `node-pty` dependencies |
| `image-headless/server.js` | Create | ~80 line PTY WebSocket server |
| `image-headless/index.html` | Create | Full-screen xterm.js frontend, zero chrome |
| `claudecodeheadless/templates/deployment.yaml` | Modify | Add COLORTERM, LANG, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC env vars |
| `claudecodeheadless/OlaresManifest.yaml` | Modify | Add optional `ANTHROPIC_API_KEY` user-configurable setting |

`Chart.yaml`, `values.yaml`, and `i18n/` are unchanged. The existing `readinessProbe` and `livenessProbe` (`tcpSocket` on port 3000) are unchanged and valid — they pass as soon as the Node.js HTTP server binds, which is correct.

---

## Dockerfile

Two stages. The binary location is `/usr/local/bin/claude` (global npm install as root — readable by all users, on PATH by default).

**Stage 1 — builder:**
```
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN npm ci
```

`python3 make g++` are the exact packages required to compile node-pty's native addon. `build-essential` is not used (it pulls unnecessary packages). These tools are only needed at build time and are not present in the runtime stage.

**Stage 2 — runtime:**
```
FROM ubuntu:24.04
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash curl ca-certificates git dumb-init \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code
# claude binary lands at /usr/local/bin/claude — on PATH for all users

RUN useradd -m -u 1001 -s /bin/bash claude

WORKDIR /app
COPY --from=builder /app/node_modules /app/node_modules
COPY server.js index.html /app/

USER claude
WORKDIR /home/claude
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "/app/server.js"]
```

`dumb-init` as PID 1 correctly reaps zombie processes from Claude Code's subprocesses. Node.js does not do this by default.

---

## Server (`server.js`)

~80 lines. Key behaviours:

1. Serves `index.html` over HTTP on port 3000
2. WebSocket server on the same port
3. On new connection: waits for first message `{ type: 'init', cols, rows }` before spawning PTY — guarantees correct terminal dimensions at spawn time, not hardcoded defaults
4. Spawns: `pty.spawn('claude', [], { name: 'xterm-256color', cols, rows, cwd: '/home/claude', env, handleFlowControl: true })`
5. PTY output → `{ type: 'output', data }` WebSocket message
6. WebSocket `{ type: 'input', data }` → PTY write
7. WebSocket `{ type: 'resize', cols, rows }` → `ptyProcess.resize()` (sends `TIOCSWINSZ` ioctl)
8. On PTY exit: sends `{ type: 'exit' }`, closes WebSocket
9. On WebSocket close: kills PTY

**Note on `handleFlowControl: true`:** This enables XON/XOFF flow control in node-pty, which improves stability for Claude's streaming output. The trade-off is that Ctrl+S (XOFF) and Ctrl+Q (XON) keystrokes are consumed by the PTY layer and not forwarded to Claude. Claude Code does not use these keys in its normal interface, so this is acceptable.

**Environment passed to PTY:**

| Variable | Value | Reason |
|---|---|---|
| `TERM` | `xterm-256color` | Claude Code checks this for TUI mode |
| `COLORTERM` | `truecolor` | Enables 24-bit color in Claude's output |
| `LANG` | `en_US.UTF-8` | Prevents Unicode rendering issues |
| `HOME` | `/home/claude` | Persistent volume mount point |
| `SHELL` | `/bin/bash` | Explicit shell for Claude subprocesses |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | `1` | Disables autoupdater + telemetry + error reporting |
| `ANTHROPIC_API_KEY` | `process.env.ANTHROPIC_API_KEY \|\| ''` | Optional: if set, Claude skips OAuth flow entirely |

---

## Frontend (`index.html`)

Single HTML file. No build step, no framework.

- `@xterm/xterm@5` + `@xterm/addon-fit@0.10` loaded from CDN
- Terminal fills 100vw × 100vh, `#000000` background, no margin, no scrollbar, no chrome
- On load: connect WebSocket, `fitAddon.fit()`, send `{ type: 'init', cols: term.cols, rows: term.rows }`
- `term.onData` → `{ type: 'input', data }`
- `term.onResize` → `{ type: 'resize', cols, rows }`
- `window.addEventListener('resize')` → `fitAddon.fit()`
- On `{ type: 'exit' }`: print `\r\n[Session ended — reconnecting in 3s…]` to the terminal, attempt reconnect after 3 seconds. Retry up to 5 times with 3-second intervals; after 5 failures, print `[Could not reconnect. Refresh the page to try again.]` and stop.

---

## Auth

Claude Code checks `ANTHROPIC_API_KEY` first. If set, it uses it directly — no prompts, instant startup.

If absent, Claude runs its interactive OAuth flow through the PTY: prints a URL, waits for the user to visit it in a browser, then confirms. This is fully text-based and works correctly with node-pty (`isatty()` returns true).

**Kubernetes injection:** `ANTHROPIC_API_KEY` is not hardcoded in `deployment.yaml`. It is declared as an optional user-configurable setting in `OlaresManifest.yaml`. When a user sets it in Olares Studio, Olares injects it as a plain `env` entry in the pod spec at deploy time. Users who do not set it get the interactive auth flow on first launch; credentials are saved to the persistent home volume (`/home/claude/.claude.json`) and are not needed again.

---

## `deployment.yaml` — Env Section Changes

The current deployment.yaml has three env vars (HOME, SHELL, TERM). This redesign **adds** three new vars and changes nothing else:

```yaml
env:
  - name: HOME
    value: /home/claude
  - name: SHELL
    value: /bin/bash
  - name: TERM
    value: xterm-256color
  # Added:
  - name: COLORTERM
    value: truecolor
  - name: LANG
    value: en_US.UTF-8
  - name: CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    value: "1"
```

No env vars are removed. The existing `securityContext`, probes, volume mounts, and resource limits are unchanged.

---

## Out of Scope

- Full app (`claudecode/`, `app/`) — untouched
- xterm.js theme customisation (pure black is intentional)
- Session persistence across page reloads
- Multiple concurrent browser connections to the same PTY
