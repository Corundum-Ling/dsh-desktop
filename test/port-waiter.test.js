import { describe, it, expect } from 'vitest'
import { createServer } from 'node:http'
import { findFreePort, waitForPort } from '../src/main/services/port-waiter.js'

describe('findFreePort', () => {
  it('返回空闲端口', async () => {
    const port = await findFreePort(39080, 39090)
    expect(port).toBeGreaterThanOrEqual(39080)
    expect(port).toBeLessThanOrEqual(39090)
  })

  it('跳过被占用的端口', async () => {
    const server = createServer()
    await new Promise((r) => server.listen(39100, '127.0.0.1', r))
    try {
      const port = await findFreePort(39100, 39100)
      expect(port).toBeNull()
    } finally {
      server.close()
    }
  })
})

describe('waitForPort', () => {
  it('端口就绪后返回 true', async () => {
    const server = createServer((req, res) => {
      res.writeHead(200)
      res.end('ok')
    })
    await new Promise((r) => server.listen(39110, '127.0.0.1', r))
    try {
      const ok = await waitForPort(39110, { timeoutMs: 5000 })
      expect(ok).toBe(true)
    } finally {
      server.close()
    }
  })

  it('超时后返回 false', async () => {
    const ok = await waitForPort(39120, { timeoutMs: 500, intervalMs: 100 })
    expect(ok).toBe(false)
  })
})
