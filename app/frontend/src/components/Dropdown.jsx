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
