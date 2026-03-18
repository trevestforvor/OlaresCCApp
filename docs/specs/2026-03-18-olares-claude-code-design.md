# Olares Claude Code Web UI — Design Spec

**Date:** 2026-03-18
**Status:** Approved

---

## Overview

A custom web UI application for the Olares marketplace that runs Claude Code on an Olares device and exposes it as a browser-accessible developer environment. The primary use case is remote development of Olares marketplace apps from a separate machine.

---

## Architecture

### Single Container

One Docker image containing:
- **Node.js backend** (Express + node-pty + WebSocket) — spawns and manages Claude Code processes
- **React frontend** (Vite build, served statically by the backend) — browser UI
- **Claude Code** (installed via `https://claude.ai/install.sh`) — the AI coding assistant

No second terminal sidecar container. node-pty spawns `claude` as a direct subprocess within the same container, eliminating the need for Kubernetes RBAC or `kubectl exec`.

```
Browser
  │
  │  (Olares auth proxy)
  ▼
Node.js Backend (port 3000)
  ├── Serves React frontend (static)
  ├── REST API (/api/*)
  └── WebSocket (/ws/terminal/:sessionId)
        │
        └── node-pty → claude process (cwd = selected project dir)
```

### Volumes (three persistent Olares mounts)

| Mount path | Olares type | Purpose |
|---|---|---|
| `/home/claude` | `appData` | Full home dir: `~/.claude` sessions, `~/.local/bin` plugins, npm cache |
| `/config` | `appData` | `settings.json` (API keys, theme, provider config) |
| `/workspace` | `userData` | User's code projects (`Home`) |

Mounting the full `/home/claude` ensures that any Claude Code plugins (e.g. MCP servers, npm-installed tools) installed through the terminal persist across container restarts.

---

## UI Layout

### Top Bar (full width, customizable background color)

```
[Logo / App Title]   [Provider ▼]   [Model ▼]   [Sessions ▼]   [⚙ Settings]
```

- **Provider dropdown:** `Anthropic` | `3rd Party (OpenAI-compatible)`
  - Anthropic → model dropdown populated from hardcoded Claude model list (Opus 4.6, Sonnet 4.6, Haiku 4.5, etc.)
  - 3rd Party → attempts `GET /v1/models` on configured base URL; falls back to free-text input if unavailable
- **Model dropdown:** sets `--model <name>` flag when spawning or respawning a session. Complements the in-terminal `/model` command.
- **Sessions dropdown:** populated via `claude --list --all`; select to resume with `--resume <id>`; option to create new session
- **Settings icon:** opens settings panel (slide-out or modal)

### Main Layout

```
┌──────────────────┬─────────────────────────────────┐
│  File Tree       │  xterm.js Terminal               │
│                  │                                  │
│  /workspace      │  Claude Code session             │
│  ├─ myapp/       │                                  │
│  └─ other/       │                                  │
│                  │                                  │
│  [Open Here]     │                                  │
└──────────────────┴─────────────────────────────────┘
```

- File tree browses `/workspace` volume
- "Open Here" button on any folder launches a new Claude Code session with that folder as `cwd`
- Resizable split pane (drag divider)
- Terminal is xterm.js, connected via WebSocket to node-pty

### Settings Panel

- Header color picker (hex/palette; saved to `settings.json`)
- Custom logo upload or text title
- Environment variable fields (see Provider Config section)
- Changes applied to new Claude Code spawns; existing sessions unaffected until respawned

---

## Provider Configuration

Configured in Settings panel, persisted to `/config/settings.json`, injected into Claude Code child process environment at spawn time. Never stored in the container image.

### Anthropic

| Field | Env var | Required |
|---|---|---|
| API Key | `ANTHROPIC_API_KEY` | Yes |

### 3rd Party (OpenAI-compatible)

| Field | Env var | Required |
|---|---|---|
| Base URL | `ANTHROPIC_BASE_URL` | Yes |
| API Key | `ANTHROPIC_API_KEY` | Yes |
| Auth Token | `ANTHROPIC_AUTH_TOKEN` | No |

### Model Overrides (both providers)

| Field | Env var |
|---|---|
| Default model | `ANTHROPIC_MODEL` |
| Opus override | `ANTHROPIC_DEFAULT_OPUS_MODEL` |
| Sonnet override | `ANTHROPIC_DEFAULT_SONNET_MODEL` |
| Haiku override | `ANTHROPIC_DEFAULT_HAIKU_MODEL` |

Model overrides are optional. If a single model name is provided for 3rd-party setups, it is mapped to all three tier overrides (matching the pattern in the existing working configmap).

---

## Backend API

### WebSocket

| Endpoint | Purpose |
|---|---|
| `WS /ws/terminal/:sessionId` | Bidirectional PTY stream. On connect, spawns `claude [--resume <id>] [--model <name>]` with correct `cwd` and env vars injected. On disconnect, PTY process stays alive. |

### REST

| Endpoint | Purpose |
|---|---|
| `GET /api/sessions` | Runs `claude --list --all`, returns parsed session list |
| `DELETE /api/sessions/:id` | Kills PTY process if running |
| `GET /api/files?path=` | Directory listing from `/workspace` |
| `GET /api/settings` | Returns `settings.json` (API key values redacted) |
| `PUT /api/settings` | Saves env vars and theme to `settings.json` |
| `GET /api/models?baseUrl=` | Attempts `GET /v1/models` on 3rd-party base URL; returns list or error |

---

## Session Management

- Sessions are stored in `~/.claude/sessions/` (under the persistent `/home/claude` volume)
- `claude --list --all` populates the Sessions dropdown across all projects
- Resuming a session: `claude --resume <sessionId>` with the appropriate `cwd` and env
- New session: `claude` with `cwd` set to the selected directory from the file tree
- PTY processes stay alive on browser disconnect; re-connecting to the same session ID re-attaches
- Session kill: terminates the PTY process; session history remains in `~/.claude/sessions/`

---

## Plugin Support

The Docker image ships with no pre-installed plugins. Claude Code plugins (MCP servers, npm-installed tools, etc.) are installed by the user through the terminal, exactly as on any machine. All plugin state persists because `/home/claude` is a persistent `appData` volume covering `~/.claude/`, `~/.local/bin/`, `~/.npm/`, and the rest of the home directory.

---

## Olares Packaging

### Naming (linter rules)

- **appid:** `claudecode` — lowercase, no hyphens
- This value is used verbatim as: folder name, `Chart.yaml` name, `metadata.name`, `metadata.appid`, Deployment name, Service name, and entrance `host`. All must match.

### Directory Structure

```
OlaresCCApp/
├── image/
│   └── Dockerfile
├── app/
│   ├── backend/              # Node.js + Express + node-pty
│   └── frontend/             # React + xterm.js (Vite)
├── claudecode/               # Olares Application Chart
│   ├── Chart.yaml
│   ├── OlaresManifest.yaml
│   ├── values.yaml
│   ├── owners
│   ├── i18n/
│   │   ├── en-US/OlaresManifest.yaml
│   │   └── zh-CN/OlaresManifest.yaml
│   └── templates/
│       ├── deployment.yaml   # Deployment + Service
│       └── configmap.yaml    # Startup scripts
└── docs/
    └── specs/
```

### Key OlaresManifest.yaml Fields

- `olaresManifest.version: '0.11.0'`
- `entrances[0].host: claudecode` (matches Service name)
- `entrances[0].port: 3000`
- `permission.appData: true`
- `permission.userData: [Home]`
- `requiredMemory: 1Gi`, container request: `512Mi` (satisfies linter: 512Mi < 1Gi)
- `supportArch: [amd64, arm64]`
- `options.dependencies: [{name: olares, version: '>=1.12.3-0', type: system}]`
- `envs`: ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, DEFAULT_MODEL (all editable, applyOnChange)

### Volume Paths

Follow the `sysVersion` semver guard pattern from affine for `>=1.12.3-0`:
```yaml
hostPath:
  {{- if semverCompare ">=1.12.3-0" (toString .Values.sysVersion) }}
  path: '{{ .Values.userspace.appData }}'
  {{- else }}
  path: '{{ .Values.userspace.appData }}/claudecode'
  {{- end }}
```

### Linter Rules Summary

1. appid = folder = chart name = deployment name = service name = entrance host (all identical)
2. `sum(container memory requests)` < `requiredMemory`
3. Required: `i18n/en-US/OlaresManifest.yaml` + `i18n/zh-CN/OlaresManifest.yaml`
4. Startup scripts in ConfigMap, mounted into pod (no loose `.sh` files in chart)
5. `{{ .Values.userspace.appData }}` and `{{ .Values.userspace.userData }}` for volume paths
6. `{{ .Values.olaresEnv.VAR_NAME }}` for env vars declared in OlaresManifest `envs` section

### Marketplace Submission

1. Build and push image to a public registry (e.g. `docker.io/<handle>/claudecode-olares:stable`)
2. Update `claudecode/values.yaml` with the published image reference
3. Test on Olares device via Olares Studio
4. Fork `beclab/apps`, add the `claudecode/` folder
5. Open Draft PR: `[New][claudecode][0.1.0] Claude Code Web UI`

---

## Dockerfile Outline

```dockerfile
FROM ubuntu:24.04
# Install: bash, curl, git, jq, nodejs (v20+), npm, tini, ripgrep
# Install Claude Code via install.sh
# Copy built React frontend to /app/public
# Copy Node.js backend to /app
# npm install (backend deps: express, ws, node-pty, etc.)
# USER claude (uid 1000)
# EXPOSE 3000
# ENTRYPOINT ["/usr/bin/tini", "--"]
# CMD ["node", "/app/backend/server.js"]
```

---

## Error Handling

- **Missing API key:** backend returns 400 on session spawn; frontend shows inline error in the terminal panel prompting user to open Settings
- **3rd-party `/v1/models` unavailable:** model dropdown falls back to free-text input; no error surfaced to user
- **PTY process crash:** WebSocket receives close event; frontend shows "Session ended" message with a "Restart" button
- **Settings save failure:** REST PUT returns error; frontend shows toast notification

---

## Testing

- Integration test: full WebSocket PTY round-trip with a real `claude --version` invocation
- Olares install test: deploy chart to local Olares device via Studio before marketplace submission
