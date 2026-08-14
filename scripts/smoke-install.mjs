// 冒烟脚本：v2 审查修复后，用真实 pnpm + 真实 dsh 走完整 install 路径
// 1) registry 非 bundle 插件（cordis-plugin-cron）→ 实时挂载（insert 行 + needsRestart=false）
// 2) git 源（本地 git 仓库 + git+file:// 协议，等价 git 安装路径）→ 解析真实包名，不裸抛
// 用法：node scripts/smoke-install.mjs（退出码 0 = 全部通过）
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createPluginManager } from '../src/plugin-manager.js'
import { createPluginService } from '../src/plugin-service.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RES = join(__dirname, '..', 'resources')
const nodePath = join(RES, 'node', 'node.exe')
const dshEntry = join(RES, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const binDir = join(RES, 'bin')

// 临时 DSH_HOME + web profile
const home = mkdtempSync(join(tmpdir(), 'dsh-smoke-'))
mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
writeFileSync(join(home, 'profiles', 'web', 'package.json'), JSON.stringify({
  name: 'dsh-profile-web',
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  dependencies: {},
}, null, 2) + '\n')
writeFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), '[]\n')

const env = { ...process.env, DSH_HOME: home, PATH: binDir + ';' + (process.env.PATH ?? '') }
const pm = createPluginManager({ nodePath, dshEntry, dshHome: home, env, timeoutMs: 240000 })
const ps = createPluginService({ nodePath, dshEntry, dshHome: home, env, runDumpConfigImpl: async () => [] })

let fail = 0

// 1) registry 非 bundle：cordis-plugin-cron
try {
  const r1 = await ps.install('cordis-plugin-cron', pm)
  const patch = readFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
  const insertWritten = patch.includes("name: 'cordis-plugin-cron'")
  const ok1 = r1.ok === true && r1.needsRestart === false && insertWritten
  console.log(`[1 registry 非 bundle] ok=${r1.ok} needsRestart=${r1.needsRestart} insert行写入=${insertWritten}`)
  if (!ok1) { fail++; console.log('  输出: ' + String(r1.output ?? '').split('\n').slice(-4).join(' | ')) }
} catch (e) {
  fail++
  console.log('[1 registry 非 bundle] 裸抛: ' + e)
}

// 2) git 源：本地 git 仓库（git+file://），走真实 git 安装路径
let repo = null
try {
  repo = mkdtempSync(join(tmpdir(), 'dsh-gitrepo-'))
  const git = (args) => spawnSync('git', args, { cwd: repo, stdio: 'ignore' })
  git(['init', repo])
  writeFileSync(join(repo, 'package.json'), JSON.stringify({
    name: 'dsh-smoke-git', version: '1.0.0', main: 'index.js',
  }, null, 2) + '\n')
  writeFileSync(join(repo, 'index.js'), 'module.exports = { name: "dsh-smoke-git" }\n')
  git(['add', '.'])
  git(['-c', 'user.name=smoke', '-c', 'user.email=smoke@local', 'commit', '-m', 'init'])

  const spec = 'git+file:///' + repo.replace(/\\/g, '/') // Windows 路径需三斜杠 file:///
  const r2 = await ps.install(spec, pm)
  const patch2 = readFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
  // 真实包名来自 git 仓库的 package.json（依赖 diff → includes 匹配），不是 spec 字符串
  const realNameWritten = patch2.includes("name: 'dsh-smoke-git'")
  const ok2 = r2.ok === true && r2.needsRestart === false && realNameWritten
  console.log(`[2 git 源] ok=${r2.ok} needsRestart=${r2.needsRestart} 真实包名insert=${realNameWritten}`)
  if (!ok2) { fail++; console.log('  输出: ' + String(r2.output ?? '').split('\n').slice(-4).join(' | ')) }
} catch (e) {
  fail++
  console.log('[2 git 源] 裸抛: ' + e)
} finally {
  if (repo) try { rmSync(repo, { recursive: true, force: true }) } catch {}
}

try { rmSync(home, { recursive: true, force: true }) } catch {}
console.log(fail === 0 ? 'SMOKE PASS' : `SMOKE FAIL (${fail})`)
process.exit(fail === 0 ? 0 : 1)
