import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertSafeEntryId, assertSafePackageName, yamlQuote,
  readInsertRows, hasManagedDisable,
  addDisableBlock, removeDisableBlock,
  applyRowEnabled, applyRowDisabled,
  addInsertRow, removeInsertRow, writePatch,
} from '../src/patch-manager.js'

const START = '# dsh-plugin-manager:managed:start'
const END = '# dsh-plugin-manager:managed:end'

describe('assertSafeEntryId / assertSafePackageName', () => {
  it('合法 id 通过', () => {
    expect(() => assertSafeEntryId('llm')).not.toThrow()
    expect(() => assertSafeEntryId('a/b-c.d_1')).not.toThrow()
  })
  it('非法 id 抛错', () => {
    expect(() => assertSafeEntryId('bad id')).toThrow()
    expect(() => assertSafeEntryId('x'.repeat(121))).toThrow()
  })
  it('包名校验', () => {
    expect(() => assertSafePackageName('@deepseek-ai/dsh-llm')).not.toThrow()
    expect(() => assertSafePackageName('')).toThrow()
    expect(() => assertSafePackageName('bad\x00name')).toThrow()
  })
})

describe('yamlQuote', () => {
  it('@ 前缀安全且引号双写', () => {
    expect(yamlQuote('@a/b')).toBe("'@a/b'")
    expect(yamlQuote("it's")).toBe("'it''s'")
  })
})

describe('addDisableBlock / removeDisableBlock', () => {
  it('追加禁用块并可移除', () => {
    const content = '[]\n'
    const withBlock = addDisableBlock(content, 'llm')
    expect(withBlock).toContain(START)
    expect(withBlock).toContain('- id: llm')
    expect(withBlock).toContain('  disabled: true')
    expect(withBlock).toContain(END)
    expect(withBlock).not.toContain('[]')
    const back = removeDisableBlock(withBlock, 'llm')
    expect(back).not.toContain(START)
    expect(back.trim()).toBe('[]')
  })
  it('同 id 重复添加是刷新而非叠加', () => {
    const once = addDisableBlock('[]\n', 'llm')
    const twice = addDisableBlock(once, 'llm')
    expect(twice.split(START).length - 1).toBe(1)
  })
  it('空内容也能添加', () => {
    expect(addDisableBlock('', 'llm')).toContain('- id: llm')
  })
})

describe('hasManagedDisable', () => {
  it('文件存在且含目标块返回 true', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-test-'))
    const f = join(dir, 'cordis.patch.yml')
    writePatch(f, addDisableBlock('[]\n', 'llm'))
    expect(hasManagedDisable(f, 'llm')).toBe(true)
    expect(hasManagedDisable(f, 'session')).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
  it('文件不存在返回 false', () => {
    expect(hasManagedDisable('C:/nonexistent/patch.yml', 'llm')).toBe(false)
  })
})

describe('applyRowEnabled / applyRowDisabled', () => {
  it('用户行加 disabled 再移除', () => {
    const base = '- id: my-row\n  config:\n    k: v\n'
    const disabled = applyRowDisabled(base, 'my-row')
    expect(disabled.changed).toBe(true)
    expect(disabled.content).toContain('disabled: true')
    const enabled = applyRowEnabled(disabled.content, 'my-row')
    expect(enabled.changed).toBe(true)
    expect(enabled.content).not.toContain('disabled')
    expect(enabled.content).toContain('k: v')
  })
  it('不存在行时 changed=false', () => {
    expect(applyRowDisabled('[]\n', 'ghost').changed).toBe(false)
  })
})

describe('addInsertRow / removeInsertRow / readInsertRows', () => {
  it('追加 insert 块并读出', () => {
    const content = addInsertRow('[]\n', 'dsh-my-plugin', 'dsh-my-plugin')
    expect(content).toContain('- insert:')
    expect(content).toContain("name: 'dsh-my-plugin'")
    const rows = readInsertRows(content)
    expect(rows).toEqual([{ id: 'dsh-my-plugin', name: 'dsh-my-plugin', managed: true }])
  })
  it('@ 包名被正确引号包裹', () => {
    const content = addInsertRow('[]\n', 'row-1', '@scope/pkg')
    expect(content).toContain("name: '@scope/pkg'")
  })
  it('移除 insert 块且 removed 标志正确', () => {
    const content = addInsertRow('[]\n', 'row-1', 'pkg')
    const { content: back, removed } = removeInsertRow(content, 'row-1')
    expect(removed).toBe(true)
    expect(back.trim()).toBe('[]')
    expect(removeInsertRow(back, 'row-1').removed).toBe(false)
  })
  it('读用户手写 insert 行（非 managed）', () => {
    const content = '- insert:\n    - id: user-row\n      name: "user-pkg"\n'
    const rows = readInsertRows(content)
    expect(rows).toEqual([{ id: 'user-row', name: 'user-pkg', managed: false }])
  })
})

describe('writePatch', () => {
  it('原子写且内容一致', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-write-'))
    const f = join(dir, 'cordis.patch.yml')
    writePatch(f, '- id: x\n')
    expect(readFileSync(f, 'utf8')).toBe('- id: x\n')
    expect(existsSync(f + '.tmp')).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})