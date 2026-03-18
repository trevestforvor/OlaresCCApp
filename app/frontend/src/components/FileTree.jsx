// app/frontend/src/components/FileTree.jsx
import { useState, useEffect } from 'react'

export default function FileTree({ onOpenHere }) {
  const [currentPath, setCurrentPath] = useState('/workspace')
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => { loadPath(currentPath) }, [currentPath])

  function loadPath(p) {
    fetch(`/api/files?path=${encodeURIComponent(p)}`)
      .then(r => r.json())
      .then(d => { setItems(d.items || []); setError(null) })
      .catch(() => setError('Failed to load'))
  }

  function navigate(item) {
    if (item.isDirectory) setCurrentPath(item.path)
  }

  const parts = currentPath.replace('/workspace', '').split('/').filter(Boolean)

  return (
    <div style={{ height: '100%', overflow: 'auto', background: '#111118', padding: 8 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
        <span
          style={{ cursor: 'pointer', color: '#888' }}
          onClick={() => setCurrentPath('/workspace')}
        >/workspace</span>
        {parts.map((p, i) => {
          const path = '/workspace/' + parts.slice(0, i + 1).join('/')
          return (
            <span key={path}>
              <span style={{ color: '#444' }}>/</span>
              <span style={{ cursor: 'pointer', color: '#888' }} onClick={() => setCurrentPath(path)}>{p}</span>
            </span>
          )
        })}
      </div>

      {error && <div style={{ color: '#f55', fontSize: 12 }}>{error}</div>}

      {items.map(item => (
        <div key={item.path} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <span
            onClick={() => navigate(item)}
            style={{
              flex: 1,
              cursor: item.isDirectory ? 'pointer' : 'default',
              color: item.isDirectory ? '#7eb8f7' : '#c8c8d4',
              fontSize: 13,
              padding: '2px 4px',
              borderRadius: 3,
            }}
          >
            {item.isDirectory ? '📁' : '📄'} {item.name}
          </span>
          {item.isDirectory && (
            <button
              onClick={() => onOpenHere(item.path)}
              style={{
                background: 'rgba(126,184,247,0.15)',
                color: '#7eb8f7',
                border: 'none',
                borderRadius: 3,
                fontSize: 11,
                padding: '1px 6px',
                cursor: 'pointer',
              }}
            >
              Open
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
