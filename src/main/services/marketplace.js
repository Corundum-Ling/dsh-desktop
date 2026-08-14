import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/** 解析 PLUGINS.md（Markdown 表格，列 = 插件 | 仓库[链接] | 说明 | ✅/待测） */
export function parsePluginsMd(content) {
  const plugins = []
  let category = ''
  const lines = content.split('\n')
  for (const line of lines) {
    const catMatch = /^##\s+(.+)$/.exec(line.trim())
    if (catMatch !== null) { category = catMatch[1].trim(); continue }
    if (!line.startsWith('|')) continue
    const cells = line.split('|').map(c => c.trim())
    if (cells.length < 5) continue
    const [name, repoCell, description, status] = [cells[1], cells[2], cells[3], cells[4]]
    if (!name || !repoCell || name === '插件') continue // 跳过表头
    const repoMatch = /\[([^\]]+)\]/.exec(repoCell)
    if (repoMatch === null) continue
    plugins.push({
      name,
      repo: repoMatch[1],
      description: description ?? '',
      verified: status === '✅',
      category,
    })
  }
  return plugins
}

/** 市场服务：PLUGINS.md + 24h 磁盘缓存 */
export function createMarketplace({ fetchImpl, cacheDir, ttlMs = 24 * 3600 * 1000 }) {
  const cacheFile = join(cacheDir, 'marketplace.json')

  function readCache() {
    if (!existsSync(cacheFile)) return null
    try {
      return JSON.parse(readFileSync(cacheFile, 'utf8'))
    } catch {
      return null
    }
  }

  async function get(refresh = false) {
    const cached = readCache()
    const fresh = cached && Date.now() - cached.fetchedAt < ttlMs
    if (fresh && !refresh) {
      return { ...cached, fromCache: true }
    }
    try {
      const content = await fetchImpl()
      const plugins = parsePluginsMd(content)
      const payload = { plugins, fetchedAt: Date.now() }
      mkdirSync(cacheDir, { recursive: true })
      writeFileSync(cacheFile, JSON.stringify(payload), 'utf8')
      return { ...payload, fromCache: false }
    } catch (err) {
      if (cached) return { ...cached, fromCache: true, stale: true }
      return { plugins: [], fetchedAt: 0, fromCache: false, error: String(err.message ?? err) }
    }
  }

  return { get }
}
