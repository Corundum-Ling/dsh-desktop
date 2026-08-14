// 固定版本常量 — 发版升级只改这里
// 注：0.1.0-rc.5 未发布（registry 仅 rc.2/rc.3/rc.6），固定到 0.1.0-rc.6
const DSH_VERSION = '0.1.0-rc.6'
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

import { mkdirSync, existsSync, readFileSync, renameSync, rmSync, createWriteStream } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
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
    if (version !== DSH_VERSION) throw new Error(`[dsh] 期望 ${DSH_VERSION}，实际 ${version}；请清理 resources/dsh 后重试`)
    console.log('[dsh] 已存在且版本正确，跳过')
    return
  }
  console.log('[dsh] 安装 @deepseek-ai/dsh@' + DSH_VERSION, '...')
  mkdirSync(dir, { recursive: true })
  // Windows 上 npm 是 .cmd 脚本，execFile 不通过 shell 无法执行（ENOENT/EINVAL）
  execFileSync('npm', ['install', `@deepseek-ai/dsh@${DSH_VERSION}`, '--omit=dev', '--prefix', dir], { stdio: 'inherit', shell: true })
  console.log('[dsh] OK')
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
