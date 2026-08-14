import { describe, it, expect } from 'vitest'
import { buildEnv } from '../src/main/services/main-env.js'

describe('buildEnv', () => {
  it('注入 DSH_HOME 并在 PATH 前置 bin 目录', () => {
    const env = buildEnv({ DSH_HOME: 'C:/dsh-home', binDir: 'C:/resources/bin' })
    expect(env.DSH_HOME).toBe('C:/dsh-home')
    expect(env.PATH).toMatch(/^C:\/resources\/bin[;:]/)
    expect(env.PATH).toContain(process.env.PATH)
  })

  it('透传额外变量', () => {
    const env = buildEnv({ DSH_HOME: 'C:/dsh-home', binDir: 'C:/bin', FOO: 'bar' })
    expect(env.FOO).toBe('bar')
  })
})
