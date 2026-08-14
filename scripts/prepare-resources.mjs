// 固定版本常量 — 发版升级只改这里
// 注：0.1.0-rc.5 未发布（registry 仅 rc.2/rc.3/rc.6），固定到 0.1.0-rc.6
const DSH_VERSION = '0.1.0-rc.6'
const NODE_VERSION = 'v24.4.0'
const PNPM_VERSION = 'v10.8.0'

import { mkdirSync, existsSync, renameSync, rmSync, createWriteStream } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import https from 'node:https'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const resources = join(root, 'resources')

function download(url, dest) {
  return new Promise((resolve, reject) => {
    mkdirSync(dirname(dest), { recursive: true })
    const file = createWriteStream(dest)
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close()
        download(res.headers.location, dest).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`下载失败 ${url}: HTTP ${res.statusCode}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', reject)
  })
}

async function prepareNode() {
  const dir = join(resources, 'node')
  const exe = join(dir, 'node.exe')
  if (existsSync(exe)) { console.log('[node] 已存在，跳过'); return }
  console.log('[node] 下载 Node', NODE_VERSION, '...')
  const zip = join(resources, 'node.zip')
  await download(`https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip`, zip)
  execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force '${zip}' '${dir}'`])
  renameSync(join(dir, `node-${NODE_VERSION}-win-x64`, 'node.exe'), exe)
  rmSync(zip, { force: true })
  rmSync(join(dir, `node-${NODE_VERSION}-win-x64`), { recursive: true, force: true })
  console.log('[node] OK:', exe)
}

async function preparePnpm() {
  const dir = join(resources, 'bin')
  const exe = join(dir, 'pnpm.exe')
  if (existsSync(exe)) { console.log('[pnpm] 已存在，跳过'); return }
  console.log('[pnpm] 下载 pnpm', PNPM_VERSION, '...')
  await download(`https://github.com/pnpm/pnpm/releases/download/${PNPM_VERSION}/pnpm-win-x64.exe`, exe)
  console.log('[pnpm] OK:', exe)
}

async function prepareDsh() {
  const dir = join(resources, 'dsh')
  const marker = join(dir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  if (existsSync(marker)) { console.log('[dsh] 已存在，跳过'); return }
  console.log('[dsh] 安装 @deepseek-ai/dsh@' + DSH_VERSION, '...')
  mkdirSync(dir, { recursive: true })
  // Windows 上 npm 是 .cmd 脚本，execFile 不通过 shell 无法执行（ENOENT/EINVAL）
  execFileSync('npm', ['install', `@deepseek-ai/dsh@${DSH_VERSION}`, '--omit=dev', '--prefix', dir], { stdio: 'inherit', shell: true })
  console.log('[dsh] OK')
}

for (const fn of [prepareNode, preparePnpm, prepareDsh]) await fn()
console.log('\n全部资源就绪，位于', resources)
