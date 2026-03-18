// app/frontend/src/hooks/useSessions.js
import { useState, useEffect, useCallback } from 'react'

export function useSessions() {
  const [sessions, setSessions] = useState([])
  const refresh = useCallback(() => {
    fetch('/api/sessions').then(r => r.json()).then(setSessions).catch(() => {})
  }, [])
  useEffect(() => { refresh() }, [refresh])
  return { sessions, refresh }
}
