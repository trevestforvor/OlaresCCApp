// app/frontend/src/App.jsx
import { useState, useEffect, useCallback } from 'react'
import { Allotment } from 'allotment'
import TopBar from './components/TopBar'
import TabBar from './components/TabBar'
import FileTree from './components/FileTree'
import Terminal from './components/Terminal'
import SettingsPanel from './components/SettingsPanel'
import { useSettings } from './hooks/useSettings'
import { useSessions } from './hooks/useSessions'

let tabIdCounter = 0
function newTabId() { return ++tabIdCounter }

export default function App() {
  const { settings, saveSettings } = useSettings()
  const { sessions, refresh: refreshSessions } = useSessions()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [model, setModel] = useState('')
  const [tabs, setTabs] = useState([])
  const [activeTabIndex, setActiveTabIndex] = useState(0)

  // On mount: auto-resume most recent session or start fresh
  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(data => {
        if (data.length > 0) {
          const s = data[0]
          setTabs([{ id: newTabId(), sessionId: s.id, cwd: s.projectPath || '/Home' }])
        } else {
          setTabs([{ id: newTabId(), sessionId: 'new', cwd: '/Home' }])
        }
        setActiveTabIndex(0)
      })
      .catch(() => {
        setTabs([{ id: newTabId(), sessionId: 'new', cwd: '/Home' }])
        setActiveTabIndex(0)
      })
  }, [])

  const openNewTab = useCallback((cwd = '/Home') => {
    setTabs(prev => {
      const next = [...prev, { id: newTabId(), sessionId: 'new', cwd }]
      setActiveTabIndex(next.length - 1)
      return next
    })
  }, [])

  const closeTab = useCallback((index) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev // safety — TabBar also prevents this
      const tab = prev[index]
      // Kill the PTY on the server. POST /api/sessions/:id/stop already exists in sessions.js
      // (the spec mentions DELETE /api/sessions/:id but /stop is the confirmed live endpoint).
      // If sessionId is 'new' the real ID isn't registered yet — skip the API call;
      // the WebSocket close (from Terminal unmount) is sufficient.
      if (tab.sessionId && tab.sessionId !== 'new') {
        fetch(`/api/sessions/${tab.sessionId}/stop`, { method: 'POST' }).catch(() => {})
      }
      const next = prev.filter((_, i) => i !== index)
      setActiveTabIndex(i => {
        if (i >= next.length) return next.length - 1
        if (i > index) return i - 1
        return i
      })
      return next
    })
  }, [])

  function openHere(dirPath) {
    openNewTab(dirPath)
  }

  if (tabs.length === 0) return null // loading

  return (
    <div className="app">
      <TopBar
        model={model}
        onModelChange={setModel}
        onSettingsOpen={() => setSettingsOpen(true)}
        settings={settings}
      />
      <TabBar
        tabs={tabs}
        activeIndex={activeTabIndex}
        sessions={sessions}
        onSelect={setActiveTabIndex}
        onClose={closeTab}
        onNew={() => openNewTab('/Home')}
      />
      <div className="main-area">
        <Allotment defaultSizes={[250, 750]}>
          <Allotment.Pane minSize={150}>
            <FileTree onOpenHere={openHere} />
          </Allotment.Pane>
          <Allotment.Pane>
            <div style={{ position: 'relative', height: '100%' }}>
              {tabs.map((tab, i) => (
                <Terminal
                  key={tab.id}
                  session={{ id: tab.sessionId, cwd: tab.cwd }}
                  model={model}
                  onSessionEnd={refreshSessions}
                  hidden={i !== activeTabIndex}
                />
              ))}
            </div>
          </Allotment.Pane>
        </Allotment>
      </div>
      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onSave={async (data) => { await saveSettings(data); setSettingsOpen(false) }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
