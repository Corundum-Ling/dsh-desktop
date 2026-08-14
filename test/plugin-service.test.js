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
    // 行标注 core（dsh-base 属核心 bundle）
    expect(view.rows).toEqual(rowsFixture.map(r => ({ ...r, core: true })))
    expect(view.inserts).toEqual([{ id: 'dsh-web-ui', name: 'dsh-web-ui', managed: false }])
  })

  it('list 按 bundle 归属标注 core，无 scope bundle 名归一化', async () => {
    const svc = createPluginService({
      nodePath: 'node.exe',
      dshEntry: 'dsh.js',
      dshHome: join(baseDir, 'dsh-home'),
      env: { PATH: 'C:/bin' },
      runDumpConfigImpl: async () => [
        { id: 'ui', name: '@deepseek-ai/dsh-web-app', bundle: 'dsh-web-app', disabled: false },
        { id: 'pm', name: '@deepseek-ai/dsh-web-plugin-manager', bundle: 'dsh-web-plugin-manager', disabled: false },
        { id: 'user', name: '@user/my-plugin', bundle: '', disabled: false },
      ],
    })
    const view = await svc.list()
    expect(view.rows.map(r => [r.name, r.core])).toEqual([
      ['@deepseek-ai/dsh-web-app', true],   // 无 scope bundle 名命中 IN_BOX
      ['@deepseek-ai/dsh-web-plugin-manager', false], // 不在核心盒内
      ['@user/my-plugin', false],           // 用户行无 bundle
    ])
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
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'package.json'), JSON.stringify({
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
      dependencies: { 'dsh-bundle': '^1.0.0' }, // pnpm 安装后的依赖 diff
    }))
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
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'package.json'), JSON.stringify({
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
      dependencies: { 'dsh-nonbundle': '^1.0.0' }, // pnpm 安装后的依赖 diff
    }))
    const { impl } = fakeSpawnImpl()
    const pm = createPluginManager({ nodePath: 'node.exe', dshEntry: 'dsh.js', dshHome: join(baseDir, 'dsh-home'), env: { PATH: 'C:/bin' }, spawnImpl: impl })
    const svc = createPluginService({ nodePath: 'node.exe', dshEntry: 'dsh.js', dshHome: join(baseDir, 'dsh-home'), env: { PATH: 'C:/bin' }, runDumpConfigImpl: async () => [] })
    const res = await svc.install('dsh-nonbundle', pm)
    expect(res.ok).toBe(true)
    expect(res.needsRestart).toBe(true) // 非 bundle 也重启（dsh rc.6 不激活 insert 行，重启尝试）
    const patch = readFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain("name: 'dsh-nonbundle'")
  })

  it('install 依赖 diff 匹配：依赖值为完整 git spec 时按值命中真实包名', async () => {
    // pnpm add github:user/repo#main 后 package.json 写入 { 'dsh-nonbundle': 'github:user/dsh-nonbundle#main' }
    const spec = 'github:user/dsh-nonbundle#main'
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'node_modules', 'dsh-nonbundle', 'package.json'),
      JSON.stringify({ name: 'dsh-nonbundle', version: '1.0.0' }))
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'package.json'), JSON.stringify({
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
      dependencies: { 'dsh-nonbundle': spec },
    }))
    const { impl } = fakeSpawnImpl()
    const pm = createPluginManager({ nodePath: 'node.exe', dshEntry: 'dsh.js', dshHome: join(baseDir, 'dsh-home'), env: { PATH: 'C:/bin' }, spawnImpl: impl })
    const svc = createPluginService({ nodePath: 'node.exe', dshEntry: 'dsh.js', dshHome: join(baseDir, 'dsh-home'), env: { PATH: 'C:/bin' }, runDumpConfigImpl: async () => [] })
    const res = await svc.install(spec, pm)
    expect(res.ok).toBe(true)
    expect(res.needsRestart).toBe(true) // 非 bundle 也重启（dsh rc.6 不激活 insert 行，重启尝试）
    const patch = readFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain("name: 'dsh-nonbundle'")
  })

  it('install github 源：依赖值包含 clean 名 → includes 分支解析真实包名', async () => {
    // spec 为 npm git 简写 user/repo#branch，pnpm 写入依赖值为 github: 前缀完整形式
    const spec = 'user/dsh-nonbundle#main'
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'node_modules', 'dsh-nonbundle', 'package.json'),
      JSON.stringify({ name: 'dsh-nonbundle', version: '1.0.0' }))
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'package.json'), JSON.stringify({
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
      dependencies: { 'dsh-nonbundle': 'github:user/dsh-nonbundle#main' },
    }))
    const { impl } = fakeSpawnImpl()
    const pm = createPluginManager({ nodePath: 'node.exe', dshEntry: 'dsh.js', dshHome: join(baseDir, 'dsh-home'), env: { PATH: 'C:/bin' }, spawnImpl: impl })
    const svc = createPluginService({ nodePath: 'node.exe', dshEntry: 'dsh.js', dshHome: join(baseDir, 'dsh-home'), env: { PATH: 'C:/bin' }, runDumpConfigImpl: async () => [] })
    const res = await svc.install(spec, pm)
    expect(res.ok).toBe(true)
    expect(res.needsRestart).toBe(true) // 非 bundle 也重启（dsh rc.6 不激活 insert 行，重启尝试）
    const patch = readFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain("name: 'dsh-nonbundle'")
  })

  it('install scoped 名：slugify 转安全 entry id 实时挂载（不再降级重启）', async () => {
    mkdirSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'node_modules', '@scope', 'pkg'), { recursive: true })
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'node_modules', '@scope', 'pkg', 'package.json'),
      JSON.stringify({ name: '@scope/pkg', version: '1.0.0' }))
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'package.json'), JSON.stringify({
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
      dependencies: { '@scope/pkg': '^1.0.0' },
    }))
    const { impl } = fakeSpawnImpl()
    const pm = createPluginManager({ nodePath: 'node.exe', dshEntry: 'dsh.js', dshHome: join(baseDir, 'dsh-home'), env: { PATH: 'C:/bin' }, spawnImpl: impl })
    const svc = createPluginService({ nodePath: 'node.exe', dshEntry: 'dsh.js', dshHome: join(baseDir, 'dsh-home'), env: { PATH: 'C:/bin' }, runDumpConfigImpl: async () => [] })
    const res = await svc.install('@scope/pkg', pm)
    expect(res.ok).toBe(true)
    expect(res.needsRestart).toBe(true) // 非 bundle 也重启（dsh rc.6 不激活 insert 行，重启尝试） // slugify 后 entry id 安全 → 实时挂载
    const patch = readFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain('id: scope-pkg')
    expect(patch).toContain("name: '@scope/pkg'")
  })

  it('remove 拒绝 in-box 核心组件', async () => {
    const svc = createPluginService({ nodePath: 'node.exe', dshEntry: 'dsh.js', dshHome: join(baseDir, 'dsh-home'), env: { PATH: 'C:/bin' }, runDumpConfigImpl: async () => [] })
    const res = await svc.remove('@deepseek-ai/dsh-base', null)
    expect(res.ok).toBe(false)
    expect(res.output).toContain('核心组件')
  })

  it('remove 拒绝核心 bundle 行：按行 name 查 dump-config 归属（含无 scope 归一化）', async () => {
    // 用户传行 name（非 bundle 全名），行归属 dsh-web-app（无 scope 注释）
    const svc = createPluginService({
      nodePath: 'node.exe', dshEntry: 'dsh.js', dshHome: join(baseDir, 'dsh-home'), env: { PATH: 'C:/bin' },
      runDumpConfigImpl: async () => [
        { id: 'ui', name: '@deepseek-ai/dsh-web-app', bundle: 'dsh-web-app', disabled: false },
      ],
    })
    const res = await svc.remove('@deepseek-ai/dsh-web-app', null)
    expect(res.ok).toBe(false)
    expect(res.output).toContain('核心组件')
  })

  it('remove 非核心行放行：bundle 不在盒内 → 走 insert 清理分支', async () => {
    const svc = createPluginService({
      nodePath: 'node.exe', dshEntry: 'dsh.js', dshHome: join(baseDir, 'dsh-home'), env: { PATH: 'C:/bin' },
      runDumpConfigImpl: async () => [
        { id: 'pm', name: '@deepseek-ai/dsh-web-plugin-manager', bundle: 'dsh-web-plugin-manager', disabled: false },
      ],
    })
    const res = await svc.remove('@deepseek-ai/dsh-web-plugin-manager', null)
    expect(res.ok).toBe(true)
  })
})

describe('insert 行启停（bug 修复：未知行）', () => {
  let baseDir
  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'ps-insert-'))
    mkdirSync(join(baseDir, 'dsh-home', 'profiles', 'web'), { recursive: true })
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'package.json'), JSON.stringify({
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
    }))
    // 真实场景：insert 块在 patch，dump-config 输出该行（bundle 注释 = patch 路径）
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'cordis.patch.yml'),
      '# dsh-plugin-manager:managed:start\n- insert:\n    - id: dsh-plugin-marketplace\n      name: \'dsh-plugin-marketplace\'\n# dsh-plugin-manager:managed:end\n')
  })
  afterEach(() => { rmSync(baseDir, { recursive: true, force: true }) })

  function makeSvc(rows) {
    return createPluginService({
      nodePath: 'node.exe', dshEntry: 'dsh.js',
      dshHome: join(baseDir, 'dsh-home'), env: { PATH: 'C:/bin' },
      runDumpConfigImpl: async () => rows,
    })
  }

  it('禁用 insert 行移除 insert 块（不再报未知行）', async () => {
    const svc = makeSvc([{ id: 'dsh-plugin-marketplace', name: 'dsh-plugin-marketplace', bundle: 'cordis.patch.yml', disabled: false }])
    const res = await svc.setEnabled('dsh-plugin-marketplace', false)
    expect(res.ok).toBe(true)
    const patch = readFileSync(svc.patchPath(), 'utf8')
    expect(patch).not.toContain('dsh-plugin-marketplace')
  })

  it('启用 insert 行重新写入 insert 块', async () => {
    // 先禁用（块被移除），再启用（块重写）
    const svc = makeSvc([{ id: 'dsh-plugin-marketplace', name: 'dsh-plugin-marketplace', bundle: 'cordis.patch.yml', disabled: false }])
    await svc.setEnabled('dsh-plugin-marketplace', false)
    const res = await svc.setEnabled('dsh-plugin-marketplace', true)
    expect(res.ok).toBe(true)
    const patch = readFileSync(svc.patchPath(), 'utf8')
    expect(patch).toContain("name: 'dsh-plugin-marketplace'")
  })
})
