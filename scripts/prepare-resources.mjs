// 固定版本常量 — 发版升级只改这里
// rc.8 的 web-app 默认会打开浏览器，桌面端通过 --no-open 禁用。
const DSH_VERSION = '0.1.0-rc.8'
const NODE_VERSION = 'v24.4.0'
const PNPM_VERSION = 'v10.8.0'
const PNPM_EMBEDDED_NODE_VERSION = 'v20.11.1'
const NODE_LICENSE_URL = `https://api.github.com/repos/nodejs/node/contents/LICENSE?ref=${NODE_VERSION}`
const PNPM_LICENSE_URL = `https://api.github.com/repos/pnpm/pnpm/contents/LICENSE?ref=${PNPM_VERSION}`
const PNPM_EMBEDDED_NODE_LICENSE_URL = `https://api.github.com/repos/nodejs/node/contents/LICENSE?ref=${PNPM_EMBEDDED_NODE_VERSION}`
const GITHUB_RAW_HEADERS = {
  Accept: 'application/vnd.github.raw+json',
  'User-Agent': 'dsh-desktop-resource-preparer',
}
const EXPECTED_LICENSE_BLOBS = new Map([
  ['node-LICENSE.txt', '76b7adb3cf91ad4f98366e17f504925941861b17'],
  ['pnpm-embedded-node-LICENSE.txt', '9188c2223d1f8bd77948e8c03e2fa24911ae5422'],
  ['pnpm-LICENSE.txt', 'a4c8771ca3f3f022a68f0cb50378d406b493aa1e'],
])

import { mkdirSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, createWriteStream, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import https from 'node:https'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const resources = join(root, 'resources')

function download(url, dest, redirects = 0, headers = {}) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) { reject(new Error(`重定向次数过多: ${url}`)); return }
    mkdirSync(dirname(dest), { recursive: true })
    const request = https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        download(new URL(res.headers.location, url), dest, redirects + 1, headers).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`下载失败 ${url}: HTTP ${res.statusCode}`))
        return
      }
      const file = createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
      file.on('error', reject)
      res.on('aborted', () => file.destroy(new Error(`下载中断: ${url}`)))
      res.on('error', (error) => file.destroy(error))
    })
    request.setTimeout(30_000, () => request.destroy(new Error(`下载超时: ${url}`)))
    request.on('error', reject)
  })
}

function gitBlobSha(file) {
  const buffer = readFileSync(file)
  return createHash('sha1').update(Buffer.from(`blob ${buffer.length}\0`)).update(buffer).digest('hex')
}

function verifyPnpm(exe) {
  const version = execFileSync(exe, ['--version'], { encoding: 'utf8' }).trim()
  const help = execFileSync(exe, ['--help'], { encoding: 'utf8' })
  if (version !== PNPM_VERSION.slice(1) || !help.includes(`bundled Node.js ${PNPM_EMBEDDED_NODE_VERSION}`)) {
    throw new Error(`[pnpm] 期望 ${PNPM_VERSION}（内置 Node.js ${PNPM_EMBEDDED_NODE_VERSION}），实际 ${version}；请清理 resources/bin 后重试`)
  }
}

function runWithHeartbeat(command, args, options, label) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const child = spawn(command, args, { ...options, shell: false })
    const heartbeat = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      console.log(`[${label}] 仍在处理依赖（${elapsed}s），包管理器在解析阶段可能暂不写入临时目录...`)
    }, 15_000)
    child.once('error', (error) => {
      clearInterval(heartbeat)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearInterval(heartbeat)
      if (code === 0) resolve()
      else reject(new Error(`${command} 退出（code=${code}, signal=${signal}）`))
    })
  })
}

async function prepareNode() {
  const dir = join(resources, 'node')
  const exe = join(dir, 'node.exe')
  if (existsSync(exe)) {
    const version = execFileSync(exe, ['--version'], { encoding: 'utf8' }).trim()
    if (version !== NODE_VERSION) throw new Error(`[node] 期望 ${NODE_VERSION}，实际 ${version}；请清理 resources/node 后重试`)
    console.log('[node] 已存在且版本正确，跳过')
    return
  }
  console.log('[node] 下载 Node', NODE_VERSION, '...')
  const zip = join(resources, 'node.zip')
  const part = zip + '.part'
  rmSync(part, { force: true })
  await download(`https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip`, part)
  renameSync(part, zip)
  execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force '${zip}' '${dir}'`])
  renameSync(join(dir, `node-${NODE_VERSION}-win-x64`, 'node.exe'), exe)
  rmSync(zip, { force: true })
  rmSync(join(dir, `node-${NODE_VERSION}-win-x64`), { recursive: true, force: true })
  console.log('[node] OK:', exe)
}

async function preparePnpm() {
  const dir = join(resources, 'bin')
  const exe = join(dir, 'pnpm.exe')
  if (existsSync(exe)) {
    verifyPnpm(exe)
    console.log('[pnpm] 已存在且版本正确，跳过')
    return
  }
  console.log('[pnpm] 下载 pnpm', PNPM_VERSION, '...')
  // 下载到 .part 再原子改名：直接写目标路径时中断残留会被 existsSync 误判为"已存在"
  const part = exe + '.part'
  await download(`https://github.com/pnpm/pnpm/releases/download/${PNPM_VERSION}/pnpm-win-x64.exe`, part)
  renameSync(part, exe)
  verifyPnpm(exe)
  console.log('[pnpm] OK:', exe)
}

async function prepareDsh() {
  const dir = join(resources, 'dsh')
  const marker = join(dir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  if (existsSync(marker)) {
    const version = JSON.parse(readFileSync(marker, 'utf8')).version
    if (version === DSH_VERSION) {
      rmSync(join(dir, '.npmrc'), { force: true })
      console.log('[dsh] 已存在且版本正确，跳过')
      return
    }
    console.log(`[dsh] 发现旧版本 ${version}，将使用临时目录准备 ${DSH_VERSION}`)
  }
  console.log('[dsh] 安装 @deepseek-ai/dsh@' + DSH_VERSION, '...')
  for (const entry of readdirSync(resources, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('dsh.staging-')) {
      console.log('[dsh] 清理上次中断留下的临时目录:', entry.name)
      rmSync(join(resources, entry.name), { recursive: true, force: true })
    }
  }
  const stagingDir = `${dir}.staging-${process.pid}`
  rmSync(stagingDir, { recursive: true, force: true })
  mkdirSync(stagingDir, { recursive: true })
  // Windows 上 npm 是 .cmd 脚本，execFile 不通过 shell 无法执行（ENOENT/EINVAL）
  try {
    writeFileSync(join(stagingDir, 'package.json'), JSON.stringify({
      private: true,
      dependencies: { '@deepseek-ai/dsh': DSH_VERSION },
    }, null, 2) + '\n', 'utf8')
    writeFileSync(join(stagingDir, '.npmrc'), 'node-linker=hoisted\n', 'utf8')
    await runWithHeartbeat(
      join(resources, 'bin', process.platform === 'win32' ? 'pnpm.exe' : 'pnpm'),
      ['--dir', stagingDir, 'install', '--prod', '--no-frozen-lockfile'],
      { stdio: 'inherit' },
      'dsh',
    )
    const stagedMarker = join(stagingDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
    if (JSON.parse(readFileSync(stagedMarker, 'utf8')).version !== DSH_VERSION) {
      throw new Error(`[dsh] 临时资源版本不是 ${DSH_VERSION}`)
    }
    // 仅用于安装时控制 pnpm 布局，不能进入发布资源或触发敏感路径门禁。
    rmSync(join(stagingDir, '.npmrc'), { force: true })
    if (existsSync(dir)) {
      const oldDir = `${dir}.previous-${process.pid}`
      rmSync(oldDir, { recursive: true, force: true })
      renameSync(dir, oldDir)
      try {
        renameSync(stagingDir, dir)
      } catch (error) {
        renameSync(oldDir, dir)
        throw error
      }
      rmSync(oldDir, { recursive: true, force: true })
    } else {
      renameSync(stagingDir, dir)
    }
    console.log('[dsh] OK')
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true })
    throw error
  }
}

async function prepareLicenses() {
  const dir = join(resources, 'licenses')
  const licenses = [
    ['Node.js', NODE_LICENSE_URL, join(dir, 'node-LICENSE.txt')],
    [`pnpm 内置 Node.js ${PNPM_EMBEDDED_NODE_VERSION}`, PNPM_EMBEDDED_NODE_LICENSE_URL, join(dir, 'pnpm-embedded-node-LICENSE.txt')],
    ['pnpm', PNPM_LICENSE_URL, join(dir, 'pnpm-LICENSE.txt')],
  ]
  for (const [name, url, dest] of licenses) {
    const expected = EXPECTED_LICENSE_BLOBS.get(dest.slice(dir.length + 1))
    if (existsSync(dest) && gitBlobSha(dest) === expected) { console.log(`[license] ${name} 已验证，跳过`); continue }
    console.log(`[license] 下载 ${name} 官方许可文本...`)
    const part = dest + '.part'
    rmSync(part, { force: true })
    await download(url, part, 0, GITHUB_RAW_HEADERS)
    rmSync(dest, { force: true })
    renameSync(part, dest)
    if (gitBlobSha(dest) !== expected) throw new Error(`[license] ${name} 下载内容与固定上游版本不一致`)
  }
}

for (const fn of [prepareNode, preparePnpm, prepareDsh, prepareLicenses]) await fn()
console.log('\n全部资源就绪，位于', resources)
