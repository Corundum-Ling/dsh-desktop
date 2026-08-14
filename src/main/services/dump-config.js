import { spawn } from 'node:child_process'

/**
 * 解析 `dsh --dump-config` 输出为行树。
 * 已实测输出格式：
 *   # == <bundle>[, patched by <other>]     ← 来源 bundle 注释
 *   - id: <entryId>                          ← 稳定行 id
 *     name: '<package>'                      ← 实际包名
 *     disabled: true                         ← 行级状态（可选）
 */
export function parseDumpConfig(output) {
  const rows = []
  let bundle = ''
  const lines = output.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()
    const bundleMatch = /^# ==\s*(.+)$/.exec(trimmed)
    if (bundleMatch !== null) {
      // 取 "bundle, patched by X" 的主体
      bundle = bundleMatch[1].split(',')[0].trim()
      continue
    }
    const idMatch = /^-\s*id:\s*([^\s]+)/.exec(trimmed)
    if (idMatch === null) continue
    let name = ''
    let disabled = false
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j]
      if (/^\S/.test(next) && next.trim() !== '') break // 下一个顶层键/行
      const nameMatch = /name:\s*(.+)/.exec(next.trim())
      if (nameMatch !== null) name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '')
      if (/^\s*disabled:\s*true\s*$/.test(next)) disabled = true
    }
    rows.push({ id: idMatch[1], name, bundle, disabled })
  }
  return rows
}

/** 运行 dump-config（只读组装树，不启动服务），返回行树。 */
export function runDumpConfig({ nodePath, dshEntry, dshHome, profile = 'web', env = {}, timeoutMs = 30000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodePath, [dshEntry, '--profile', profile, '--dump-config'], {
      env: { ...process.env, ...env, DSH_HOME: dshHome },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      reject(new Error(`dump-config 超时 (${timeoutMs}ms)`))
    }, timeoutMs)
    child.stdout.on('data', (d) => { output += String(d) })
    child.stderr.on('data', (d) => { output += String(d) })
    child.once('error', (err) => { clearTimeout(timer); reject(err) })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`dump-config 退出 (code=${code}): ${output.slice(-500)}`))
        return
      }
      resolve(parseDumpConfig(output))
    })
  })
}
