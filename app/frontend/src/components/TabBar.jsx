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
