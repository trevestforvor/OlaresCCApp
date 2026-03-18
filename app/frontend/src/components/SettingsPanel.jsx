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
