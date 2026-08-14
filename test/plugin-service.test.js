import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPluginService } from '../src/plugin-service.js'
import { createPluginManager } from '../src/plugin-manager.js'

describe('createPluginService', () => {
  let baseDir

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'ps-test-'))
    mkdirSync(join(baseDir, 'dsh-home', 'profiles', 'web'), { recursive: true })
  })

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true })
  })

  const rowsFixture = [
    { id: 'llm', name: '@deepseek-ai/dsh-llm', bundle: '@deepseek-ai/dsh-base', disabled: false },
    { id: 'my-tool', name: '@user/dsh-my-tool', bundle: '@deepseek-ai/dsh-base', disabled: false },
  ]

  function makeSvc(overrides = {}) {
    return createPluginService({
      nodePath: 'node.exe',
      dshEntry: 'dsh.js',
      dshHome: join(baseDir, 'dsh-home'),
      env: { PATH: 'C:/bin' },
      runDumpConfigImpl: async () => rowsFixture,
      ...overrides,
    })
  }

  it('list 返回四源合并视图', async () => {
    // 有 bundles + patch insert + 用户行
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'package.json'), JSON.stringify({
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
      dependencies: { '@user/dsh-my-tool': '^1.0.0' },
    }))
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'cordis.patch.yml'),
      '- insert:\n    - id: dsh-web-ui\n      name: "dsh-web-ui"\n')
    const svc = makeSvc()
    const view = await svc.list()
    expect(view.bundles).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    expect(view.rows).toEqual(rowsFixture)
    expect(view.inserts).toEqual([{ id: 'dsh-web-ui', name: 'dsh-web-ui', managed: false }])
  })

  it('setEnabled 对 bundle 行写 managed disable 块', async () => {
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'package.json'), JSON.stringify({
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
    }))
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'cordis.patch.yml'), '[]\n')
    const svc = makeSvc()
    const res = await svc.setEnabled('llm', false)
    expect(res.ok).toBe(true)
    const patch = readFileSync(svc.patchPath(), 'utf8')
    expect(patch).toContain('- id: llm')
    expect(patch).toContain('disabled: true')
    // 再启用
    await svc.setEnabled('llm', true)
    const patch2 = readFileSync(svc.patchPath(), 'utf8')
    expect(patch2).not.toContain('disabled: true')
  })

  it('setEnabled 对用户手写行用 applyRow 系列', async () => {
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'package.json'), JSON.stringify({
      dsh: { profile: { bundles: [] } },
    }))
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'cordis.patch.yml'),
      '- id: user-row\n  config:\n    k: v\n')
    const svc = makeSvc()
    await svc.setEnabled('user-row', false)
    const patch = readFileSync(svc.patchPath(), 'utf8')
    expect(patch).toContain('user-row')
    expect(patch).toContain('disabled: true')
    await svc.setEnabled('user-row', true)
    const patch2 = readFileSync(svc.patchPath(), 'utf8')
    expect(patch2).not.toContain('disabled')
    expect(patch2).toContain('k: v')
  })

  it('setEnabled 未知行返回 ok=false', async () => {
    const svc = makeSvc()
    const res = await svc.setEnabled('ghost', false)
    expect(res.ok).toBe(false)
  })
})

describe('install / remove / in-box 保护', () => {
  let baseDir
  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'ps-install-'))
    mkdirSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'node_modules', 'dsh-nonbundle'), { recursive: true })
    mkdirSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'node_modules', 'dsh-bundle'), { recursive: true })
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'package.json'), JSON.stringify({
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
      dependencies: {},
    }))
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'cordis.patch.yml'), '[]\n')
  })
  afterEach(() => { rmSync(baseDir, { recursive: true, force: true }) })

  function fakeSpawnImpl() {
    const calls = []
    const impl = (cmd, args, opts) => {
      calls.push(args)
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from('installed'))
        child.emit('close', 0, null)
      })
      return child
    }
    return { impl, calls }
  }

  it('install 检测 bundle：有 dsh.bundle → needsRestart=true', async () => {
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'node_modules', 'dsh-bundle', 'package.json'),
      JSON.stringify({ name: 'dsh-bundle', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'node_modules', 'dsh-bundle', 'cordis.patch.yml'), '[]\n')
    const { impl } = fakeSpawnImpl()
    const pm = createPluginManager({ nodePath: 'node.exe', dshEntry: 'dsh.js', dshHome: join(baseDir, 'dsh-home'), env: { PATH: 'C:/bin' }, spawnImpl: impl })
    const svc = createPluginService({ nodePath: 'node.exe', dshEntry: 'dsh.js', dshHome: join(baseDir, 'dsh-home'), env: { PATH: 'C:/bin' }, runDumpConfigImpl: async () => [] })
    const res = await svc.install('dsh-bundle', pm)
    expect(res.ok).toBe(true)
    expect(res.needsRestart).toBe(true)
  })

  it('install 检测非 bundle：写 insert 行实时挂载', async () => {
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'node_modules', 'dsh-nonbundle', 'package.json'),
      JSON.stringify({ name: 'dsh-nonbundle', version: '1.0.0' }))
    const { impl } = fakeSpawnImpl()
    const pm = createPluginManager({ nodePath: 'node.exe', dshEntry: 'dsh.js', dshHome: join(baseDir, 'dsh-home'), env: { PATH: 'C:/bin' }, spawnImpl: impl })
    const svc = createPluginService({ nodePath: 'node.exe', dshEntry: 'dsh.js', dshHome: join(baseDir, 'dsh-home'), env: { PATH: 'C:/bin' }, runDumpConfigImpl: async () => [] })
    const res = await svc.install('dsh-nonbundle', pm)
    expect(res.ok).toBe(true)
    expect(res.needsRestart).toBe(false)
    const patch = readFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain("name: 'dsh-nonbundle'")
  })

  it('remove 拒绝 in-box 核心组件', async () => {
    const svc = createPluginService({ nodePath: 'node.exe', dshEntry: 'dsh.js', dshHome: join(baseDir, 'dsh-home'), env: { PATH: 'C:/bin' }, runDumpConfigImpl: async () => [] })
    const res = await svc.remove('@deepseek-ai/dsh-base', null)
    expect(res.ok).toBe(false)
    expect(res.output).toContain('核心组件')
  })
})
