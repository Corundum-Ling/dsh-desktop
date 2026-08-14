import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')

const windows = [
  {
    html: 'src/renderer/plugin/index.html',
    script: 'src/renderer/plugin/index.js',
    ids: ['status', 'spec', 'install-btn', 'plugin-list', 'output'],
  },
  {
    html: 'src/renderer/marketplace/index.html',
    script: 'src/renderer/marketplace/index.js',
    ids: ['status', 'search', 'refresh-btn', 'list', 'output'],
  },
  {
    html: 'src/renderer/environment/index.html',
    script: 'src/renderer/environment/index.js',
    ids: ['status', 'new-name', 'create-btn', 'profile-list', 'output'],
  },
]

describe('secondary window UI contract', () => {
  it.each(windows)('$html keeps required DOM and theme hooks', ({ html, ids }) => {
    const source = read(html)
    for (const id of ids) expect(source).toContain(`id="${id}"`)
    expect(source).toContain('href="../shared/window-theme.css"')
    expect(source).toContain('src="../shared/theme-applier.js"')
  })

  it.each(windows)('$script stays inside the sandbox API boundary', ({ script }) => {
    const source = read(script)
    expect(source).not.toMatch(/\brequire\s*\(|\bimport\s|window\.(?:prompt|open)\s*\(/)
    expect(source).not.toMatch(/\.style\./)
  })

  it('uses literal colors only in the fallback token block', () => {
    const css = read('src/renderer/shared/window-theme.css').replace(/\r\n/g, '\n')
    const rootEnd = css.indexOf('\n}\n', css.indexOf(':root'))
    const rules = css.slice(rootEnd + 3)
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\s*\(/i)
  })

  it('packages every secondary-window asset', () => {
    const builder = read('electron-builder.yml')
    expect(builder).toContain('- src/**')
    for (const { html, script } of windows) {
      expect(existsSync(new URL(`../${html}`, import.meta.url))).toBe(true)
      expect(existsSync(new URL(`../${script}`, import.meta.url))).toBe(true)
    }
  })

  it('uses the branded icon for the Windows app and installer', () => {
    const builder = read('electron-builder.yml')
    expect(existsSync(new URL('../build/icon.ico', import.meta.url))).toBe(true)
    expect(builder).toContain('icon: build/icon.ico')
    expect(builder).toContain('installerIcon: build/icon.ico')
    expect(builder).toContain('uninstallerIcon: build/icon.ico')
    expect(builder).toContain('installerHeaderIcon: build/icon.ico')
  })

  it('keeps sensitive local artifacts behind a release gate', () => {
    const ignored = read('.gitignore')
    const pkg = JSON.parse(read('package.json'))
    const builder = read('electron-builder.yml')
    const checker = read('scripts/check-release.mjs')
    expect(ignored).toContain('.superpowers/')
    expect(ignored).toContain('**/.credentials.yaml')
    expect(ignored).toContain('.npmrc')
    expect(ignored).toContain('*.key')
    expect(pkg.scripts['check:release']).toBe('node scripts/check-release.mjs')
    expect(pkg.scripts.dist).toContain('npm run check:release')
    expect(builder).toContain('- "licenses/**"')
    expect(checker).toContain("'resources/dsh'")
    expect(checker).toContain("'resources/licenses/pnpm-embedded-node-LICENSE.txt'")
    expect(checker).toContain('readdirSync')
    expect(existsSync(new URL('../scripts/check-release.mjs', import.meta.url))).toBe(true)
  })

  it('keeps secondary windows hidden until their themed first frame is ready', () => {
    const main = read('src/main/index.js')
    expect(main).toContain('show: false')
    expect(main).toContain("once('ready-to-show'")
    expect(main).toContain('window.__contentReadyPromise')
    expect(main).toContain("titleBarStyle: 'hidden'")
    expect(main).toContain('titleBarOverlay: titleBarOverlay()')
    expect(main).not.toContain('modal: true')
    expect(read('src/renderer/shared/theme-applier.js')).toContain('requestAnimationFrame(() => requestAnimationFrame(resolve))')
    for (const { script } of windows) expect(read(script)).toContain('window.__contentReadyPromise =')
    expect(read('src/renderer/shared/window-theme.css')).toContain('env(titlebar-area-width, 100%)')
    expect(read('src/renderer/main-window.css')).toContain('-webkit-app-region: drag')
    expect(read('src/preload/theme-probe.cjs')).toContain("titlebar.id = 'dsh-desktop-titlebar'")
    expect(read('src/preload/theme-probe.cjs')).toContain("ipcRenderer.send('window:open', kind)")
    expect(main).toContain("ipcMain.on('window:open'")
  })

  it('renders plugin ownership groups as accessible collapsible controls', () => {
    const script = read('src/renderer/plugin/index.js')
    expect(script).toContain("className = 'bundle-toggle'")
    expect(script).toContain("setAttribute('aria-expanded'")
    expect(script).toContain('panel.hidden = collapsed')
  })
})
