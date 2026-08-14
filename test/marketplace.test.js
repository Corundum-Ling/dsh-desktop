import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parsePluginsMd, createMarketplace } from '../src/marketplace.js'

const FIXTURE = `# PLUGINS.md — 插件登记清单（分类版）

## 🔌 单插件

| 插件 | 仓库 | 说明 | 运行级 |
| dsh-event-auditor | [qing3a/dsh-event-auditor](https://github.com/qing3a/dsh-event-auditor) | 事件审计 | ✅ |
| dsh-sentinel | [fuhefei/dsh-sentinel](https://github.com/fuhefei/dsh-sentinel) | 传感器 | 待测 |

## 🧰 插件集

| 插件 | 仓库 | 说明 | 运行级 |
| dsh-ui-all | [linxin666/dsh-web-ui-all](https://github.com/linxin666/dsh-web-ui-all) | UI 集合 | ✅ |
`

describe('parsePluginsMd', () => {
  it('解析表格行与分类', () => {
    const plugins = parsePluginsMd(FIXTURE)
    expect(plugins).toEqual([
      { name: 'dsh-event-auditor', repo: 'qing3a/dsh-event-auditor', description: '事件审计', verified: true, category: '🔌 单插件' },
      { name: 'dsh-sentinel', repo: 'fuhefei/dsh-sentinel', description: '传感器', verified: false, category: '🔌 单插件' },
      { name: 'dsh-ui-all', repo: 'linxin666/dsh-web-ui-all', description: 'UI 集合', verified: true, category: '🧰 插件集' },
    ])
  })
})

describe('createMarketplace', () => {
  let cacheDir
  beforeEach(() => { cacheDir = mkdtempSync(join(tmpdir(), 'mk-')) })
  afterEach(() => { rmSync(cacheDir, { recursive: true, force: true }) })

  const fetched = () => ({
    plugins: [{ name: 'p1', repo: 'a/b', description: 'd', verified: true, category: '🔌' }],
    fetchedAt: Date.now(), fromCache: false,
  })

  it('首次 get 走 fetch 并写缓存', async () => {
    const fetchImpl = async () => FIXTURE
    const mk = createMarketplace({ fetchImpl, cacheDir })
    const r = await mk.get()
    expect(r.plugins.length).toBe(3)
    expect(existsSync(join(cacheDir, 'marketplace.json'))).toBe(true)
  })

  it('缓存未过期时复用缓存', async () => {
    let calls = 0
    const fetchImpl = async () => { calls += 1; return FIXTURE }
    const mk = createMarketplace({ fetchImpl, cacheDir })
    await mk.get()
    await mk.get()
    expect(calls).toBe(1)
    expect((await mk.get()).fromCache).toBe(true)
  })

  it('refresh=true 强制重新 fetch', async () => {
    let calls = 0
    const fetchImpl = async () => { calls += 1; return FIXTURE }
    const mk = createMarketplace({ fetchImpl, cacheDir })
    await mk.get()
    await mk.get(true)
    expect(calls).toBe(2)
  })

  it('fetch 失败时返回缓存旧数据（降级）', async () => {
    const fetchImpl = async () => { throw new Error('network') }
    const mk = createMarketplace({ fetchImpl, cacheDir })
    const r1 = await mk.get()
    expect(r1.error).toBe('network')
  })
})
