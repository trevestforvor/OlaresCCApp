// app/backend/test-integration.js
// Run: SETTINGS_PATH=./dev-settings.json WORKSPACE_ROOT=$(pwd) node test-integration.js
const http = require('http')
const { WebSocket } = require('ws')

const BASE = 'http://localhost:3000'
let passed = 0
let failed = 0

function assert(condition, msg) {
  if (condition) { console.log(`  ✓ ${msg}`); passed++ }
  else { console.error(`  ✗ ${msg}`); failed++ }
}

async function get(path) {
  return new Promise((resolve, reject) => {
    http.get(BASE + path, res => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }))
    }).on('error', reject)
  })
}

async function testSettings() {
  console.log('\n[Settings API]')
  const r = await get('/api/settings')
  assert(r.status === 200, 'GET /api/settings returns 200')
  assert(typeof r.body === 'object', 'response is object')
}

async function testFiles() {
  console.log('\n[Files API]')
  const r = await get('/api/files')
  assert(r.status === 200, 'GET /api/files returns 200')
  assert(Array.isArray(r.body.items), 'items is array')
  const r2 = await get('/api/files?path=../../etc')
  assert(r2.status === 403, 'path traversal returns 403')
}

async function testSessions() {
  console.log('\n[Sessions API]')
  const r = await get('/api/sessions')
  assert(r.status === 200, 'GET /api/sessions returns 200')
  assert(Array.isArray(r.body), 'response is array')
}

async function testWsPty() {
  console.log('\n[WebSocket PTY]')
  return new Promise(resolve => {
    const cwd = encodeURIComponent(process.cwd())
    const ws = new WebSocket(`ws://localhost:3000/ws/terminal/new?cwd=${cwd}`)
    let output = ''
    const timer = setTimeout(() => {
      assert(false, 'PTY round-trip (timeout)')
      ws.close()
      resolve()
    }, 8000)

    ws.on('open', () => {
      setTimeout(() => ws.send('claude --version\n'), 500)
    })
    ws.on('message', d => {
      output += d.toString()
      if (output.includes('claude') && output.includes('.')) {
        clearTimeout(timer)
        assert(true, `PTY round-trip: received "${output.replace(/\r?\n/g,' ').trim().slice(0,60)}"`)
        ws.close()
        resolve()
      }
    })
    ws.on('error', () => { clearTimeout(timer); assert(false, 'WebSocket error'); resolve() })
  })
}

async function main() {
  console.log('Starting integration tests (server must be running on :3000)...')
  await testSettings()
  await testFiles()
  await testSessions()
  await testWsPty()
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
