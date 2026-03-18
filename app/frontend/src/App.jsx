// app/frontend/src/App.jsx
import { useState } from 'react'
import { Allotment } from 'allotment'
import TopBar from './components/TopBar'
import FileTree from './components/FileTree'
import Terminal from './components/Terminal'
import SettingsPanel from './components/SettingsPanel'
import { useSettings } from './hooks/useSettings'
import { useSessions } from './hooks/useSessions'

export default function App() {
  const { settings, saveSettings } = useSettings()
  const { sessions, refresh: refreshSessions } = useSessions()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeSession, setActiveSession] = useState(null)
  const [selectedCwd, setSelectedCwd] = useState('')
  const [model, setModel] = useState('')

  const headerColor = settings?.theme?.headerColor || '#1a1a2e'

  function openSession(session) {
    setActiveSession(session)
  }

  function openHere(dirPath) {
    setSelectedCwd(dirPath)
    setActiveSession({ id: 'new', cwd: dirPath })
  }

  return (
    <div className="app">
      <TopBar
        headerColor={headerColor}
        sessions={sessions}
        model={model}
        onModelChange={setModel}
        onSessionSelect={openSession}
        onNewSession={() => openSession({ id: 'new', cwd: selectedCwd })}
        onSettingsOpen={() => setSettingsOpen(true)}
        settings={settings}
        onSettingsSave={saveSettings}
      />
      <div className="main-area">
        <Allotment defaultSizes={[250, 750]}>
          <Allotment.Pane minSize={150}>
            <FileTree onOpenHere={openHere} />
          </Allotment.Pane>
          <Allotment.Pane>
            <Terminal
              session={activeSession}
              model={model}
              onSessionEnd={refreshSessions}
            />
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
