import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'

const SQLITE_MARKER = 'dsh-session-persistence-sqlite'

function safeVersion(version) {
  return String(version).replace(/[^A-Za-z0-9._-]/g, '_')
}

function filesUnder(root, current = root) {
  if (!existsSync(current)) return []
  const result = []
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'backups') continue
      result.push(...filesUnder(root, path))
    } else if (entry.isFile()) {
      result.push(path)
    }
  }
  return result
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function copyDataSnapshot({ baseDir, dshHome, version, now = new Date() }) {
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  const backupRoot = join(baseDir, 'backups')
  const finalDir = join(backupRoot, `pre-upgrade-${safeVersion(version)}-${stamp}`)
  const tempDir = `${finalDir}.tmp`
  rmSync(tempDir, { recursive: true, force: true })
  mkdirSync(tempDir, { recursive: true })

  const sourceFiles = [
    ...filesUnder(dshHome),
    ...(existsSync(join(baseDir, 'config.json')) ? [join(baseDir, 'config.json')] : []),
  ]
  const manifest = {
    sourceVersion: version,
    createdAt: now.toISOString(),
    files: [],
  }

  try {
    for (const source of sourceFiles) {
      const sourceRelative = relative(baseDir, source).replaceAll('\\', '/')
      const destination = join(tempDir, sourceRelative)
      mkdirSync(join(destination, '..'), { recursive: true })
      cpSync(source, destination)
      const info = statSync(destination)
      manifest.files.push({
        path: sourceRelative,
        bytes: info.size,
        sha256: sha256(destination),
      })
    }
    writeFileSync(join(tempDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    renameSync(tempDir, finalDir)
    return { path: finalDir, manifest }
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true })
    throw error
  }
}

function findStorageConfig(dshHome) {
  const files = filesUnder(dshHome).filter((path) => path.endsWith('cordis.patch.yml'))
  return files.find((path) => readFileSync(path, 'utf8').includes(SQLITE_MARKER)) ?? null
}

export function assertSafeStorage(dshHome) {
  const source = findStorageConfig(dshHome)
  if (source) {
    throw new Error(
      `检测到显式 SQLite 会话持久化配置：${source}\n` +
      '当前升级不会自动迁移 SQLite 数据库。为避免记录丢失，已阻止新版启动；原数据未修改。',
    )
  }
}

export function createUpgradeGuard({ baseDir, dshHome, config, isPackaged, version, now = () => new Date() }) {
  return {
    prepare() {
      if (!isPackaged) return { skipped: true, reason: 'development' }
      assertSafeStorage(dshHome)
      if (config.get('lastSuccessfulAppVersion') === version) {
        return { skipped: true, reason: 'already-verified' }
      }
      const snapshot = copyDataSnapshot({ baseDir, dshHome, version, now: now() })
      return { skipped: false, snapshot }
    },
    markSuccessful() {
      config.set('lastSuccessfulAppVersion', version)
    },
  }
}
