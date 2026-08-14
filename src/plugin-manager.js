import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function runCommand(nodePath, args, opts) {
  return spawn(nodePath, args, {
    env: { ...process.env, ...opts.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function toResult(child) {
  return new Promise((resolve) => {
    let output = ''
    const collect = (chunk) => { output += String(chunk) }
    if (child.stdout) child.stdout.on('data', collect)
    if (child.stderr) child.stderr.on('data', collect)
    child.once('exit', (code) => resolve({ code, output: output.trim() }))
    child.once('error', (err) => resolve({ code: 1, output: String(err) }))
  })
}

export function createPluginManager({ nodePath, dshEntry, dshHome, env, spawnImpl = runCommand }) {
  const profileDir = join(dshHome, 'profiles', 'web')

  async function listPlugins() {
    const pkgFile = join(profileDir, 'package.json')
    if (!existsSync(pkgFile)) return []
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
    return Object.entries(pkg.dependencies || {}).map(([name, version]) => ({ name, version }))
  }

  async function installPlugin(spec) {
    const child = spawnImpl(nodePath, [dshEntry, 'plugin', '--profile', 'web', 'add', spec], { env })
    const { code, output } = await toResult(child)
    return { ok: code === 0, output }
  }

  async function removePlugin(name) {
    const child = spawnImpl(nodePath, [dshEntry, 'plugin', '--profile', 'web', 'remove', name], { env })
    const { code, output } = await toResult(child)
    return { ok: code === 0, output }
  }

  return { listPlugins, installPlugin, removePlugin }
}
