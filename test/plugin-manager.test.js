import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createPluginManager, repairVirtualStoreLocation, toResult } from '../src/main/services/plugin-manager.js'

// 与 dsh-service 测试的 makeFakeChild 同构：EventEmitter child + stdout/stderr 事件源，
// 先 emit 'data' 再 emit 'close'（输出收全用 close 而非 exit）。
function fakeRun(result = { code: 0, output: 'done' }) {
  const calls = []
  const impl = (cmd, args, opts) => {
    calls.push({ cmd, args, opts })
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = vi.fn(() => true)
    setTimeout(() => {
      if (result.output) child.stdout.emit('data', result.output)
      child.emit('close', result.code)
    }, 10)
    return child
  }
  return { impl, calls }
}

describe('createPluginManager', () => {
  let baseDir

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'dsh-plugins-'))
    mkdirSync(join(baseDir, 'dsh-home', 'profiles', 'web'), { recursive: true })
  })

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true })
  })

  function makePm(spawnImpl) {
    return createPluginManager({
      nodePath: 'node.exe', dshEntry: 'dsh.js', dshHome: join(baseDir, 'dsh-home'),
      env: { PATH: 'C:/bin' }, spawnImpl,
    })
  }

  it('listPlugins 返回 profile dependencies', async () => {
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'package.json'), JSON.stringify({
      dependencies: { 'dsh-plugin-aaa': '^1.0.0', 'dsh-plugin-bbb': '^2.0.0' },
    }))
    const { impl } = fakeRun()
    const pm = makePm(impl)
    const list = await pm.listPlugins()
    expect(list).toEqual([
      { name: 'dsh-plugin-aaa', version: '^1.0.0' },
      { name: 'dsh-plugin-bbb', version: '^2.0.0' },
    ])
  })

  it('listPlugins 无 package.json 时返回空数组', async () => {
    const pm = makePm(fakeRun().impl)
    expect(await pm.listPlugins()).toEqual([])
  })

  it('installPlugin 构造 add 命令并返回输出', async () => {
    const { impl, calls } = fakeRun({ code: 0, output: 'added' })
    const pm = makePm(impl)
    const res = await pm.installPlugin('dsh-plugin-ccc')
    expect(res).toEqual({ ok: true, output: 'added' })
    expect(calls[0].args).toEqual(['dsh.js', 'plugin', '--profile', 'web', 'add', 'dsh-plugin-ccc'])
    expect(calls[0].opts.env.PATH).toBe('C:/bin')
  })

  it('installPlugin 失败时 ok=false', async () => {
    const { impl } = fakeRun({ code: 1, output: 'pnpm error: allowBuilds' })
    const pm = makePm(impl)
    const res = await pm.installPlugin('github:user/repo')
    expect(res.ok).toBe(false)
    expect(res.output).toContain('allowBuilds')
  })

  it('removePlugin 构造 remove 命令', async () => {
    const { impl, calls } = fakeRun()
    const pm = makePm(impl)
    await pm.removePlugin('dsh-plugin-aaa')
    expect(calls[0].args).toEqual(['dsh.js', 'plugin', '--profile', 'web', 'remove', 'dsh-plugin-aaa'])
  })

  it('repairVirtualStoreLocation 修复复制 profile 残留的源路径', () => {
    const profileDir = join(baseDir, 'dsh-home', 'profiles', 'web')
    const modulesDir = join(profileDir, 'node_modules')
    const file = join(modulesDir, '.modules.yaml')
    mkdirSync(modulesDir, { recursive: true })
    writeFileSync(file, 'nodeLinker: hoisted\nvirtualStoreDir: C:\\source\\web\\node_modules\\.pnpm\n')
    expect(repairVirtualStoreLocation(profileDir)).toBe(true)
    expect(readFileSync(file, 'utf8')).toContain(`virtualStoreDir: ${join(profileDir, 'node_modules', '.pnpm')}`)
  })
})

it('toResult 超时后 kill 并返回 code 1', async () => {
  const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 10000)'], { stdio: ['ignore', 'pipe', 'pipe'] })
  const res = await toResult(child, { timeoutMs: 500 })
  expect(res.code).toBe(1)
  expect(res.output).toContain('超时')
}, 10000)

it('toResult 收集真实进程 close 输出', async () => {
  const child = spawn(process.execPath, ['-e', 'console.log("hi")'], { stdio: ['ignore', 'pipe', 'pipe'] })
  const res = await toResult(child)
  expect(res.code).toBe(0)
  expect(res.output).toContain('hi')
})
