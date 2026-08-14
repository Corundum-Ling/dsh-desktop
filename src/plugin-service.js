import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  readInsertRows, hasManagedDisable,
  addDisableBlock, removeDisableBlock,
  applyRowEnabled, applyRowDisabled,
  removeInsertRow, writePatch,
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

  return { list, setEnabled, removeInsert, patchPath, readBundles }
}
