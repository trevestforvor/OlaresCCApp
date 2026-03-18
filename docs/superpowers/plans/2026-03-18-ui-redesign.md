# UI Redesign: Deep Space Theme + Session Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Claude Code web UI with a Deep Space purple theme, custom dropdown components, and a session tab bar that replaces the sessions dropdown.

**Architecture:** New shared `Dropdown` and `TabBar` components are added; `App` state is refactored from a single `activeSession` to a `tabs` array with an `activeTabIndex`; `TopBar` and `SettingsPanel` are reskinned; CSS tokens are centralised in `App.css`. Backend is untouched.

**Tech Stack:** React 18, existing Vite/xterm.js stack. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-03-18-ui-redesign-design.md`

---

## File Map

```
app/frontend/src/
├── App.css                          MODIFY — add CSS custom properties, update body/sash colours
├── App.jsx                          MODIFY — replace single-session state with tabs array
├── components/
│   ├── Dropdown.jsx                 CREATE — shared custom dropdown replacing all <select>s
│   ├── TabBar.jsx                   CREATE — session tab bar with +/× controls
│   ├── TopBar.jsx                   MODIFY — use Dropdown, remove sessions/headerColor props
│   ├── Terminal.jsx                 MODIFY — accept hidden prop, fix bg colour, call fit on show
│   └── SettingsPanel.jsx            MODIFY — Deep Space reskin, remove headerColor field
```

---

## Task 1: CSS Tokens

**Files:**
- Modify: `app/frontend/src/App.css`

- [ ] **Step 1: Replace App.css contents**

```css
/* app/frontend/src/App.css */
:root {
  --bg:               #0a0a14;
  --surface-topbar:   linear-gradient(90deg, #1a0a2e, #120a22);
  --surface-filetree: #0d0d1c;
  --surface-terminal: #080812;
  --surface-tabbar:   #0d0a1c;
  --surface-dropdown: #1a1030;
  --accent:           #a78bfa;
  --accent-muted:     #7c5cbf;
  --accent-hover:     rgba(138,100,255,0.12);
  --border:           rgba(138,100,255,0.25);
  --text-primary:     #e2d9ff;
  --text-secondary:   #c4b5fd;
  --text-muted:       #6d5aa0;
  --dot-live:         #7eca9c;
  --dot-idle:         #6d5aa0;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, #root { height: 100%; width: 100%; overflow: hidden; }

body {
  font-family: 'Segoe UI', system-ui, sans-serif;
  background: var(--bg);
  color: var(--text-primary);
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

.sash { background: rgba(138,100,255,0.15); }
```

- [ ] **Step 2: Commit**

```bash
git add app/frontend/src/App.css
git commit -m "feat: CSS custom property tokens for Deep Space theme"
```

---

## Task 2: Dropdown Component

**Files:**
- Create: `app/frontend/src/components/Dropdown.jsx`

- [ ] **Step 1: Create Dropdown.jsx**

```jsx
// app/frontend/src/components/Dropdown.jsx
import { useState, useEffect, useRef } from 'react'

export default function Dropdown({ value, options, onChange, placeholder, prefix }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = options.find(o => o.value === value)
  const label = selected ? selected.label : (placeholder || '—')

  function handleKey(e) {
    if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('[data-trigger]')?.focus() }
  }

  function handleItemKey(e, opt) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(opt.value); setOpen(false) }
    if (e.key === 'ArrowDown') { e.preventDefault(); e.currentTarget.nextElementSibling?.focus() }
    if (e.key === 'ArrowUp')   { e.preventDefault(); e.currentTarget.previousElementSibling?.focus() }
    if (e.key === 'Tab')       { setOpen(false) }
    if (e.key === 'Escape')    { setOpen(false); ref.current?.querySelector('[data-trigger]')?.focus() }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }} onKeyDown={handleKey}>
      <button
        data-trigger
        onClick={() => setOpen(o => !o)}
        style={triggerStyle}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {prefix && <span style={{ marginRight: 4 }}>{prefix}</span>}
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ color: 'var(--accent-muted)', fontSize: 9, marginLeft: 5 }}>
          {open ? '▲' : '▾'}
        </span>
      </button>

      {open && (
        <div style={panelStyle} role="listbox">
          {options.map(opt => (
            <div
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              tabIndex={0}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              onKeyDown={e => handleItemKey(e, opt)}
              style={{
                ...itemStyle,
                background: opt.value === value ? 'var(--accent-hover)' : 'transparent',
                color: opt.value === value ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              <span style={{ width: 14, color: 'var(--accent)', fontSize: 11 }}>
                {opt.value === value ? '✓' : ''}
              </span>
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const triggerStyle = {
  display: 'flex', alignItems: 'center',
  background: 'rgba(138,100,255,0.1)',
  border: '1px solid rgba(138,100,255,0.28)',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 12,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const panelStyle = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0,
  background: 'var(--surface-dropdown)',
  border: '1px solid rgba(138,100,255,0.35)',
  borderRadius: 8,
  boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
  zIndex: 200,
  minWidth: '100%',
  overflow: 'hidden',
}

const itemStyle = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 12px',
  fontSize: 12,
  cursor: 'pointer',
}
```

- [ ] **Step 2: Commit**

```bash
git add app/frontend/src/components/Dropdown.jsx
git commit -m "feat: Dropdown component — custom styled replacement for native select"
```

---

## Task 3: Restyle TopBar

**Files:**
- Modify: `app/frontend/src/components/TopBar.jsx`

- [ ] **Step 1: Rewrite TopBar.jsx**

```jsx
// app/frontend/src/components/TopBar.jsx
import { useState, useEffect } from 'react'
import Dropdown from './Dropdown'

const ANTHROPIC_MODELS = [
  { value: 'claude-opus-4-6',           label: 'claude-opus-4-6' },
  { value: 'claude-sonnet-4-6',         label: 'claude-sonnet-4-6' },
  { value: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5' },
]

const PROVIDER_OPTIONS = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: '3rdparty',  label: '3rd Party' },
]

export default function TopBar({ model, onModelChange, onSettingsOpen, settings }) {
  const [provider, setProvider] = useState('anthropic')
  const [thirdPartyModels, setThirdPartyModels] = useState([])
  const [modelInput, setModelInput] = useState(model || '')
  const [modelsFailed, setModelsFailed] = useState(false)

  useEffect(() => {
    if (provider === '3rdparty' && settings?.ANTHROPIC_BASE_URL) {
      fetch(`/api/models?baseUrl=${encodeURIComponent(settings.ANTHROPIC_BASE_URL)}`)
        .then(r => r.json())
        .then(d => {
          if (d.models?.length) { setThirdPartyModels(d.models.map(m => ({ value: m, label: m }))); setModelsFailed(false) }
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

  const providerPrefix = (
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
  )

  return (
    <div style={{
      height: 46,
      background: 'var(--surface-topbar)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 14px',
      gap: 8,
      borderBottom: '1px solid rgba(138,100,255,0.15)',
      flexShrink: 0,
    }}>
      <span style={{ fontWeight: 800, fontSize: 12, letterSpacing: '2.5px', color: 'var(--accent)', marginRight: 4, textTransform: 'uppercase' }}>
        Claude Code
      </span>
      <div style={{ width: 1, height: 18, background: 'rgba(138,100,255,0.2)', margin: '0 2px' }} />

      <Dropdown
        value={provider}
        options={PROVIDER_OPTIONS}
        onChange={setProvider}
        prefix={providerPrefix}
      />

      {provider === '3rdparty' && modelsFailed ? (
        <input
          value={modelInput}
          onChange={e => handleModelChange(e.target.value)}
          placeholder="model name"
          style={inputStyle}
        />
      ) : (
        <Dropdown
          value={model}
          options={modelList}
          onChange={handleModelChange}
          placeholder="— model —"
        />
      )}

      <div style={{ flex: 1 }} />

      <button onClick={onSettingsOpen} style={settingsBtnStyle} title="Settings">⚙</button>
    </div>
  )
}

const inputStyle = {
  background: 'rgba(138,100,255,0.08)',
  border: '1px solid rgba(138,100,255,0.28)',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 12,
  color: 'var(--text-secondary)',
  width: 160,
}

const settingsBtnStyle = {
  width: 30, height: 30,
  background: 'rgba(138,100,255,0.08)',
  border: '1px solid rgba(138,100,255,0.2)',
  borderRadius: 6,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--accent-muted)',
  fontSize: 15,
  cursor: 'pointer',
}
```

- [ ] **Step 2: Commit**

```bash
git add app/frontend/src/components/TopBar.jsx
git commit -m "feat: TopBar — Deep Space reskin, Dropdown components, remove sessions/headerColor"
```

---

## Task 4: TabBar Component

**Files:**
- Create: `app/frontend/src/components/TabBar.jsx`

- [ ] **Step 1: Create TabBar.jsx**

```jsx
// app/frontend/src/components/TabBar.jsx
import { useCallback } from 'react'

export default function TabBar({ tabs, activeIndex, sessions, onSelect, onClose, onNew }) {
  // Derive live status from sessions API data
  const isLive = useCallback((tab) => {
    if (!tab.sessionId || tab.sessionId === 'new') return true // newly spawned, assume live
    return sessions.some(s => s.id === tab.sessionId && s.live)
  }, [sessions])

  return (
    <div style={barStyle}>
      {tabs.map((tab, i) => {
        const active = i === activeIndex
        const live = isLive(tab)
        const label = tab.cwd ? tab.cwd.split('/').filter(Boolean).pop() || 'Home' : 'Home'

        return (
          <div
            key={tab.id}
            onClick={() => onSelect(i)}
            style={{
              ...tabStyle,
              background: active ? 'var(--surface-terminal)' : 'transparent',
              borderColor: active ? 'rgba(138,100,255,0.25)' : 'transparent',
              borderBottom: active ? '1px solid var(--surface-terminal)' : '1px solid transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: live ? 'var(--dot-live)' : 'var(--dot-idle)',
            }} />
            <span style={{ fontSize: 12 }}>{label}</span>
            {tabs.length > 1 && (
              <span
                onClick={e => { e.stopPropagation(); onClose(i) }}
                style={closeStyle}
                title="Close tab"
              >×</span>
            )}
          </div>
        )
      })}

      <button onClick={onNew} style={newBtnStyle} title="New session">+</button>
    </div>
  )
}

const barStyle = {
  height: 34,
  background: 'var(--surface-tabbar)',
  borderBottom: '1px solid rgba(138,100,255,0.15)',
  display: 'flex',
  alignItems: 'flex-end',
  padding: '0 12px',
  gap: 2,
  flexShrink: 0,
}

const tabStyle = {
  height: 28,
  padding: '0 10px',
  borderRadius: '6px 6px 0 0',
  border: '1px solid transparent',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  userSelect: 'none',
  position: 'relative',
  top: 1,
}

const closeStyle = {
  fontSize: 14,
  color: 'var(--text-muted)',
  marginLeft: 2,
  lineHeight: 1,
  padding: '0 2px',
  borderRadius: 3,
  cursor: 'pointer',
}

const newBtnStyle = {
  height: 24, width: 24,
  borderRadius: 5,
  background: 'transparent',
  border: '1px solid rgba(138,100,255,0.2)',
  color: 'var(--text-muted)',
  fontSize: 16,
  cursor: 'pointer',
  marginBottom: 3,
  marginLeft: 4,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  lineHeight: 1,
}
```

- [ ] **Step 2: Commit**

```bash
git add app/frontend/src/components/TabBar.jsx
git commit -m "feat: TabBar component — session tabs with live dot, close, and new-tab button"
```

---

## Task 5: Update Terminal (hidden prop + bg fix)

**Files:**
- Modify: `app/frontend/src/components/Terminal.jsx`

- [ ] **Step 1: Add `hidden` prop and fix container background colour**

Two changes only — do NOT touch the `new XTerm({theme: ...})` call (Claude's own TUI renders there):

```jsx
// 1. Change component signature:
export default function Terminal({ session, model, onSessionEnd, hidden }) {

// 2. Change the container div in the return — update background and add hidden branch:
return (
  <div
    ref={containerRef}
    style={{
      height: '100%',
      background: '#080812',
      padding: 4,
      ...(hidden ? {
        visibility: 'hidden',
        position: 'absolute',
        width: '100%',
        height: '100%',
      } : {}),
    }}
  />
)
```

- [ ] **Step 2: Call fit() when tab becomes visible**

Add an effect that fires when `hidden` changes from `true` to `false`:

```jsx
// Add after the existing useEffect hooks, before the return:
useEffect(() => {
  if (!hidden && fitAddonRef.current && xtermRef.current) {
    // Slight delay ensures the element is visible before measuring
    setTimeout(() => {
      fitAddonRef.current.fit()
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const { cols, rows } = xtermRef.current
        wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    }, 0)
  }
}, [hidden])
```

- [ ] **Step 3: Commit**

```bash
git add app/frontend/src/components/Terminal.jsx
git commit -m "feat: Terminal — hidden prop for tab switching, fix bg colour to #080812"
```

---

## Task 6: Refactor App.jsx

**Files:**
- Modify: `app/frontend/src/App.jsx`

- [ ] **Step 1: Rewrite App.jsx**

```jsx
// app/frontend/src/App.jsx
import { useState, useEffect, useCallback } from 'react'
import { Allotment } from 'allotment'
import TopBar from './components/TopBar'
import TabBar from './components/TabBar'
import FileTree from './components/FileTree'
import Terminal from './components/Terminal'
import SettingsPanel from './components/SettingsPanel'
import { useSettings } from './hooks/useSettings'
import { useSessions } from './hooks/useSessions'

let tabIdCounter = 0
function newTabId() { return ++tabIdCounter }

export default function App() {
  const { settings, saveSettings } = useSettings()
  const { sessions, refresh: refreshSessions } = useSessions()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [model, setModel] = useState('')
  const [tabs, setTabs] = useState([])
  const [activeTabIndex, setActiveTabIndex] = useState(0)

  // On mount: auto-resume most recent session or start fresh
  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(data => {
        if (data.length > 0) {
          const s = data[0]
          setTabs([{ id: newTabId(), sessionId: s.id, cwd: s.projectPath || '/Home' }])
        } else {
          setTabs([{ id: newTabId(), sessionId: 'new', cwd: '/Home' }])
        }
        setActiveTabIndex(0)
      })
      .catch(() => {
        setTabs([{ id: newTabId(), sessionId: 'new', cwd: '/Home' }])
        setActiveTabIndex(0)
      })
  }, [])

  const openNewTab = useCallback((cwd = '/Home') => {
    setTabs(prev => {
      const next = [...prev, { id: newTabId(), sessionId: 'new', cwd }]
      setActiveTabIndex(next.length - 1)
      return next
    })
  }, [])

  const closeTab = useCallback((index) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev // safety — TabBar also prevents this
      const tab = prev[index]
      // Kill the PTY on the server. POST /api/sessions/:id/stop already exists in sessions.js
      // (the spec mentions DELETE /api/sessions/:id but /stop is the confirmed live endpoint).
      // If sessionId is 'new' the real ID isn't registered yet — skip the API call;
      // the WebSocket close (from Terminal unmount) is sufficient.
      if (tab.sessionId && tab.sessionId !== 'new') {
        fetch(`/api/sessions/${tab.sessionId}/stop`, { method: 'POST' }).catch(() => {})
      }
      const next = prev.filter((_, i) => i !== index)
      setActiveTabIndex(i => {
        if (i >= next.length) return next.length - 1
        if (i > index) return i - 1
        return i
      })
      return next
    })
  }, [])

  function openHere(dirPath) {
    openNewTab(dirPath)
  }

  if (tabs.length === 0) return null // loading

  return (
    <div className="app">
      <TopBar
        model={model}
        onModelChange={setModel}
        onSettingsOpen={() => setSettingsOpen(true)}
        settings={settings}
      />
      <TabBar
        tabs={tabs}
        activeIndex={activeTabIndex}
        sessions={sessions}
        onSelect={setActiveTabIndex}
        onClose={closeTab}
        onNew={() => openNewTab('/Home')}
      />
      <div className="main-area">
        <Allotment defaultSizes={[250, 750]}>
          <Allotment.Pane minSize={150}>
            <FileTree onOpenHere={openHere} />
          </Allotment.Pane>
          <Allotment.Pane>
            <div style={{ position: 'relative', height: '100%' }}>
              {tabs.map((tab, i) => (
                <Terminal
                  key={tab.id}
                  session={{ id: tab.sessionId, cwd: tab.cwd }}
                  model={model}
                  onSessionEnd={refreshSessions}
                  hidden={i !== activeTabIndex}
                />
              ))}
            </div>
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

- [ ] **Step 2: Commit**

```bash
git add app/frontend/src/App.jsx
git commit -m "feat: App — tabs state, auto-resume on mount, TabBar integration, openHere appends tab"
```

---

## Task 7: Reskin SettingsPanel

**Files:**
- Modify: `app/frontend/src/components/SettingsPanel.jsx`

- [ ] **Step 1: Rewrite SettingsPanel.jsx**

```jsx
// app/frontend/src/components/SettingsPanel.jsx
import { useState } from 'react'

const FIELDS = [
  { key: 'ANTHROPIC_API_KEY',   label: 'Anthropic API Key',          type: 'password' },
  { key: 'ANTHROPIC_BASE_URL',  label: '3rd Party Base URL',          type: 'text', placeholder: 'http://ollama:11434' },
  { key: 'ANTHROPIC_AUTH_TOKEN',label: 'Auth Token',                  type: 'password' },
  { key: 'DEFAULT_MODEL',       label: 'Default Model (all tiers)',   type: 'text' },
]

export default function SettingsPanel({ settings, onSave, onClose }) {
  const [form, setForm] = useState({
    ANTHROPIC_API_KEY:    settings?.ANTHROPIC_API_KEY    || '',
    ANTHROPIC_BASE_URL:   settings?.ANTHROPIC_BASE_URL   || '',
    ANTHROPIC_AUTH_TOKEN: settings?.ANTHROPIC_AUTH_TOKEN || '',
    DEFAULT_MODEL:        settings?.DEFAULT_MODEL        || '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div style={backdropStyle}>
      <div style={panelStyle}>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: 20, fontSize: 15, fontWeight: 700 }}>Settings</h2>

        {FIELDS.map(f => (
          <div key={f.key} style={{ marginBottom: 14 }}>
            <label style={{ color: 'var(--text-muted)', fontSize: 11, display: 'block', marginBottom: 4, letterSpacing: '0.5px' }}>
              {f.label}
            </label>
            <input
              type={f.type}
              value={form[f.key] || ''}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.placeholder || ''}
              style={inputStyle}
            />
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={btnPrimary}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

const backdropStyle = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.65)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 100,
}

const panelStyle = {
  background: 'var(--surface-dropdown)',
  borderRadius: 10,
  padding: 24,
  minWidth: 400,
  border: '1px solid rgba(138,100,255,0.2)',
  boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
}

const inputStyle = {
  width: '100%',
  background: 'rgba(138,100,255,0.08)',
  color: 'var(--text-primary)',
  border: '1px solid rgba(138,100,255,0.2)',
  borderRadius: 5,
  padding: '6px 10px',
  fontSize: 13,
}

const btnPrimary = {
  background: '#6d3fc8', color: '#fff', border: 'none',
  borderRadius: 5, padding: '8px 18px', cursor: 'pointer', fontSize: 13,
}

const btnSecondary = {
  background: 'transparent',
  color: 'var(--text-muted)',
  border: '1px solid rgba(138,100,255,0.25)',
  borderRadius: 5, padding: '8px 18px', cursor: 'pointer', fontSize: 13,
}
```

- [ ] **Step 2: Commit**

```bash
git add app/frontend/src/components/SettingsPanel.jsx
git commit -m "feat: SettingsPanel — Deep Space reskin, remove headerColor field"
```

---

## Task 8: Build, Verify, Push

- [ ] **Step 1: Build frontend locally (optional smoke-test)**

```bash
cd app/frontend && npm run build
```
Expected: exits 0, `app/backend/public/` populated.

- [ ] **Step 2: Commit any remaining unstaged files, push**

```bash
git push
```

Wait for the GitHub Actions build to go green at `github.com/trevestforvor/OlaresCCApp/actions`.

- [ ] **Step 3: Reinstall in Olares Studio**

In Studio: stop the app → update image tag or force re-pull → start. Verify:
- UI loads with Deep Space theme
- Topbar shows styled Dropdown buttons (no native `<select>`)
- Tab bar appears below topbar
- Most recent session auto-resumes on load (or new session starts if none exist)
- `+` opens a new tab at `/Home`
- Closing a tab (when >1 exist) removes it
- Settings panel opens in Deep Space style with no Header Color field
