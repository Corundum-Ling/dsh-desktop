import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const TYPE_LABELS = {
  plugin: '插件',
  skill: 'Skill',
  bundle: '插件集',
  client: '客户端',
  tool: '工具',
  unknown: '待确认',
}

function isRepositorySlug(value) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)
}

function classifyEntry({ name = '', category = '', description = '' }) {
  const text = `${name} ${category} ${description}`.toLowerCase()
  if (category.includes('技能包') || /\bskills?\b|技能包|技能集/.test(text)) return 'skill'
  if (/终端与桌面端|客户端|桌面端|桌面版|移动端|安卓|\btui\b|terminal-native/.test(text)) return 'client'
  if (/插件集|plugin suite|\bbundle\b|\bpreset\b|预设/.test(text)) return 'bundle'
  if (/mcp|外部工具|独立工具|服务端|api 服务/.test(text) && !/插件|plugin/.test(text)) return 'tool'
  if (/插件|plugin|主题|皮肤|web ui|界面增强/.test(text)) return 'plugin'
  return 'unknown'
}

function addType(entry) {
  const type = entry.type || classifyEntry(entry)
  return {
    ...entry,
    type,
    typeLabel: TYPE_LABELS[type] || TYPE_LABELS.unknown,
    installable: ['plugin', 'skill', 'bundle'].includes(type),
  }
}

/** 解析插件清单：兼容旧版 Markdown 表格和 PLUGINS-ALL.md 条目格式。 */
export function parsePluginsMd(content) {
  const plugins = []
  let category = ''
  const lines = content.split('\n')
  for (const line of lines) {
    const catMatch = /^##\s+(.+)$/.exec(line.trim())
    if (catMatch !== null) {
      category = catMatch[1].trim().replace(/\s*[（(][\d,]+[）)]\s*$/, '')
      continue
    }

    const fullMatch = /^-\s+(?:`\[([^\]]+)\]`\s+)?(?:\*\*)?\[([^\]]+)\]\((https?:\/\/github\.com\/([^/)\s]+\/[^/)\s]+)\/?)\)(?:\s+([\d,]+))?\s+—\s+(.+)$/.exec(line.trim())
    if (fullMatch !== null) {
      const [, verdict = '', name, , repo, stars = '0', description] = fullMatch
      if (!isRepositorySlug(repo)) continue
      plugins.push(addType({
        name,
        repo,
        description,
        verified: verdict === '可用',
        verdict: verdict || '未测',
        stars: Number(stars.replaceAll(',', '')),
        category,
      }))
      continue
    }

    if (!line.startsWith('|')) continue
    const cells = line.split('|').map(c => c.trim())
    if (cells.length < 5) continue
    const [name, repoCell, description, status] = [cells[1], cells[2], cells[3], cells[4]]
    if (!name || !repoCell || name === '插件') continue // 跳过表头
    const repoMatch = /\[([^\]]+)\]/.exec(repoCell)
    if (repoMatch === null) continue
    if (!isRepositorySlug(repoMatch[1])) continue
    plugins.push(addType({
      name,
      repo: repoMatch[1],
      description: description ?? '',
      verified: status === '✅',
      verdict: status === '✅' ? '可用' : '待测',
      stars: null,
      category,
    }))
  }
  return plugins
}

/** 市场服务：PLUGINS-ALL.md + 24h 磁盘缓存 */
export function createMarketplace({ fetchImpl, cacheDir, ttlMs = 24 * 3600 * 1000 }) {
  const cacheFile = join(cacheDir, 'marketplace.json')

  function readCache() {
    if (!existsSync(cacheFile)) return null
    try {
      const cached = JSON.parse(readFileSync(cacheFile, 'utf8'))
      if (Array.isArray(cached.plugins)) cached.plugins = cached.plugins.map(addType)
      return cached
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
