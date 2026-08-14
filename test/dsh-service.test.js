import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { Writable } from 'node:stream'
import { DshService } from '../src/dsh-service.js'

function makeFakeChild() {
  const child = new EventEmitter()
  child.kill = vi.fn(() => {
    setImmediate(() => child.emit('exit', 0, 'SIGTERM'))
    return true
  })
  return child
}

function makeService({ waitForPortImpl = async () => true, child = makeFakeChild(), spawnImpl, profile = 'web' } = {}) {
  const logs = []
  const logStream = new Writable({
    write(chunk, _enc, cb) { logs.push(String(chunk)); cb() },
  })
  spawnImpl = spawnImpl || (() => child)
  return {
    service: new DshService({
      nodePath: 'node.exe', dshEntry: 'dsh.js', dshHome: 'C:/dsh-home',
      port: 3080, env: { PATH: 'C:/bin' }, logStream,
      waitForPortImpl, spawnImpl, profile,
    }),
    child, logs,
  }
}

describe('DshService', () => {
  it('start 用正确参数 spawn 并等待端口', async () => {
    const seen = {}
    const child = makeFakeChild()
    const { service } = makeService({
      child,
      spawnImpl: (cmd, args, opts) => { Object.assign(seen, { cmd, args, opts }); return child },
    })
    await service.start()
    expect(seen.cmd).toBe('node.exe')
    expect(seen.args).toEqual(['dsh.js', '--profile', 'web', '--port', '3080'])
    expect(seen.opts.cwd).toBeDefined()
    expect(seen.opts.env.DSH_HOME).toBe('C:/dsh-home')
    expect(seen.opts.env.PATH).toBe('C:/bin')
    expect(service.port).toBe(3080)
  })

  it('端口就绪前进程退出则 reject', async () => {
    const child = makeFakeChild()
    const { service } = makeService({
      child,
      waitForPortImpl: async () => false,
    })
    child.emit('exit', 1, null)
    await expect(service.start()).rejects.toThrow(/exit/)
  })

  it('spawn 失败（error 事件）时 reject', async () => {
    const child = makeFakeChild()
    const { service } = makeService({ child })
    const p = service.start()
    child.emit('error', new Error('ENOENT'))
    await expect(p).rejects.toThrow(/ENOENT/)
  })

  it('支持自定义 profile', async () => {
    const seen = {}
    const child = makeFakeChild()
    const { service } = makeService({
      child, profile: 'work',
      spawnImpl: (cmd, args, opts) => { Object.assign(seen, { args }); return child },
    })
    await service.start()
    expect(seen.args).toEqual(['dsh.js', '--profile', 'work', '--port', '3080'])
  })

  it('restart 传入 profile 会切换并重建', async () => {
    const seen = []
    const child = makeFakeChild()
    const { service } = makeService({
      child,
      spawnImpl: (cmd, args, opts) => { seen.push(args); return child },
    })
    await service.start()
    await service.restart('work')
    expect(service.profile).toBe('work')
    expect(seen[1]).toEqual(['dsh.js', '--profile', 'work', '--port', '3080'])
  })

  it('stop 调用 kill 并等退出', async () => {
    const { service, child } = makeService()
    await service.start()
    await service.stop()
    expect(child.kill).toHaveBeenCalled()
  })

  it('exit 事件对外透传', async () => {
    const { service, child } = makeService()
    const onExit = vi.fn()
    service.on('exit', onExit)
    await service.start()
    child.emit('exit', 0, null)
    expect(onExit).toHaveBeenCalledWith(0, null)
  })

  it('start 后 stdout/stderr 写入 logStream', async () => {
    const { service, child, logs } = makeService()
    await service.start()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    service._attachStreams(child)
    child.stdout.emit('data', Buffer.from('hello'))
    expect(logs.join('')).toContain('hello')
  })
})
