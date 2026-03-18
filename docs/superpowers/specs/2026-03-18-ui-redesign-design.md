# UI Redesign: Deep Space Theme + Session Tabs

**Date:** 2026-03-18
**Scope:** Frontend only — TopBar, session management, SettingsPanel, global CSS tokens. Backend unchanged.

---

## Goals

1. Replace unreadable native `<select>` dropdowns with styled custom components.
2. Apply a cohesive "Deep Space" visual identity across the UI.
3. Replace the sessions dropdown with a persistent tab bar — one tab per live session.
4. Auto-resume the most recent session on app load; always start new tabs from `/Home`.

---

## Visual Language

| Token | Value |
|---|---|
| Background | `#0a0a14` |
| Surface (topbar) | `linear-gradient(90deg, #1a0a2e, #120a22)` |
| Surface (filetree) | `#0d0d1c` |
| Surface (terminal) | `#080812` |
| Surface (dropdown) | `#1a1030` |
| Accent primary | `#a78bfa` |
| Accent muted | `#7c5cbf` |
| Accent hover bg | `rgba(138,100,255,0.12)` |
| Border | `rgba(138,100,255,0.25)` |
| Text primary | `#e2d9ff` |
| Text secondary | `#c4b5fd` |
| Text muted | `#6d5aa0` |
| Live dot | `#7eca9c` |
| Idle dot | `#6d5aa0` |

These tokens replace all ad-hoc color values and are defined as CSS custom properties in `App.css`.

---

## Components

### 1. `Dropdown` (new shared component)

Replaces all three native `<select>` elements (provider, model, file-tree "Open Here" is unaffected).

**Props:** `value`, `options: [{value, label}]`, `onChange`, `placeholder`, `prefix` (optional node — e.g. live dot)

**Behaviour:**
- Clicking the trigger opens a positioned panel; clicking outside or selecting closes it.
- Selected item shows a `✓` checkmark.
- Panel renders above or below depending on available space.
- Keyboard: `Escape` closes, `Enter`/`Space` selects focused item, arrow keys navigate.

**Styling:** trigger uses `tb-btn` style (purple-tinted pill); panel uses `#1a1030` background with `rgba(138,100,255,0.35)` border, 8px border-radius, `0 8px 32px rgba(0,0,0,0.7)` shadow.

---

### 2. `TopBar` (modified)

Removes the sessions `<select>`. Keeps provider and model selectors, now using `Dropdown`. Settings button reskinned to purple-tinted pill icon button.

Layout: `[CLAUDE CODE] [divider] [Provider ▾] [Model ▾] [spacer] [⚙]`

---

### 3. `TabBar` (new component)

Sits between `TopBar` and the main split pane. Height: 34px. Background: `#0d0a1c`. Bottom border: `1px solid rgba(138,100,255,0.15)`.

**Each tab shows:**
- Live dot (green `#7eca9c` if PTY active, dim `#6d5aa0` if idle/ended)
- Label: basename of the session's `cwd` (e.g. `Home`, `OlaresCCApp`)
- `×` close button (visible on hover; kills PTY and removes tab)

**Active tab:** `#080812` background, purple border on left/top/right, bottom border removed (merges with terminal).

**`+` button:** always opens a new tab with `cwd=/Home`, immediately spawns Claude.

---

### 4. `App` (modified)

State changes:
- Remove `activeSession` (single). Replace with `tabs: [{id, cwd, sessionId}]` array and `activeTabIndex`.
- Remove `sessions` dropdown plumbing from `TopBar` props.
- Add `TabBar` between `TopBar` and `Allotment`.

**On mount:**
1. Fetch `/api/sessions`.
2. If sessions exist → set `tabs` to `[{ sessionId: sessions[0].id, cwd: sessions[0].projectPath, label: basename(sessions[0].projectPath) }]`, `activeTabIndex: 0`.
3. If no sessions → set `tabs` to `[{ sessionId: 'new', cwd: '/Home' }]`.

**Terminal rendering:** Render one `Terminal` per tab, hide inactive ones with `display:none` (keeps PTY alive). Do not unmount.

---

### 5. `Terminal` (minor change)

No xterm.js styling changes — Claude's own TUI renders inside unmodified. Only change: accept `hidden` prop and apply `display:none` when not the active tab.

---

### 6. `SettingsPanel` (reskin)

Overlay backdrop: `rgba(0,0,0,0.65)`. Panel: `#1a1030` background, `rgba(138,100,255,0.2)` border, 10px radius. Inputs: `rgba(138,100,255,0.08)` background, `rgba(138,100,255,0.2)` border. Buttons: primary `#6d3fc8`, secondary transparent with purple border.

---

### 7. `App.css` (updated)

Define CSS custom properties at `:root`. Update `.sash` to `rgba(138,100,255,0.15)`. Remove any remaining hardcoded colors from global styles.

---

## Session Tab Lifecycle

```
App mounts
  → fetch /api/sessions
  → sessions exist?  yes → open tab resuming sessions[0]
                     no  → open tab with new session at /Home

User clicks +
  → append tab: { sessionId: 'new', cwd: '/Home' }
  → set activeTabIndex to new tab

User clicks × on tab
  → kill PTY for that tab's sessionId
  → remove tab from array
  → if it was active, activate previous tab (or next if first)

User clicks inactive tab
  → set activeTabIndex
  → Terminal for that tab becomes visible (PTY was kept alive)
```

---

## Out of Scope

- FileTree component styling (minor, follow-on)
- Backend changes
- xterm.js theme changes
- Persisting tab state across page reloads
