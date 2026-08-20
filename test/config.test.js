import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConfig } from '../src/main/services/config.js'

describe('createConfig', () => {
  let baseDir

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'dsh-config-'))
  })

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true })
  })

  it('get 未设置时返回 fallback', () => {
    const cfg = createConfig(baseDir)
    expect(cfg.get('port', 3080)).toBe(3080)
  })

  it('set 后 get 能读回', () => {
    const cfg = createConfig(baseDir)
    cfg.set('port', 3099)
    expect(createConfig(baseDir).get('port')).toBe(3099)
  })

  it('lastProfile 可跨进程配置实例持久化', () => {
    const cfg = createConfig(baseDir)
    cfg.set('lastProfile', 'desktop')
    expect(createConfig(baseDir).get('lastProfile', 'web')).toBe('desktop')
  })

  it('set 持久化到 config.json 文件', () => {
    const cfg = createConfig(baseDir)
    cfg.set('port', 3099)
    const raw = JSON.parse(readFileSync(join(baseDir, 'config.json'), 'utf8'))
    expect(raw.port).toBe(3099)
  })

  it('dshHome 与 logsDir 返回固定子路径', () => {
    const cfg = createConfig(baseDir)
    expect(cfg.dshHome()).toBe(join(baseDir, 'dsh-home'))
    expect(cfg.logsDir()).toBe(join(baseDir, 'logs'))
  })
})
