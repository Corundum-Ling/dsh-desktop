import { readdirSync, readFileSync, writeFileSync, existsSync, rmSync, cpSync, renameSync } from 'node:fs'
import { join } from 'node:path'

export function createProfileService({ dshHome }) {
  const profilesDir = join(dshHome, 'profiles')

  function listProfiles() {
    if (!existsSync(profilesDir)) return []
    return readdirSync(profilesDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => {
        const pkgFile = join(profilesDir, e.name, 'package.json')
        let bundles = []
        if (existsSync(pkgFile)) {
          try {
            bundles = JSON.parse(readFileSync(pkgFile, 'utf8')).dsh?.profile?.bundles ?? []
          } catch { /* 忽略损坏 */ }
        }
        return { name: e.name, bundles }
      })
  }

  function createProfile(name, template = 'web') {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`非法 profile 名: ${name}`)
    const src = join(profilesDir, template)
    const dest = join(profilesDir, name)
    if (existsSync(dest)) throw new Error(`profile 已存在: ${name}`)
    if (!existsSync(src)) throw new Error(`模板 profile 不存在: ${template}`)
    // 先验证模板可解析，失败不留下孤儿目录
    const srcPkgFile = join(src, 'package.json')
    const srcPkg = JSON.parse(readFileSync(srcPkgFile, 'utf8'))
    cpSync(src, dest, { recursive: true })
    // 覆盖默认 bundles（spec §4.5）：headless 模板 → headless bundle，其余 → web-app
    if (!srcPkg.dsh) srcPkg.dsh = {}
    if (!srcPkg.dsh.profile) srcPkg.dsh.profile = {}
    srcPkg.dsh.profile.bundles = template === 'headless'
      ? ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless']
      : ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']
    // 改 name
    srcPkg.name = `dsh-profile-${name}`
    writeFileSync(join(dest, 'package.json'), JSON.stringify(srcPkg, null, 2) + '\n', 'utf8')
    return { ok: true }
  }

  function renameProfile(oldName, newName) {
    if (!/^[A-Za-z0-9_-]+$/.test(newName)) throw new Error(`非法 profile 名: ${newName}`)
    const src = join(profilesDir, oldName)
    const dest = join(profilesDir, newName)
    if (!existsSync(src)) throw new Error(`profile 不存在: ${oldName}`)
    if (existsSync(dest)) throw new Error(`profile 已存在: ${newName}`)
    renameSync(src, dest)
    return { ok: true }
  }

  function removeProfile(name) {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`非法 profile 名: ${name}`)
    const dir = join(profilesDir, name)
    if (!existsSync(dir)) throw new Error(`profile 不存在: ${name}`)
    rmSync(dir, { recursive: true, force: true })
    return { ok: true }
  }

  function copyProfile(from, to) {
    if (!/^[A-Za-z0-9_-]+$/.test(to)) throw new Error(`非法 profile 名: ${to}`)
    const src = join(profilesDir, from)
    const dest = join(profilesDir, to)
    if (!existsSync(src)) throw new Error(`profile 不存在: ${from}`)
    if (existsSync(dest)) throw new Error(`profile 已存在: ${to}`)
    cpSync(src, dest, { recursive: true })
    return { ok: true }
  }

  return { listProfiles, createProfile, renameProfile, removeProfile, copyProfile }
}
