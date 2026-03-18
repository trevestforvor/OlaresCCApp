// app/frontend/src/components/TopBar.jsx
import { useState, useEffect } from 'react'

const ANTHROPIC_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]

export default function TopBar({
  headerColor, sessions, model, onModelChange,
  onSessionSelect, onNewSession, onSettingsOpen, settings
}) {
  const [provider, setProvider] = useState('anthropic')
  const [thirdPartyModels, setThirdPartyModels] = useState([])
  const [modelInput, setModelInput] = useState(model)
  const [modelsFailed, setModelsFailed] = useState(false)

  useEffect(() => {
    if (provider === '3rdparty' && settings?.ANTHROPIC_BASE_URL) {
      fetch(`/api/models?baseUrl=${encodeURIComponent(settings.ANTHROPIC_BASE_URL)}`)
        .then(r => r.json())
        .then(d => {
          if (d.models?.length) { setThirdPartyModels(d.models); setModelsFailed(false) }
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

  const liveCount = sessions.filter(s => s.live).length

  return (
    <div style={{
      height: 48,
      background: headerColor,
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 12,
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      flexShrink: 0,
    }}>
      <span style={{ fontWeight: 700, color: '#fff', marginRight: 8, letterSpacing: 1 }}>
        Claude Code
      </span>

      {/* Provider */}
      <select
        value={provider}
        onChange={e => setProvider(e.target.value)}
        style={selectStyle}
      >
        <option value="anthropic">Anthropic</option>
        <option value="3rdparty">3rd Party</option>
      </select>

      {/* Model */}
      {provider === '3rdparty' && modelsFailed ? (
        <input
          value={modelInput}
          onChange={e => handleModelChange(e.target.value)}
          placeholder="model name"
          style={{ ...selectStyle, width: 160 }}
        />
      ) : (
        <select
          value={model}
          onChange={e => handleModelChange(e.target.value)}
          style={selectStyle}
        >
          <option value="">— model —</option>
          {modelList.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      )}

      {/* Sessions */}
      <select
        onChange={e => {
          if (e.target.value === '__new__') { onNewSession(); e.target.value = '' }
          else {
            const s = sessions.find(s => s.id === e.target.value)
            if (s) onSessionSelect(s)
          }
        }}
        style={selectStyle}
        defaultValue=""
      >
        <option value="" disabled>Sessions {liveCount > 0 ? `(${liveCount} live)` : ''}</option>
        <option value="__new__">+ New session</option>
        {sessions.map(s => (
          <option key={s.id} value={s.id}>
            {s.live ? '● ' : '○ '}{s.title || s.id.slice(0, 8)} — {(s.projectPath || '').split('/').pop()}
          </option>
        ))}
      </select>

      <span style={{ flex: 1 }} />

      {/* Settings */}
      <button onClick={onSettingsOpen} style={btnStyle} title="Settings">⚙</button>
    </div>
  )
}

const selectStyle = {
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 13,
  cursor: 'pointer',
}

const btnStyle = {
  background: 'transparent',
  color: '#fff',
  border: 'none',
  fontSize: 18,
  cursor: 'pointer',
  padding: '4px 8px',
}
