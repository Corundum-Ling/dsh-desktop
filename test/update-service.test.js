import { describe, expect, it } from 'vitest'
import { createConfig } from '../src/main/services/config.js'
import { createUpdateService, CHECK_INTERVAL_MS, RELEASES_URL, parseVersion } from '../src/main/services/update-service.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function setup(version = '0.1.0') {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-update-'))
  return { dir, config: createConfig(dir), service: null, version }
}

describe('update service', () => {
  it('比较严格的三段版本号', () => {
    expect(parseVersion('v0.1.1')).toEqual([0, 1, 1])
    expect(parseVersion('0.1.1-rc.1')).toBeNull()
  })

  it('发现稳定的新版本', async () => {
    const { dir, config } = setup()
    const service = createUpdateService({
      currentVersion: '0.1.0', config,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ tag_name: 'v0.1.1', html_url: 'https://github.com/Corundum-Ling/dsh-desktop/releases/tag/v0.1.1', draft: false, prerelease: false }) }),
    })
    await expect(service.check({ force: true })).resolves.toMatchObject({ status: 'available' })
    rmSync(dir, { recursive: true, force: true })
  })

  it('忽略草稿、预发布和不安全 URL', async () => {
    for (const release of [
      { tag_name: 'v0.1.1', html_url: 'https://github.com/Corundum-Ling/dsh-desktop/releases/tag/v0.1.1', draft: true, prerelease: false },
      { tag_name: 'v0.1.1', html_url: 'https://github.com/Corundum-Ling/dsh-desktop/releases/tag/v0.1.1', draft: false, prerelease: true },
      { tag_name: 'v0.1.1', html_url: 'https://evil.example/update', draft: false, prerelease: false },
    ]) {
      const { dir, config } = setup()
      const service = createUpdateService({ currentVersion: '0.1.0', config, fetchImpl: async () => ({ ok: true, status: 200, json: async () => release }) })
      await expect(service.check({ force: true })).resolves.toMatchObject({ status: 'none' })
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('自动检查在 24 小时内节流，手动检查可强制执行', async () => {
    const { dir, config } = setup()
    let calls = 0
    let current = 100_000
    const service = createUpdateService({ currentVersion: '0.1.0', config, now: () => current, fetchImpl: async () => { calls += 1; return { ok: true, status: 200, json: async () => ({ tag_name: 'v0.1.0', html_url: 'https://github.com/Corundum-Ling/dsh-desktop/releases/tag/v0.1.0' }) } } })
    await service.check({ force: true })
    expect(await service.check()).toEqual({ status: 'skipped' })
    current += CHECK_INTERVAL_MS + 1
    await service.check()
    expect(calls).toBe(2)
    expect(config.get('lastUpdateCheckAt')).toBe(current)
    rmSync(dir, { recursive: true, force: true })
  })

  it('记录跳过版本', async () => {
    const { dir, config } = setup()
    const service = createUpdateService({ currentVersion: '0.1.0', config, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ tag_name: 'v0.1.1', html_url: 'https://github.com/Corundum-Ling/dsh-desktop/releases/tag/v0.1.1' }) }) })
    service.ignore('v0.1.1')
    await expect(service.check({ force: true })).resolves.toMatchObject({ status: 'ignored' })
    rmSync(dir, { recursive: true, force: true })
  })

  it('网络失败后仍限制自动重试频率', async () => {
    const { dir, config } = setup()
    let calls = 0
    const service = createUpdateService({
      currentVersion: '0.1.0', config, now: () => CHECK_INTERVAL_MS + 1,
      fetchImpl: async () => { calls += 1; throw new Error('offline') },
    })
    await expect(service.check()).resolves.toMatchObject({ status: 'error' })
    await expect(service.check()).resolves.toEqual({ status: 'skipped' })
    expect(calls).toBe(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it('使用固定 GitHub API 地址', () => {
    expect(RELEASES_URL).toBe('https://api.github.com/repos/Corundum-Ling/dsh-desktop/releases/latest')
  })
})
