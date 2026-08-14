import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  readInsertRows, hasManagedDisable,
  addDisableBlock, removeDisableBlock,
  applyRowEnabled, applyRowDisabled,
  removeInsertRow, writePatch, addInsertRow,
} from './patch-manager.js'
import { runDumpConfig as defaultDump } from './dump-config.js'

export function createPluginService({ nodePath, dshEntry, dshHome, env, profile = 'web', runDumpConfigImpl = defaultDump, timeoutMs = 30000 }) {
  const profileDir = join(dshHome, 'profiles', profile)
  const patchPath = () => join(profileDir, 'cordis.patch.yml')

  function readBundles() {
    const pkgFile = join(profileDir, 'package.json')
    if (!existsSync(pkgFile)) return []
    try {
      return JSON.parse(readFileSync(pkgFile, 'utf8')).dsh?.profile?.bundles ?? []
    } catch {
      return []
    }
  }

  function readPatch() {
    const p = patchPath()
    return existsSync(p) ? readFileSync(p, 'utf8') : '[]\n'
  }

  async function list() {
    const [rows, insertRows] = await Promise.all([
      runDumpConfigImpl({ nodePath, dshEntry, dshHome, profile, env, timeoutMs }),
      Promise.resolve(readInsertRows(readPatch())),
    ])
    return { rows, inserts: insertRows, bundles: readBundles() }
  }

  function isPatchTopRow(entryId) {
    const escaped = entryId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp('^-\\s*id:\\s*' + escaped + '\\s*$')
    return readPatch().split('\n').some(line => pattern.test(line))
  }

  async function setEnabled(entryId, enabled) {
    const { rows, inserts } = await list()
    const row = rows.find(r => r.id === entryId)
    const insert = inserts.find(i => i.id === entryId)
    const patch = readPatch()
    // 归属判断：bundle 行（dump-config 中有 bundle 注释）→ managed disable 块；
    // 用户手写行（patch 顶层行，bundle 为空）→ applyRow 系列
    const isBundleRow = row !== undefined && !insert && row.bundle !== ''
    const isUserRow = !insert && (
      (row !== undefined && row.bundle === '') ||
      isPatchTopRow(entryId)
    )

    if (isBundleRow) {
      const next = enabled
        ? removeDisableBlock(patch, entryId)
        : addDisableBlock(patch, entryId)
      writePatch(patchPath(), next)
      return { ok: true, output: enabled ? '已启用' : '已禁用' }
    }
    if (isUserRow) {
      const res = enabled
        ? applyRowEnabled(patch, entryId)
        : applyRowDisabled(patch, entryId)
      if (!res.changed) return { ok: false, output: `行 ${entryId} 不在 patch 中` }
      writePatch(patchPath(), res.content)
      return { ok: true, output: enabled ? '已启用' : '已禁用' }
    }
    return { ok: false, output: `未知行: ${entryId}` }
  }

  async function removeInsert(rowId) {
    const patch = readPatch()
    const { content, removed } = removeInsertRow(patch, rowId)
    if (!removed) return { ok: false, output: `insert 行 ${rowId} 不存在` }
    writePatch(patchPath(), content)
    return { ok: true, output: '已移除' }
  }

  const IN_BOX = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-headless']

  /** 读取已安装包 manifest；isBundle = 有 dsh.bundle 字段 */
  function readInstalledPackage(name) {
    const pkgFile = join(profileDir, 'node_modules', name, 'package.json')
    if (!existsSync(pkgFile)) return null
    try {
      return JSON.parse(readFileSync(pkgFile, 'utf8'))
    } catch {
      return null
    }
  }

  async function install(spec, pm) {
    const res = await pm.installPlugin(spec)
    if (!res.ok) return { ok: false, output: res.output, needsRestart: false }
    // 从输出/依赖猜测包名：spec 去掉 npm scope 前缀取尾段，或读依赖 diff
    const name = guessInstalledName(spec)
    const pkg = name ? readInstalledPackage(name) : null
    if (pkg && pkg.dsh?.bundle) {
      return { ok: true, output: res.output, needsRestart: true }
    }
    if (pkg) {
      // 非 bundle：写 insert 行实时挂载
      const patch = readPatch()
      writePatch(patchPath(), addInsertRow(patch, pkg.name, pkg.name))
      return { ok: true, output: res.output, needsRestart: false }
    }
    return { ok: true, output: res.output, needsRestart: true } // 未知类型，保守重启
  }

  function guessInstalledName(spec) {
    const clean = spec.split(':').pop().split('#')[0].trim()
    return clean
  }

  async function remove(name, pm) {
    if (IN_BOX.includes(name)) {
      return { ok: false, output: `${name} 是核心组件，不可卸载`, needsRestart: false }
    }
    // 先清 insert 行（若有），再走官方 remove
    const insert = readInsertRows(readPatch()).find(i => i.name === name)
    if (insert) {
      const { content, removed } = removeInsertRow(readPatch(), insert.id)
      if (removed) writePatch(patchPath(), content)
    }
    if (!pm) return { ok: true, output: 'insert 行已移除', needsRestart: false }
    const res = await pm.removePlugin(name)
    return { ok: res.ok, output: res.output, needsRestart: true }
  }

  return { list, setEnabled, removeInsert, install, remove, patchPath, readBundles }
}
