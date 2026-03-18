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
