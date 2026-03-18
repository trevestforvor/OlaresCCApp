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
