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
| Surface (tab bar) | `#0d0a1c` |
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

The active tab background and the terminal container background are both `#080812` so they merge seamlessly. The existing `Terminal.jsx` inline `background: '#0d0d14'` on the container div must be updated to `#080812` to match.

---

## Components

### 1. `Dropdown` (new shared component — `src/components/Dropdown.jsx`)

Replaces the provider and model native `<select>` elements in `TopBar`. The sessions `<select>` is removed entirely (replaced by tabs).

**Props:** `value`, `options: [{value, label}]`, `onChange`, `placeholder`, `prefix` (optional node — e.g. coloured dot)

**Behaviour:**
- Clicking the trigger toggles the panel open/closed.
- Clicking outside (via `useEffect` + document `mousedown` listener) closes the panel.
- Selecting an item calls `onChange`, closes the panel.
- Selected item shows a `✓` checkmark.
- Panel renders below the trigger by default.
- Keyboard: `Escape` closes and returns focus to trigger; `ArrowDown`/`ArrowUp` moves focus between items; `Enter`/`Space` selects the focused item. `Tab` closes the panel and moves focus to the next element.

**Styling:** trigger is a purple-tinted pill (`rgba(138,100,255,0.1)` bg, `rgba(138,100,255,0.28)` border, 6px radius, `#c4b5fd` text); panel is `#1a1030` background, `rgba(138,100,255,0.35)` border, 8px radius, `0 8px 32px rgba(0,0,0,0.7)` shadow, `z-index: 200`.

**3rd-party model fallback:** When `provider === '3rdparty'` and the model API call fails (`modelsFailed === true`), the model `Dropdown` is replaced with a plain `<input>` (free-text) as before. No changes to this fallback path — `Dropdown` is only used when a model list is available.

---

### 2. `TopBar` (modified)

Removes the sessions `<select>` and `sessions`/`onSessionSelect`/`onNewSession` props entirely. Keeps provider and model selectors, now using `Dropdown`. Settings button reskinned to purple-tinted pill icon button. The `headerColor` prop and its inline style override are removed — the topbar background is now the fixed Deep Space gradient token.

The `headerColor` setting is removed from `SettingsPanel` (see §6). The stored value in `settings.json` is harmlessly ignored.

Layout: `[CLAUDE CODE] [divider] [Provider ▾] [Model ▾] [spacer] [⚙]`

---

### 3. `TabBar` (new component — `src/components/TabBar.jsx`)

Sits between `TopBar` and the main split pane. Height: 34px. Background: `#0d0a1c`. Bottom border: `1px solid rgba(138,100,255,0.15)`.

**Each tab shows:**
- Live dot: green `#7eca9c` if PTY active (derived from `useSessions` live status), dim `#6d5aa0` if idle/ended.
- Label: `basename(tab.cwd)` — derived solely from `cwd`, never from `sessionId`. A tab with `sessionId: 'new'` that hasn't registered yet still shows its `cwd` label (e.g. `Home`).
- `×` close button: visible on hover. **Disabled (not rendered) when only one tab is open** — the last tab cannot be closed.

**Active tab:** `#080812` background, `1px solid rgba(138,100,255,0.25)` border on left/top/right, no bottom border (merges with terminal container).

**`+` button:** appends a new tab with `{ sessionId: 'new', cwd: '/Home' }`, sets it as active. Claude spawns immediately.

**Props:** `tabs`, `activeIndex`, `onSelect(index)`, `onClose(index)`, `onNew()`

---

### 4. `App` (modified)

**State:**
- Remove `activeSession`, `selectedCwd`, `sessions` state.
- Add `tabs: [{id, cwd, sessionId}]` (array) and `activeTabIndex: number`.
- `useSessions` hook is retained — used to refresh live-dot status on tabs after session events. It is no longer passed to `TopBar`.

**On mount (single effect):**
1. Fetch `/api/sessions`.
2. If sessions exist → `tabs = [{ sessionId: sessions[0].id, cwd: sessions[0].projectPath || '/Home' }]`. Only the single most recent session is restored; additional sessions are not auto-tabbed.
3. If no sessions → `tabs = [{ sessionId: 'new', cwd: '/Home' }]`.
4. `activeTabIndex = 0`.

**`openHere(dirPath)` (FileTree callback):** Appends a new tab `{ sessionId: 'new', cwd: dirPath }` and sets it active. Does not reuse the active tab.

**Terminal rendering:** Render one `Terminal` per tab. Inactive tabs use `hidden` prop (see §5) — not unmounted, so PTYs stay alive.

---

### 5. `Terminal` (modified)

**No xterm.js theme changes.** Claude's own TUI renders inside unmodified.

**Hiding inactive tabs:** Use `visibility: hidden; position: absolute; width: 100%; height: 100%` rather than `display: none`. This keeps the `ResizeObserver` target dimensioned, preventing `fitAddon.fit()` from erroring on a zero-size element.

When a tab becomes active (hidden → visible), call `fitAddon.fit()` explicitly and send a resize message to the PTY to sync dimensions.

**PTY kill on tab close:** Called from `App` when `onClose(index)` fires.
- If `tab.sessionId !== 'new'`: call `DELETE /api/sessions/:id` (or equivalent kill endpoint) then close the WebSocket.
- If `tab.sessionId === 'new'`: the real session ID is not yet known (async registration may still be in flight). Simply close the WebSocket — this terminates the PTY process. Do not attempt a kill API call.

---

### 6. `SettingsPanel` (reskin + field removal)

**Reskin:** Overlay backdrop `rgba(0,0,0,0.65)`. Panel: `#1a1030` background, `rgba(138,100,255,0.2)` border, 10px radius. Inputs: `rgba(138,100,255,0.08)` background, `rgba(138,100,255,0.2)` border. Buttons: primary `#6d3fc8`, secondary transparent with purple border.

**Remove:** The "Header Color" colour-picker field and its associated `theme.headerColor` state. The topbar colour is no longer user-configurable.

---

### 7. `App.css` (updated)

Define CSS custom properties at `:root` for all tokens in the Visual Language table. Update `.sash` to `rgba(138,100,255,0.15)`. Remove any remaining hardcoded colour values from global styles.

---

## Session Tab Lifecycle

```
App mounts
  → fetch /api/sessions
  → sessions[0] exists?  yes → tab[0] = resume sessions[0]
                         no  → tab[0] = new session at /Home
  → activeTabIndex = 0

User clicks +
  → append tab: { sessionId: 'new', cwd: '/Home' }
  → activeTabIndex = tabs.length - 1

FileTree "Open Here" clicked (dirPath)
  → append tab: { sessionId: 'new', cwd: dirPath }
  → activeTabIndex = tabs.length - 1

User clicks × on tab (only shown when tabs.length > 1)
  → if tab.sessionId !== 'new': call kill API, close WebSocket
  → if tab.sessionId === 'new': close WebSocket only
  → remove tab from array
  → if closed tab was active: activate max(0, index - 1)

User clicks inactive tab
  → activeTabIndex = that index
  → hidden Terminal becomes visible; call fitAddon.fit() + send resize to PTY
```

---

## Out of Scope

- FileTree component styling
- Backend changes
- xterm.js theme / font changes
- Persisting tab state across page reloads
- Keyboard a11y beyond what is specified for `Dropdown`
