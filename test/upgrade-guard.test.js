import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createConfig } from '../src/main/services/config.js'
import { assertSafeStorage, createUpgradeGuard } from '../src/main/services/upgrade-guard.js'

describe('upgrade guard', () => {
  let baseDir
  let dshHome

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'dsh-upgrade-'))
    dshHome = join(baseDir, 'dsh-home')
    mkdirSync(join(dshHome, 'sessions'), { recursive: true })
    writeFileSync(join(dshHome, 'sessions', 'one.jsonl'), '{"id":"one"}\n')
    writeFileSync(join(dshHome, 'settings.yaml'), 'theme: dark\n')
  })

  afterEach(() => rmSync(baseDir, { recursive: true, force: true }))

  it('首次正式启动前创建快照并带文件校验信息', () => {
    const config = createConfig(baseDir)
    const guard = createUpgradeGuard({
      baseDir, dshHome, config, isPackaged: true, version: '0.1.1',
      now: () => new Date('2026-08-20T00:00:00.000Z'),
    })
    const result = guard.prepare()
    expect(result.skipped).toBe(false)
    expect(existsSync(join(result.snapshot.path, 'dsh-home', 'sessions', 'one.jsonl'))).toBe(true)
    const manifest = JSON.parse(readFileSync(join(result.snapshot.path, 'manifest.json'), 'utf8'))
    expect(manifest.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'dsh-home/sessions/one.jsonl', bytes: 13 }),
    ]))
    expect(existsSync(join(result.snapshot.path, 'dsh-home', 'node_modules'))).toBe(false)
  })

  it('成功标记后同版本不重复快照', () => {
    const config = createConfig(baseDir)
    const guard = createUpgradeGuard({ baseDir, dshHome, config, isPackaged: true, version: '0.1.1' })
    guard.prepare()
    guard.markSuccessful()
    expect(guard.prepare()).toEqual({ skipped: true, reason: 'already-verified' })
  })

  it('显式 SQLite 持久化配置会阻止升级且不修改数据', () => {
    writeFileSync(join(dshHome, 'cordis.patch.yml'), '- name: dsh-session-persistence-sqlite\n')
    expect(() => assertSafeStorage(dshHome)).toThrow(/不会自动迁移/)
    expect(readFileSync(join(dshHome, 'sessions', 'one.jsonl'), 'utf8')).toContain('one')
  })

  it('开发模式跳过快照', () => {
    const result = createUpgradeGuard({ baseDir, dshHome, config: createConfig(baseDir), isPackaged: false, version: '0.1.1' }).prepare()
    expect(result).toEqual({ skipped: true, reason: 'development' })
  })
})
