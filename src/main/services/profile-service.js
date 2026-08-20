import { readdirSync, readFileSync, writeFileSync, existsSync, rmSync, cpSync, renameSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'

function copyProfileFiles(source, destination) {
  cpSync(source, destination, {
    recursive: true,
    filter: path => basename(path) !== 'node_modules',
  })
}

const PROFILE_PATCH_TEMPLATE = `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries.
[]
`

const PROFILE_PNPM_WORKSPACE = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
`

function assertProfileName(name) {
  if (!/^[A-Za-z0-9_-]+$/.test(name) || name.toLowerCase() === 'node_modules') throw new Error(`非法 profile 名: ${name}`)
}

export function createProfileService({ dshHome }) {
  const profilesDir = join(dshHome, 'profiles')

  function listProfiles() {
    if (!existsSync(profilesDir)) return []
    return readdirSync(profilesDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name.toLowerCase() !== 'node_modules')
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
    assertProfileName(name)
    const dest = join(profilesDir, name)
    if (existsSync(dest)) throw new Error(`profile 已存在: ${name}`)
    const bundles = template === 'headless'
      ? ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless']
      : ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']
    const manifest = {
      name: `dsh-profile-${name}`,
      private: true,
      dependencies: {},
      dsh: { profile: { bundles } },
    }
    mkdirSync(dest, { recursive: true })
    writeFileSync(join(dest, 'package.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    writeFileSync(join(dest, 'cordis.patch.yml'), PROFILE_PATCH_TEMPLATE, 'utf8')
    writeFileSync(join(dest, 'pnpm-workspace.yaml'), PROFILE_PNPM_WORKSPACE, 'utf8')
    return { ok: true }
  }

  function renameProfile(oldName, newName) {
    assertProfileName(oldName)
    assertProfileName(newName)
    const src = join(profilesDir, oldName)
    const dest = join(profilesDir, newName)
    if (!existsSync(src)) throw new Error(`profile 不存在: ${oldName}`)
    if (existsSync(dest)) throw new Error(`profile 已存在: ${newName}`)
    renameSync(src, dest)
    return { ok: true }
  }

  function removeProfile(name) {
    assertProfileName(name)
    const dir = join(profilesDir, name)
    if (!existsSync(dir)) throw new Error(`profile 不存在: ${name}`)
    rmSync(dir, { recursive: true, force: true })
    return { ok: true }
  }

  function copyProfile(from, to) {
    assertProfileName(from)
    assertProfileName(to)
    const src = join(profilesDir, from)
    const dest = join(profilesDir, to)
    if (!existsSync(src)) throw new Error(`profile 不存在: ${from}`)
    if (existsSync(dest)) throw new Error(`profile 已存在: ${to}`)
    copyProfileFiles(src, dest)
    return { ok: true }
  }

  return { listProfiles, createProfile, renameProfile, removeProfile, copyProfile }
}
