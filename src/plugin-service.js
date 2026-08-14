import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  readInsertRows, hasManagedDisable,
  addDisableBlock, removeDisableBlock,
  applyRowEnabled, applyRowDisabled,
  removeInsertRow, writePatch, addInsertRow,
} from './patch-manager.js'
import { runDumpConfig as defaultDump } from './dump-config.js'

export function createPluginService({ nodePath, dshEntry, dshHome, env, profile = () => 'web', runDumpConfigImpl = defaultDump, timeoutMs = 30000 }) {
  // profile 改为函数参数：切换 profile 后无需重建 service，取值即最新
  const profileDir = () => join(dshHome, 'profiles', profile())
  const patchPath = () => join(profileDir(), 'cordis.patch.yml')

  function readBundles() {
    const pkgFile = join(profileDir(), 'package.json')
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
      runDumpConfigImpl({ nodePath, dshEntry, dshHome, profile: profile(), env, timeoutMs }),
      Promise.resolve(readInsertRows(readPatch())),
    ])
    return { rows: rows.map(r => ({ ...r, core: isCoreBundle(r.bundle) })), inserts: insertRows, bundles: readBundles() }
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

    // insert 行（非 bundle 插件）：patch 有 insert 块（insert 命中）或
    // dump 显示它是 patch 挂载行（bundle 注释 = patch 路径，实测格式
    // `# == ...\cordis.patch.yml`）都按 insert 行处理——禁用 = 移除 insert 块
    // （HMR 实时卸载），启用 = 重写 insert 块（HMR 实时挂载）
    const isPatchPathBundle = row !== undefined && /cordis\.patch\.yml$/.test(row.bundle)
    if (insert || isPatchPathBundle) {
      if (enabled) {
        const name = insert?.name ?? row?.name ?? entryId
        writePatch(patchPath(), addInsertRow(patch, entryId, name))
      } else {
        if (!insert) return { ok: true, output: '已禁用（无 insert 块可移除）' }
        const { content, removed } = removeInsertRow(patch, insert.id)
        if (!removed) return { ok: false, output: `insert 行 ${entryId} 不存在` }
        writePatch(patchPath(), content)
      }
      return { ok: true, output: enabled ? '已启用' : '已禁用' }
    }
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

  /** 核心判定：bundle 名可能无 scope（dump-config 注释为 dsh-web-app），归一化匹配 */
  function isCoreBundle(bundle) {
    return IN_BOX.some(b => bundle === b || bundle === b.split('/').pop())
  }

  /** 读取已安装包 manifest；isBundle = 有 dsh.bundle 字段 */
  function readInstalledPackage(name) {
    const pkgFile = join(profileDir(), 'node_modules', name, 'package.json')
    if (!existsSync(pkgFile)) return null
    try {
      return JSON.parse(readFileSync(pkgFile, 'utf8'))
    } catch {
      return null
    }
  }

  /** 读取当前 profile 的依赖表（install 后 pnpm 写入的 diff 即真实包名来源） */
  function readDeps() {
    try {
      return JSON.parse(readFileSync(join(profileDir(), 'package.json'), 'utf8')).dependencies ?? {}
    } catch {
      return {}
    }
  }

  /** 解析安装 spec 对应的真实包名：直接命中 → 剥离 :# → 依赖值匹配 */
  function resolveInstalledName(spec) {
    const deps = readDeps()
    if (typeof deps[spec] === 'string') return spec
    const clean = spec.split(':').pop().split('#')[0].trim()
    if (typeof deps[clean] === 'string') return clean
    return Object.keys(deps).find(k => deps[k] === spec || deps[k]?.includes(clean)) ?? null
  }

  /** entry id 安全化：scoped 名（@scope/pkg）→ scope-pkg */
  function slugify(name) {
    return name.replace(/^@/, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  }

  async function install(spec, pm) {
    const res = await pm.installPlugin(spec)
    if (!res.ok) return { ok: false, output: res.output, needsRestart: false }
    // 从依赖 diff 解析真实包名：registry 直接命中 / git/scoped 按依赖值匹配
    const name = resolveInstalledName(spec)
    const pkg = name ? readInstalledPackage(name) : null
    if (pkg && pkg.dsh?.bundle) {
      return { ok: true, output: res.output, needsRestart: true }
    }
    if (pkg) {
      // 非 bundle（无 dsh.bundle manifest）：写 insert 行挂载。
      // ⚠️ 实测（2026-08-14）：dsh rc.6 对非 bundle insert 行不运行时激活——
      // host apply 不执行（路由 404）、client 不进 __DSH_BOOT__ 清单；
      // 加入 bundles 层栈则 fail-loud 拒绝（"declares no dsh.bundle"）。
      // insert 行保留（dsh 未来支持后自动生效），但如实提示当前不可用。
      try {
        const patch = readPatch()
        writePatch(patchPath(), addInsertRow(patch, slugify(pkg.name), pkg.name))
        return {
          ok: true,
          output: `${res.output}\n\n⚠️ 该插件为非 bundle 插件（无 dsh.bundle manifest）。实测当前 dsh 版本无法运行时激活非 bundle insert 插件（功能不可用）。已保留挂载配置，待 dsh 上游支持后自动生效。`,
          needsRestart: true,
        }
      } catch (err) {
        return { ok: true, output: `已安装依赖但实时挂载失败: ${err?.message ?? err}（可手动编辑 cordis.patch.yml 或重装）`, needsRestart: false }
      }
    }
    return { ok: true, output: res.output, needsRestart: true } // 未知类型，保守重启
  }

  async function remove(name, pm) {
    // 双重守卫：bundle 全名直接命中，或按行 name 查 dump-config 的 bundle 归属
    if (IN_BOX.includes(name) || await isCoreRow(name)) {
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

  /** 按行 name（或 id）查 dump-config，判断其 bundle 是否核心 */
  async function isCoreRow(name) {
    const rows = await runDumpConfigImpl({ nodePath, dshEntry, dshHome, profile: profile(), env, timeoutMs })
    const row = rows.find(r => r.name === name || r.id === name)
    return row !== undefined && isCoreBundle(row.bundle)
  }

  return { list, setEnabled, removeInsert, install, remove, patchPath, readBundles, IN_BOX, isCoreBundle }
}
