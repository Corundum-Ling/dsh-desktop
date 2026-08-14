import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPluginService } from '../src/plugin-service.js'

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
