import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const CONFIG_FILE = 'config.json'

export function createConfig(baseDir) {
  const file = join(baseDir, CONFIG_FILE)
  let data = {}
  if (existsSync(file)) {
    try {
      data = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      data = {}
    }
  }
  return {
    get(key, fallback = undefined) {
      return key in data ? data[key] : fallback
    },
    set(key, value) {
      data[key] = value
      mkdirSync(baseDir, { recursive: true })
      writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
    },
    dshHome() {
      return join(baseDir, 'dsh-home')
    },
    logsDir() {
      return join(baseDir, 'logs')
    },
  }
}
