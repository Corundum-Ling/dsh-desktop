import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProfileService } from '../src/main/services/profile-service.js'

describe('createProfileService', () => {
  let baseDir
  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'pf-'))
    mkdirSync(join(baseDir, 'dsh-home', 'profiles', 'web'), { recursive: true })
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'package.json'), JSON.stringify({
      name: 'dsh-profile-web',
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    }))
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'cordis.patch.yml'), '[]\n')
  })
  afterEach(() => { rmSync(baseDir, { recursive: true, force: true }) })

  const svc = () => createProfileService({ dshHome: join(baseDir, 'dsh-home') })

  it('listProfiles 返回 profile 与 bundles', () => {
    expect(svc().listProfiles()).toEqual([
      { name: 'web', bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] },
    ])
  })

  it('listProfiles 隐藏 pnpm 内部 node_modules 目录', () => {
    mkdirSync(join(baseDir, 'dsh-home', 'profiles', 'node_modules'), { recursive: true })
    expect(svc().listProfiles().map(profile => profile.name)).toEqual(['web'])
  })

  it('createProfile 以 web 为模板创建', () => {
    mkdirSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'node_modules'), { recursive: true })
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'node_modules', 'source-only'), '')
    svc().createProfile('work', 'web')
    const dir = join(baseDir, 'dsh-home', 'profiles', 'work')
    expect(existsSync(dir)).toBe(true)
    expect(existsSync(join(dir, 'cordis.patch.yml'))).toBe(true)
    expect(existsSync(join(dir, 'node_modules'))).toBe(false)
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(manifest.name).toBe('dsh-profile-work')
    expect(manifest.dependencies).toEqual({})
    expect(existsSync(join(dir, 'pnpm-lock.yaml'))).toBe(false)
  })

  it('renameProfile 改名', () => {
    svc().renameProfile('web', 'main')
    expect(existsSync(join(baseDir, 'dsh-home', 'profiles', 'web'))).toBe(false)
    expect(existsSync(join(baseDir, 'dsh-home', 'profiles', 'main'))).toBe(true)
  })

  it('removeProfile 删除目录', () => {
    svc().removeProfile('web')
    expect(existsSync(join(baseDir, 'dsh-home', 'profiles', 'web'))).toBe(false)
  })

  it('copyProfile 保留配置但不复制 node_modules', () => {
    mkdirSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'node_modules'), { recursive: true })
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'node_modules', 'x'), '')
    svc().copyProfile('web', 'backup')
    expect(existsSync(join(baseDir, 'dsh-home', 'profiles', 'backup', 'node_modules'))).toBe(false)
    expect(existsSync(join(baseDir, 'dsh-home', 'profiles', 'backup', 'cordis.patch.yml'))).toBe(true)
  })

  it('removeProfile 拒绝非法名（防越界删除）', () => {
    expect(() => svc().removeProfile('../evil')).toThrow(/非法/)
    expect(existsSync(join(baseDir, 'dsh-home', '..'))).toBe(true) // dsh-home 还在
  })

  it('所有 profile 操作拒绝保留名称 node_modules', () => {
    expect(() => svc().createProfile('node_modules')).toThrow(/非法/)
    expect(() => svc().copyProfile('web', 'node_modules')).toThrow(/非法/)
    expect(() => svc().renameProfile('web', 'node_modules')).toThrow(/非法/)
    expect(() => svc().removeProfile('node_modules')).toThrow(/非法/)
  })

  it('createProfile 覆盖默认 bundles（spec §4.5：web 模板 → web-app，headless 模板 → headless）', () => {
    mkdirSync(join(baseDir, 'dsh-home', 'profiles', 'headless'), { recursive: true })
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'headless', 'package.json'), JSON.stringify({
      name: 'dsh-profile-headless',
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } }, // 模板 bundles 故意不完整，验证被覆盖
    }))
    svc().createProfile('work', 'web')
    const web = JSON.parse(readFileSync(join(baseDir, 'dsh-home', 'profiles', 'work', 'package.json'), 'utf8'))
    expect(web.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    svc().createProfile('hl', 'headless')
    const hl = JSON.parse(readFileSync(join(baseDir, 'dsh-home', 'profiles', 'hl', 'package.json'), 'utf8'))
    expect(hl.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'])
  })

  it('createProfile 不依赖现有 web profile 内容', () => {
    writeFileSync(join(baseDir, 'dsh-home', 'profiles', 'web', 'package.json'), 'not-json{')
    expect(() => svc().createProfile('work', 'web')).not.toThrow()
    expect(JSON.parse(readFileSync(join(baseDir, 'dsh-home', 'profiles', 'work', 'package.json'), 'utf8')).dependencies).toEqual({})
  })
})
