import { createServer } from 'node:net'

export async function findFreePort(start = 3080, end = 3090) {
  for (let port = start; port <= end; port++) {
    const free = await new Promise((resolve) => {
      const server = createServer()
      server.once('error', () => resolve(false))
      server.once('listening', () => server.close(() => resolve(true)))
      server.listen(port, '127.0.0.1')
    })
    if (free) return port
  }
  return null
}

export async function waitForPort(port, { timeoutMs = 30000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`)
      if (res.ok) return true
    } catch {
      // 端口未就绪，继续轮询
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
}
