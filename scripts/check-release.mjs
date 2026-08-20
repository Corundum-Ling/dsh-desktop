import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, resolve, relative, sep } from 'node:path'

const root = process.cwd()
const gitFiles = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
).split(/\r?\n/).filter((file) => file && existsSync(file))

const requiredPackagedEntries = [
  'src',
  'LICENSE',
  'THIRD-PARTY-NOTICES.md',
  'resources/node/node.exe',
  'resources/bin/pnpm.exe',
  'resources/licenses/node-LICENSE.txt',
  'resources/licenses/pnpm-embedded-node-LICENSE.txt',
  'resources/licenses/pnpm-LICENSE.txt',
  'resources/dsh/node_modules/@deepseek-ai/dsh/package.json',
  'resources/dsh/node_modules/@deepseek-ai/dsh-subprocess-local/package.json',
  'resources/dsh/node_modules/node-pty/prebuilds/win32-x64/conpty.node',
]
const packagedTrees = ['src', 'resources/licenses', 'resources/dsh']
const expectedLicenseBlobs = new Map([
  ['resources/licenses/node-LICENSE.txt', '76b7adb3cf91ad4f98366e17f504925941861b17'],
  ['resources/licenses/pnpm-embedded-node-LICENSE.txt', '9188c2223d1f8bd77948e8c03e2fa24911ae5422'],
  ['resources/licenses/pnpm-LICENSE.txt', 'a4c8771ca3f3f022a68f0cb50378d406b493aa1e'],
])

function collectFiles(entry, files) {
  const absolute = resolve(root, entry)
  if (!existsSync(absolute)) return
  const stat = statSync(absolute)
  if (stat.isFile()) {
    files.add(relative(root, absolute).split(sep).join('/'))
    return
  }
  for (const child of readdirSync(absolute, { withFileTypes: true })) {
    if (child.isSymbolicLink()) continue
    collectFiles(resolve(absolute, child.name), files)
  }
}

const missingPackagedEntries = requiredPackagedEntries.filter((entry) => !existsSync(resolve(root, entry)))
const fileSet = new Set(gitFiles.map((file) => file.split(sep).join('/')))
for (const entry of requiredPackagedEntries) collectFiles(entry, fileSet)
for (const entry of packagedTrees) collectFiles(entry, fileSet)
const files = [...fileSet].sort()

const forbiddenPaths = [
  /(^|\/)\.superpowers(\/|$)/i,
  /(^|\/)\.?(?:credentials?|secrets?)(?:\.(?:ya?ml|json|toml|ini|txt|bak|backup))?$/i,
  /(^|\/)backups?(\/|$)/i,
  /(^|\/)(?:cookies?|login data|web data)(?:-journal)?$/i,
  /(^|\/)(?:\.npmrc|\.netrc|local state)$/i,
  /(^|\/)(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)$/i,
  /(^|\/)\.env(?:\.|$)/i,
  /\.(?:log|key|pem|p12|pfx|bak|backup)$/i,
]

const forbiddenContent = [
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/,
  /\bnpm_[A-Za-z0-9]{30,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\bsk_live_[A-Za-z0-9]{20,}\b/,
  /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/,
  /DefaultEndpointsProtocol=https?;AccountName=[^;\s]+;AccountKey=[^;\s]+;/i,
]

const upstreamFixtureAllowlist = new Set([
  'resources/dsh/node_modules/@aws-sdk/nested-clients/dist-types/submodules/sts/commands/AssumeRoleCommand.d.ts',
  'resources/dsh/node_modules/@aws-sdk/nested-clients/dist-types/submodules/sts/commands/AssumeRoleWithWebIdentityCommand.d.ts',
  'resources/dsh/node_modules/@shikijs/langs/dist/emacs-lisp.mjs',
  'resources/dsh/node_modules/jose/dist/webapi/key/import.js',
])
const binaryExtensions = new Set([
  '.7z', '.a', '.bin', '.bmp', '.br', '.bz2', '.dll', '.dylib', '.eot', '.exe', '.gif', '.gz',
  '.ico', '.jpeg', '.jpg', '.node', '.pdf', '.png', '.so', '.tar', '.ttf', '.wasm', '.webp',
  '.woff', '.woff2', '.xz', '.zip',
])

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`)
  return createHash('sha1').update(header).update(buffer).digest('hex')
}

const integrityFailures = []
for (const [file, expected] of expectedLicenseBlobs) {
  if (!existsSync(resolve(root, file))) continue
  if (gitBlobSha(readFileSync(resolve(root, file))) !== expected) integrityFailures.push(file)
}

if (existsSync(resolve(root, 'resources/node/node.exe'))) {
  const version = execFileSync(resolve(root, 'resources/node/node.exe'), ['--version'], { encoding: 'utf8' }).trim()
  if (version !== 'v24.4.0') integrityFailures.push('resources/node/node.exe (expected v24.4.0)')
}
if (existsSync(resolve(root, 'resources/bin/pnpm.exe'))) {
  const pnpmExe = resolve(root, 'resources/bin/pnpm.exe')
  const version = execFileSync(pnpmExe, ['--version'], { encoding: 'utf8' }).trim()
  if (version !== '10.8.0') integrityFailures.push('resources/bin/pnpm.exe (expected 10.8.0)')
  const help = execFileSync(pnpmExe, ['--help'], { encoding: 'utf8' })
  if (!help.includes('bundled Node.js v20.11.1')) {
    integrityFailures.push('resources/bin/pnpm.exe (expected bundled Node.js v20.11.1)')
  }
}
const dshMarker = resolve(root, 'resources/dsh/node_modules/@deepseek-ai/dsh/package.json')
if (existsSync(dshMarker) && JSON.parse(readFileSync(dshMarker, 'utf8')).version !== '0.1.0-rc.8') {
  integrityFailures.push('resources/dsh/node_modules/@deepseek-ai/dsh/package.json (expected 0.1.0-rc.8)')
}

const pathFailures = files.filter((file) => forbiddenPaths.some((pattern) => pattern.test(file)))
const contentFailures = []

for (const file of files) {
  if (upstreamFixtureAllowlist.has(file) || binaryExtensions.has(extname(file).toLowerCase())) continue
  const absolute = resolve(root, file)
  const buffer = readFileSync(absolute)
  const text = buffer.toString('utf8')
  if (forbiddenContent.some((pattern) => pattern.test(text))) contentFailures.push(file)
}

if (missingPackagedEntries.length || integrityFailures.length || pathFailures.length || contentFailures.length) {
  if (missingPackagedEntries.length) {
    console.error('Missing packaged inputs (run npm run prepare:resources):\n' + missingPackagedEntries.join('\n'))
  }
  if (integrityFailures.length) console.error('Invalid packaged inputs:\n' + integrityFailures.join('\n'))
  if (pathFailures.length) console.error('Blocked sensitive paths:\n' + pathFailures.join('\n'))
  if (contentFailures.length) console.error('Possible secrets in:\n' + contentFailures.join('\n'))
  process.exit(1)
}

console.log(`Release input check passed (${files.length} files checked, including packaged resources).`)
