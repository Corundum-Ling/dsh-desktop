import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')

const windows = [
  {
    html: 'plugin-window.html',
    script: 'plugin-window.js',
    ids: ['status', 'spec', 'install-btn', 'plugin-list', 'output'],
  },
  {
    html: 'marketplace-window.html',
    script: 'marketplace-window.js',
    ids: ['status', 'search', 'refresh-btn', 'list', 'output'],
  },
  {
    html: 'env-window.html',
    script: 'env-window.js',
    ids: ['status', 'new-name', 'create-btn', 'profile-list', 'output'],
  },
]

describe('secondary window UI contract', () => {
  it.each(windows)('$html keeps required DOM and theme hooks', ({ html, ids }) => {
    const source = read(html)
    for (const id of ids) expect(source).toContain(`id="${id}"`)
    expect(source).toContain('href="./window-theme.css"')
    expect(source).toContain('src="./window-controls.js"')
    expect(source).toContain('src="./theme-applier.js"')
  })

  it.each(windows)('$script stays inside the sandbox API boundary', ({ script }) => {
    const source = read(script)
    expect(source).not.toMatch(/\brequire\s*\(|\bimport\s|window\.(?:prompt|open)\s*\(/)
    expect(source).not.toMatch(/\.style\./)
  })

  it('uses literal colors only in the fallback token block', () => {
    const css = read('window-theme.css')
    const rootEnd = css.indexOf('\n}\n', css.indexOf(':root'))
    const rules = css.slice(rootEnd + 3)
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\s*\(/i)
  })

  it('packages every secondary-window asset', () => {
    const builder = read('electron-builder.yml')
    const assets = [
      ...windows.flatMap(({ html, script }) => [html, script]),
      'window-theme.css',
      'window-controls.js',
      'theme-applier.js',
      'theme-probe.cjs',
    ]
    for (const asset of assets) expect(builder).toContain(`- ${asset}`)
  })

  it('keeps secondary windows hidden until their themed first frame is ready', () => {
    const main = read('main.js')
    expect(main).toContain('show: false')
    expect(main).toContain("once('ready-to-show'")
    expect(main).toContain('window.__contentReadyPromise')
    expect(main).toContain('frame: false')
    expect(main).toContain("thickFrame: process.platform !== 'win32'")
    expect(main).not.toContain('modal: true')
    expect(main).not.toContain('titleBarOverlay:')
    expect(read('theme-applier.js')).toContain('requestAnimationFrame(() => requestAnimationFrame(resolve))')
    for (const { script } of windows) expect(read(script)).toContain('window.__contentReadyPromise =')
    expect(read('window-theme.css')).toContain('-webkit-app-region: drag')
    expect(read('preload.cjs')).toContain("ipcRenderer.send('window:close')")
  })

  it('renders plugin ownership groups as accessible collapsible controls', () => {
    const script = read('plugin-window.js')
    expect(script).toContain("className = 'bundle-toggle'")
    expect(script).toContain("setAttribute('aria-expanded'")
    expect(script).toContain('panel.hidden = collapsed')
  })
})
