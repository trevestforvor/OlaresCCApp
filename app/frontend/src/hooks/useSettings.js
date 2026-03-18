// app/frontend/src/hooks/useSettings.js
import { useState, useEffect } from 'react'

export function useSettings() {
  const [settings, setSettings] = useState({})
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setSettings).catch(() => {})
  }, [])
  async function saveSettings(data) {
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    const fresh = await fetch('/api/settings').then(r => r.json())
    setSettings(fresh)
  }
  return { settings, saveSettings }
}
