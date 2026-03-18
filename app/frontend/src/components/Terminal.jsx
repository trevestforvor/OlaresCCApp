// app/frontend/src/components/Terminal.jsx
import { useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

export default function Terminal({ session, model, onSessionEnd }) {
  const containerRef = useRef(null)
  const xtermRef = useRef(null)
  const fitAddonRef = useRef(null)
  const wsRef = useRef(null)

  const connect = useCallback((sess) => {
    if (!sess) return
    if (wsRef.current) wsRef.current.close()

    const term = xtermRef.current
    term.clear()

    let url
    if (sess.id === 'new') {
      const cwd = encodeURIComponent(sess.cwd || '/workspace')
      const m = model ? `&model=${encodeURIComponent(model)}` : ''
      url = `ws://${location.host}/ws/terminal/new?cwd=${cwd}${m}`
    } else {
      const m = model ? `?model=${encodeURIComponent(model)}` : ''
      url = `ws://${location.host}/ws/terminal/${sess.id}${m}`
    }

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      // Send initial size
      const { cols, rows } = term
      ws.send(JSON.stringify({ type: 'resize', cols, rows }))
    }

    ws.onmessage = e => term.write(e.data)

    ws.onclose = (e) => {
      if (e.code === 4003) {
        term.write('\r\n\x1b[31mError: working directory is outside workspace\x1b[0m\r\n')
      }
      if (onSessionEnd) onSessionEnd()
    }

    ws.onerror = () => term.write('\r\n\x1b[31mWebSocket error\x1b[0m\r\n')

    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data)
    })
  }, [model, onSessionEnd])

  // Init xterm on mount
  useEffect(() => {
    const term = new XTerm({
      theme: { background: '#0d0d14', foreground: '#e0e0e0', cursor: '#7eb8f7' },
      fontFamily: '"Cascadia Code", "Fira Code", monospace',
      fontSize: 14,
      cursorBlink: true,
      scrollback: 5000,
    })
    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(containerRef.current)
    fitAddon.fit()
    xtermRef.current = term
    fitAddonRef.current = fitAddon

    const obs = new ResizeObserver(() => {
      fitAddon.fit()
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    })
    obs.observe(containerRef.current)

    return () => { obs.disconnect(); term.dispose(); wsRef.current?.close() }
  }, [])

  // Connect when session changes
  useEffect(() => {
    if (xtermRef.current) connect(session)
  }, [session, connect])

  return (
    <div
      ref={containerRef}
      style={{ height: '100%', background: '#0d0d14', padding: 4 }}
    />
  )
}
