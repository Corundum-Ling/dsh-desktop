/**
 * Controlled editing of a profile's cordis.patch.yml.
 * 移植自 dsh-web-plugin-manager（MIT），逐字保留 managed-block 语义：
 *
 *   # dsh-plugin-manager:managed:start
 *   - id: <entryId>
 *     disabled: true
 *   # dsh-plugin-manager:managed:end
 *
 * YAML 陷阱（上游实测）：
 *  - 空数组文档行 `[]` 必须丢弃，否则成为两文档 YAML 启动失败
 *  - `@` 开头包名必须单引号（裸 @ 是 YAML 保留指示符）
 *  - 删除后无 patch 行（仅注释/空行）时恢复官方 `[]` 模板（否则 HMR 失败）
 */

import { readFileSync, writeFileSync, existsSync, renameSync, rmSync } from 'node:fs'

const START = '# dsh-plugin-manager:managed:start'
const END = '# dsh-plugin-manager:managed:end'

const EMPTY_TEMPLATE = '[]\n'

export function assertSafeEntryId(id) {
  if (!/^[A-Za-z0-9._/-]+$/.test(id) || id.length > 120) {
    throw new Error(`unsafe entry id: ${JSON.stringify(id)}`)
  }
}

export function assertSafePackageName(name) {
  if (name.length === 0 || name.length > 200 || /[\x00-\x1f\x7f]/.test(name)) {
    throw new Error(`unsafe package name: ${JSON.stringify(name)}`)
  }
}

export function yamlQuote(value) {
  return `'${value.replace(/'/g, "''")}'`
}

export function readInsertRows(content) {
  const rows = []
  const lines = content.split('\n')
  let inManaged = false
  let inInsert = false
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed === START) { inManaged = true; continue }
    if (trimmed === END) { inManaged = false; continue }
    if (trimmed === 'insert:' || trimmed.startsWith('- insert:')) {
      inInsert = true
      continue
    }
    if (!inInsert) continue
    if (/^- id:/.test(trimmed) && !line.startsWith('    ')) {
      inInsert = false
      continue
    }
    const idMatch = /^(\s*)- id:\s*([^\s]+)/.exec(line)
    if (idMatch === null) continue
    let name = idMatch[2]
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j]
      if (/^(\s*)- id:/.test(next.trim()) && !next.startsWith('    ')) break
      const nameMatch = /name:\s*(.+)/.exec(next.trim())
      if (nameMatch !== null) {
        name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '')
        break
      }
    }
    rows.push({ id: idMatch[2], name, managed: inManaged })
  }
  return rows
}

export function hasManagedDisable(patchPath, entryId) {
  if (!existsSync(patchPath)) return false
  const lines = readFileSync(patchPath, 'utf8').split('\n')
  let blockStart = -1
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trimEnd() === START) { blockStart = i; continue }
    if (line.trimEnd() === END) { blockStart = -1; continue }
    if (blockStart < 0) continue
    const block = scanBlock(lines, blockStart)
    return block !== undefined && block.kind === 'disable' && block.id === entryId
  }
  return false
}

export function addDisableBlock(content, entryId) {
  assertSafeEntryId(entryId)
  const lines = content.length === 0 ? [] : content.split('\n')
  const without = removeManagedBlocks(lines, entryId).lines
  const block = [START, `- id: ${entryId}`, '  disabled: true', END]
  return joinDocument(without, block)
}

export function removeDisableBlock(content, entryId) {
  assertSafeEntryId(entryId)
  const lines = content.length === 0 ? [] : content.split('\n')
  const { lines: without } = removeManagedBlocks(lines, entryId)
  return normalizeDocument(without)
}

function rowIdPattern(entryId) {
  return entryId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function topRowPattern(entryId) {
  return new RegExp('^-\\s*id:\\s*' + rowIdPattern(entryId) + '\\s*$')
}

export function applyRowEnabled(content, entryId) {
  assertSafeEntryId(entryId)
  const lines = content.length === 0 ? [] : content.split('\n')
  const pattern = topRowPattern(entryId)
  const out = []
  let changed = false
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (pattern.test(line)) {
      out.push(line)
      i += 1
      const children = []
      while (i < lines.length && lines[i].startsWith(' ')) {
        const child = lines[i]
        if (/^\s*disabled:\s*(true|false)/.test(child)) {
          changed = true
          i += 1
          continue
        }
        children.push(child)
        i += 1
      }
      if (children.length === 0) {
        out.pop()
      } else {
        out.push(...children)
      }
      continue
    }
    out.push(line)
    i += 1
  }
  return changed ? { content: normalizeDocument(out), changed: true } : { content, changed: false }
}

export function applyRowDisabled(content, entryId) {
  assertSafeEntryId(entryId)
  const lines = content.length === 0 ? [] : content.split('\n')
  const pattern = topRowPattern(entryId)
  const out = []
  let changed = false
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (pattern.test(line)) {
      out.push(line)
      i += 1
      let disabledSeen = false
      while (i < lines.length && lines[i].startsWith(' ')) {
        const child = lines[i]
        if (/^\s*disabled:\s*(true|false)/.test(child)) {
          out.push('  disabled: true')
          disabledSeen = true
          changed = true
          i += 1
          continue
        }
        out.push(child)
        i += 1
      }
      if (!disabledSeen) {
        out.push('  disabled: true')
        changed = true
      }
      continue
    }
    out.push(line)
    i += 1
  }
  return changed ? { content: out.join('\n') + '\n', changed: true } : { content, changed: false }
}

export function addInsertRow(content, rowId, name) {
  assertSafeEntryId(rowId)
  assertSafePackageName(name)
  const lines = content.length === 0 ? [] : content.split('\n')
  const without = removeManagedBlocks(lines, rowId).lines
  const block = [
    START,
    '- insert:',
    `    - id: ${rowId}`,
    `      name: ${yamlQuote(name)}`,
    END,
  ]
  return joinDocument(without, block)
}

export function removeInsertRow(content, rowId) {
  assertSafeEntryId(rowId)
  const lines = content.length === 0 ? [] : content.split('\n')
  const { lines: without, removed } = removeManagedBlocks(lines, rowId)
  if (!removed) return { content, removed: false }
  return { content: normalizeDocument(without), removed: true }
}

function scanBlock(lines, start) {
  let kind = 'disable'
  let id
  for (let j = start + 1; j < lines.length; j += 1) {
    const line = lines[j]
    const trimmed = line.trim()
    if (trimmed === END) break
    if (trimmed === 'insert:' || trimmed.startsWith('- insert:')) kind = 'insert'
    if (kind === 'insert') {
      const match = /^\s{4}- id:\s*(.+?)\s*$/.exec(line)
      if (match !== null) id = match[1]
    } else {
      const match = /^-\s*id:\s*(.+?)\s*$/.exec(line)
      if (match !== null) id = match[1]
    }
  }
  return kind !== undefined && id !== undefined ? { kind, id } : undefined
}

function removeManagedBlocks(lines, entryId) {
  const out = []
  let removed = false
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trimEnd() === START) {
      let j = i + 1
      while (j < lines.length && lines[j].trimEnd() !== END) j += 1
      if (j >= lines.length) break
      const block = scanBlock(lines, i)
      if (block !== undefined && block.id === entryId) {
        i = j + 1
        removed = true
        continue
      }
      out.push(...lines.slice(i, j + 1))
      i = j + 1
      continue
    }
    out.push(line)
    i += 1
  }
  return { lines: out, removed }
}

function joinDocument(base, block) {
  const significant = base.filter(l => l.trim() !== '[]' && l.trim() !== '')
  const joined = [...significant, ...block].join('\n')
  return joined.endsWith('\n') ? joined : joined + '\n'
}

function normalizeDocument(lines) {
  const significant = lines.filter(l => l.trim() !== '[]' && l.trim() !== '')
  const text = significant.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
  const hasRow = text.split('\n').some(
    l => /^- id:/.test(l) || /^- insert:/.test(l) || /^insert:/.test(l),
  )
  return hasRow ? text : EMPTY_TEMPLATE
}

export function writePatch(patchPath, content) {
  const tmp = patchPath + '.tmp'
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, patchPath)
  try { rmSync(tmp, { force: true }) } catch { /* best-effort */ }
}