import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// 事件转 Promise：监听 close（所有 stdio 关闭后触发，保证输出收全）而非 exit；
// error 先到先得幂等；超时后 kill 子进程并中止。
export function toResult(child, { timeoutMs = 300000 } = {}) {
  return new Promise((resolve) => {
    let output = ''
    let settled = false
    const done = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const collect = (chunk) => { output += String(chunk) }
    if (child.stdout) child.stdout.on('data', collect)
    if (child.stderr) child.stderr.on('data', collect)
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* 已退出 */ }
      done({ code: 1, output: '操作超时（已中止）' })
    }, timeoutMs)
    child.once('close', (code) => done({ code, output: output.trim() }))
    child.once('error', (err) => done({ code: 1, output: String(err) }))
  })
}

export function createPluginManager({ nodePath, dshEntry, dshHome, env, spawnImpl = spawn, timeoutMs = 300000 }) {
  const profileDir = join(dshHome, 'profiles', 'web')

  async function listPlugins() {
    const pkgFile = join(profileDir, 'package.json')
    if (!existsSync(pkgFile)) return []
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
    return Object.entries(pkg.dependencies || {}).map(([name, version]) => ({ name, version }))
  }

  async function runPluginCmd(args) {
    const child = spawnImpl(nodePath, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const { code, output } = await toResult(child, { timeoutMs })
    return { ok: code === 0, output }
  }

  async function installPlugin(spec) {
    return runPluginCmd([dshEntry, 'plugin', '--profile', 'web', 'add', spec])
  }

  async function removePlugin(name) {
    return runPluginCmd([dshEntry, 'plugin', '--profile', 'web', 'remove', name])
  }

  return { listPlugins, installPlugin, removePlugin }
}
