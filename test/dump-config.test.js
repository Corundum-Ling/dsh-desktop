import { describe, it, expect } from 'vitest'
import { parseDumpConfig } from '../src/dump-config.js'

const FIXTURE = `# == @deepseek-ai/dsh-base
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
# == @deepseek-ai/dsh-base, patched by @deepseek-ai/dsh-web-app
- id: hmr
  name: '@deepseek-ai/cordis-plugin-hmr'
  config:
    root:
      - .
  disabled: true
# == @deepseek-ai/dsh-base
- id: llm
  name: '@deepseek-ai/dsh-llm'
- id: my-plugin
  name: '@user/dsh-my-plugin'
  disabled: true
`

describe('parseDumpConfig', () => {
  it('解析行 id/name/bundle/disabled', () => {
    const rows = parseDumpConfig(FIXTURE)
    expect(rows).toEqual([
      { id: 'timer', name: '@deepseek-ai/cordis-plugin-timer', bundle: '@deepseek-ai/dsh-base', disabled: false },
      { id: 'hmr', name: '@deepseek-ai/cordis-plugin-hmr', bundle: '@deepseek-ai/dsh-base', disabled: true },
      { id: 'llm', name: '@deepseek-ai/dsh-llm', bundle: '@deepseek-ai/dsh-base', disabled: false },
      { id: 'my-plugin', name: '@user/dsh-my-plugin', bundle: '@deepseek-ai/dsh-base', disabled: true },
    ])
  })
  it('bundle 注释带 patched by 时取主体', () => {
    const rows = parseDumpConfig('# == @deepseek-ai/dsh-base, patched by @deepseek-ai/dsh-web-app\n- id: x\n  name: pkg\n')
    expect(rows[0].bundle).toBe('@deepseek-ai/dsh-base')
  })
  it('无注释（行前无 bundle）时 bundle 为空串', () => {
    const rows = parseDumpConfig('- id: solo\n  name: pkg\n')
    expect(rows[0].bundle).toBe('')
  })
  it('注释但无行则忽略', () => {
    expect(parseDumpConfig('# == @deepseek-ai/dsh-base\n# 无行\n')).toEqual([])
  })
})
