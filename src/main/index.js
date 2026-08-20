import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createConfig } from './services/config.js'
import { findFreePort, waitForPort } from './services/port-waiter.js'
import { DshService } from './services/dsh-service.js'
import { createPluginManager } from './services/plugin-manager.js'
import { createPluginService } from './services/plugin-service.js'
import { createMarketplace } from './services/marketplace.js'
import { createProfileService } from './services/profile-service.js'
import { runDumpConfig } from './services/dump-config.js'
import { buildEnv } from './services/main-env.js'
import { createUpgradeGuard } from './services/upgrade-guard.js'
import { createUpdateService } from './services/update-service.js'

// ESM 下没有全局 __dirname，用 import.meta.url 推导
const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = join(__dirname, '..', '..')

// 开发/打包双路径：app.isPackaged 为标准判断（开发模式 npm start 自动走项目 resources，
// 打包后走安装目录 resources）。旧方案依赖 DSH_DESKTOP_DEV 环境变量，但 start script
// 不设置它导致 npm start 必现 ENOENT
const RESOURCES_DIR = app.isPackaged
  ? join(process.resourcesPath, 'resources')
  : join(app.getAppPath(), 'resources')

const nodePath = join(RESOURCES_DIR, 'node', 'node.exe')
const pnpmBinDir = join(RESOURCES_DIR, 'bin')
const dshEntry = join(RESOURCES_DIR, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

let mainWindow = null
const childWindows = {}
let service = null
let restartCount = 0
let logStream = null
let quitting = false
let manualRestart = false
let pendingUpdateRelease = null
// themeState 占位（Task 9 主题同步完善其内容与广播）
let themeState = { isDark: false, variables: {} }

function themeValue(name, fallback) {
  return themeState.variables?.[name] || fallback
}

function titleBarOverlay() {
  return {
    color: themeValue('--dsw-alias-bg-layer-1', '#ffffff'),
    symbolColor: themeValue('--dsw-alias-label-primary', '#0f1115'),
    height: 40,
  }
}

function syncWindowChrome(win) {
  if (!win || win.isDestroyed()) return
  const background = themeValue('--dsw-alias-bg-base', '#ffffff')
  win.setBackgroundColor(background)
  win.setTitleBarOverlay(titleBarOverlay())
  if (process.platform === 'win32') win.setAccentColor(background)
}

function resourcePaths() {
  return { nodePath, pnpmBinDir, dshEntry }
}

// 市场数据源：拉取 awesome-dsh-plugins 的完整 PLUGINS-ALL.md 原始内容，
// createMarketplace 负责解析与缓存
async function fetchPluginsMd() {
  const res = await fetch('https://raw.githubusercontent.com/AdamPlatin123/awesome-dsh-plugins/main/PLUGINS-ALL.md')
  if (!res.ok) throw new Error(`市场数据源 HTTP ${res.status}`)
  return res.text()
}

function isGitHubRepositoryUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'github.com' && !url.port && !url.username && !url.password &&
      !url.search && !url.hash && /^\/[^/]+\/[^/]+\/?$/.test(url.pathname)
  } catch {
    return false
  }
}

function isRepositorySlug(value) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)
}

async function inspectMarketplaceRepository(repo) {
  if (!isRepositorySlug(repo)) return { installable: false, reason: '仓库地址无效' }
  for (const branch of ['main', 'master']) {
    const url = `https://raw.githubusercontent.com/${repo}/${branch}/package.json`
    let res
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    } catch (err) {
      if (err?.name === 'TimeoutError') throw new Error('仓库验证超时，请检查网络后重试')
      throw err
    }
    if (res.status === 404) continue
    if (!res.ok) throw new Error(`读取 package.json 失败: HTTP ${res.status}`)
    const pkg = await res.json()
    if (!pkg?.dsh?.bundle) {
      return { installable: false, reason: '仓库根目录未声明 dsh.bundle，不能作为 DSH 插件包安装' }
    }
    return {
      installable: true,
      packageName: String(pkg.name || ''),
      requiresBuildApproval: typeof pkg.scripts?.prepare === 'string',
      branch,
    }
  }
  return { installable: false, reason: '仓库根目录没有 package.json，不能作为 DSH 插件包安装' }
}

function allowProfileBuild(dshHome, profile, packageName) {
  if (!/^(?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+$/.test(packageName)) throw new Error('安装包名无效')
  const file = join(dshHome, 'profiles', profile, 'pnpm-workspace.yaml')
  const content = readFileSync(file, 'utf8')
  const lines = content.replaceAll('\r\n', '\n').split('\n')
  const header = lines.findIndex(line => /^allowBuilds:\s*$/.test(line))
  const key = JSON.stringify(packageName)
  if (header === -1) {
    const suffix = content.endsWith('\n') ? '' : '\n'
    writeFileSync(file, `${content}${suffix}\nallowBuilds:\n  ${key}: true\n`, 'utf8')
    return
  }
  let end = header + 1
  while (end < lines.length && (/^\s+.+:\s+(?:true|false)\s*$/.test(lines[end]) || /^\s*$/.test(lines[end]))) end++
  const existing = new RegExp(`^\\s+${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`)
  const quoted = new RegExp(`^\\s+${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`)
  const index = lines.findIndex((line, i) => i > header && i < end && (existing.test(line) || quoted.test(line)))
  if (index !== -1) lines[index] = `  ${key}: true`
  else lines.splice(end, 0, `  ${key}: true`)
  writeFileSync(file, lines.join('\n'), 'utf8')
}

async function startDsh(config, profile = 'web') {
  const port = await findFreePort(3080, 3090)
  if (port === null) {
    dialog.showErrorBox('无法启动', '端口 3080-3090 全部被占用，请关闭占用程序后重试。')
    app.exit(1)
    return null
  }
  // TOCTOU 守卫：退出窗口恰在 findFreePort 与 spawn 之间置位时，
  // 放弃本次启动，避免新 spawn 的 dsh 无人停止成为孤儿（.then 已有 svc 空判兜底）
  if (quitting) return null
  config.set('port', port)

  const { nodePath, pnpmBinDir, dshEntry } = resourcePaths()
  mkdirSync(config.logsDir(), { recursive: true })
  logStream?.end()
  logStream = createWriteStream(join(config.logsDir(), 'dsh.log'), { flags: 'a' })
  // write-after-end 守卫：kill 后 stdio 滞留数据在 end() 之后送达会触发
  // ERR_STREAM_WRITE_AFTER_END（真实 dsh 持续输出时高概率），noop 消除 uncaught
  logStream.on('error', () => {})
  const fullEnv = buildEnv({ DSH_HOME: config.dshHome(), binDir: pnpmBinDir })

  service = new DshService({
    nodePath, dshEntry, dshHome: config.dshHome(), port,
    env: fullEnv, logStream, waitForPortImpl: waitForPort, profile,
  })
  // post-start 的 'error' 必须挂监听（如真实 spawn 后段错误），否则 uncaught
  service.on('error', (err) => {
    logStream.write(`\n[dsh-desktop] dsh error: ${err.message}\n`)
  })
  service.on('exit', (code) => {
    if (quitting || manualRestart) return
    if (restartCount < 2 && code !== 0) {
      restartCount++
      logStream.write(`\n[dsh-desktop] dsh exited (${code}), restart #${restartCount}\n`)
      // 崩溃重启沿用当前 profile（如用户已切到 work，崩溃后不应退回 web）
      startDsh(config, service?.profile).then((svc) => {
        if (svc && mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(`http://127.0.0.1:${svc.port}/`)
      }).catch((err) => {
        if (quitting) return // 退出中不弹窗不写流
        logStream.write(`\n[dsh-desktop] dsh restart #${restartCount} failed: ${err.message}\n`)
        if (restartCount >= 2) {
          dialog.showErrorBox('dsh 重启失败', `${err.message}\n\n日志位置: ${join(config.logsDir(), 'dsh.log')}`)
        }
      })
    }
  })
  await service.start()
  return service
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    title: 'DeepSeek Harness',
    show: false,
    backgroundColor: themeValue('--dsw-alias-bg-base', '#ffffff'),
    accentColor: themeValue('--dsw-alias-bg-base', '#ffffff'),
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarOverlay(),
    webPreferences: {
      contextIsolation: true, nodeIntegration: false,
      preload: join(APP_ROOT, 'src', 'preload', 'theme-probe.cjs'),
    },
  })
  const titlebarCss = readFileSync(join(APP_ROOT, 'src', 'renderer', 'main-window.css'), 'utf8')
  let resolveInitialChrome
  const initialChromeReady = new Promise((resolve) => { resolveInitialChrome = resolve })
  let firstDocument = true
  mainWindow.webContents.on('dom-ready', async () => {
    try {
      await mainWindow.webContents.insertCSS(titlebarCss)
    } finally {
      if (firstDocument) {
        firstDocument = false
        resolveInitialChrome()
      }
    }
  })
  mainWindow.once('ready-to-show', async () => {
    await initialChromeReady
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
  })
  mainWindow.loadURL(`http://127.0.0.1:${service.port}/`)
  mainWindow.on('closed', () => { mainWindow = null })
}

// 子窗口统一管理：插件管理 / 插件市场 / 环境管理三个窗口，
// 无菜单栏 + parent 附属主窗口（关主窗口子窗口跟着关），按 kind 单例复用
function openChildWindow(kind) {
  const win = childWindows[kind]
  if (win && !win.isDestroyed()) {
    // 菜单视觉反馈：已开窗口聚焦 + 任务栏闪烁提示（#4 用户反馈）
    win.focus()
    win.flashFrame(true)
    setTimeout(() => { try { win.flashFrame(false) } catch { /* 窗口可能已关闭 */ } }, 800)
    return
  }
  const conf = {
    plugin: { width: 780, height: 820, minWidth: 560, minHeight: 560, file: 'plugin/index.html' },
    marketplace: { width: 960, height: 780, minWidth: 620, minHeight: 560, file: 'marketplace/index.html' },
    env: { width: 820, height: 680, minWidth: 560, minHeight: 520, file: 'environment/index.html' },
  }[kind]
  childWindows[kind] = new BrowserWindow({
    ...conf, title: { plugin: '插件管理', marketplace: '插件市场', env: '环境管理' }[kind],
    parent: mainWindow,
    show: false,
    backgroundColor: themeValue('--dsw-alias-bg-base', '#ffffff'),
    accentColor: themeValue('--dsw-alias-bg-base', '#ffffff'),
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarOverlay(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // 注意：package.json 是 "type": "module"，.js 会被当 ESM 加载；
      // ESM preload 要求 sandbox:false，故 preload 用 .cjs 保持沙箱默认开启
      preload: join(APP_ROOT, 'src', 'preload', 'management.cjs'),
    },
  })
  const childWindow = childWindows[kind]
  childWindow.setMenu(null)
  childWindow.loadFile(join(APP_ROOT, 'src', 'renderer', conf.file))
  // 主题应用：加载完成后先把当前主题推给子窗口（theme:get 兜底之外，确保首帧即一致）
  childWindow.webContents.on('did-finish-load', () => {
    childWindow.webContents.send('theme:changed', themeState)
  })
  // Chromium、动态主题和首批业务数据都准备好后才显示，避免空列表先闪一帧。
  childWindow.once('ready-to-show', async () => {
    try {
      await childWindow.webContents.executeJavaScript(
        'Promise.all([window.__themeReadyPromise, window.__contentReadyPromise])',
      )
    } catch {}
    if (!childWindow.isDestroyed()) childWindow.show()
  })
  childWindow.on('closed', () => { childWindows[kind] = null })
}

async function checkForUpdates(updateService, isManual = false) {
  const result = await updateService.check({ force: isManual })
  if (result.status === 'available') {
    pendingUpdateRelease = result.release
    return {
      status: 'available',
      currentVersion: `v${app.getVersion()}`,
      latestVersion: result.release.tag_name,
    }
  }
  if (!isManual || result.status === 'skipped') return null
  pendingUpdateRelease = null
  if (result.status === 'error') return { status: 'error', message: '暂时无法检查更新，请检查网络后重试。' }
  if (result.status === 'rate-limited') return { status: 'error', message: 'GitHub 请求次数受限，请稍后重试。' }
  return { status: 'current', currentVersion: `v${app.getVersion()}` }
}

// 锁定 userData 目录名为 %APPDATA%\DeepSeekHarness 与 spec 契约一致：
// package.json 无 productName 时 app.name 回退到 name（dsh-desktop），
// 而 electron-builder 的 productName 不影响 userData，故必须在
// app.getPath('userData') 之前显式 setName（独立于安装器 productName）
app.setName('DeepSeekHarness')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    const config = createConfig(app.getPath('userData'))
    const upgradeGuard = createUpgradeGuard({
      baseDir: app.getPath('userData'),
      dshHome: config.dshHome(),
      config,
      isPackaged: app.isPackaged,
      version: app.getVersion(),
    })
    const env = buildEnv({
      DSH_HOME: config.dshHome(),
      binDir: join(RESOURCES_DIR, 'bin'),
    })
    const pm = createPluginManager({
      nodePath: resourcePaths().nodePath,
      dshEntry: resourcePaths().dshEntry,
      dshHome: config.dshHome(),
      env,
      profile: () => service?.profile ?? 'web', // profile 穿透：跟随当前 service profile
      timeoutMs: 120000, // 插件安装最长 2 分钟，避免网络卡住拖死启动
    })
    const ps = createPluginService({
      nodePath: resourcePaths().nodePath,
      dshEntry: resourcePaths().dshEntry,
      dshHome: config.dshHome(),
      env,
      profile: () => service?.profile ?? 'web', // profile 穿透：跟随当前 service profile
      runDumpConfigImpl: runDumpConfig,
    })
    const mk = createMarketplace({ fetchImpl: fetchPluginsMd, cacheDir: join(config.dshHome(), '..', 'marketplace-cache') })
    const pf = createProfileService({ dshHome: config.dshHome() })
    const updateService = createUpdateService({ currentVersion: app.getVersion(), config })

    try {
      upgradeGuard.prepare()
      const savedProfile = String(config.get('lastProfile', 'web'))
      const startupProfile = pf.listProfiles().some(profile => profile.name === savedProfile) ? savedProfile : 'web'
      try {
        await startDsh(config, startupProfile)
      } catch (err) {
        if (startupProfile === 'web') throw err
        try { logStream?.write(`\n[dsh-desktop] profile ${startupProfile} 恢复失败，回退 web: ${err.message}\n`) } catch {}
        await startDsh(config, 'web')
      }
      config.set('lastProfile', service.profile)
    } catch (err) {
      dialog.showErrorBox('无法安全启动', `${err.message}\n\n原始用户数据未修改。`)
      app.exit(1)
      return
    }
    upgradeGuard.markSuccessful()

    createMainWindow()

    // 菜单平铺：v2 起去掉"应用"下拉，仅增加更新检查入口
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: '插件管理', click: () => openChildWindow('plugin') },
      { label: '插件市场', click: () => openChildWindow('marketplace') },
      { label: '环境管理', click: () => openChildWindow('env') },
      { label: '检查更新', click: async () => {
        const result = await checkForUpdates(updateService, true)
        if (result && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:result', result)
      } },
      { type: 'separator' },
      { label: '打开日志目录', click: () => shell.openPath(join(config.logsDir())) },
      { type: 'separator' },
      { role: 'quit', label: '退出' },
    ]))

    if (app.isPackaged) {
      setTimeout(async () => {
        try {
          const result = await checkForUpdates(updateService)
          if (result && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:result', result)
        } catch (err) {
          try { logStream.write(`\n[dsh-desktop] update check failed: ${err.message}\n`) } catch {}
        }
      }, 0)
    }

    globalThis.__pluginManager = pm
    // 统一重启入口：不带参重启当前 profile；带参（profiles:switch）切换 profile 重建
    globalThis.__restartDsh = async (profile = service?.profile ?? 'web') => {
      manualRestart = true
      restartCount = 0
      try {
        await service.restart(profile)
      } catch (err) {
        // 诊断埋点：手动重启失败路径原本无任何日志（错误只弹 UI），
        // 导致无法定位新进程 exit 的真实原因
        try { logStream.write(`\n[dsh-desktop] ${new Date().toISOString()} 手动重启失败: ${err.message}\n`) } catch {}
        throw err
      } finally {
        manualRestart = false
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(`http://127.0.0.1:${service.port}/`)
      }
    }

    ipcMain.handle('plugins:list', () => ps.list())
    ipcMain.handle('plugins:set-enabled', (_e, entryId, enabled) =>
      ps.setEnabled(String(entryId), enabled === true))
    ipcMain.handle('plugins:install', (_e, spec) => ps.install(String(spec), pm))
    ipcMain.handle('plugins:remove', (_e, name) => ps.remove(String(name), pm))
    ipcMain.handle('plugins:remove-insert', (_e, rowId) => ps.removeInsert(String(rowId)))
    ipcMain.handle('marketplace:get', (_e, refresh) => mk.get(refresh === true))
    ipcMain.handle('marketplace:inspect-repository', (event, repo) => {
      if (event.sender !== childWindows.marketplace?.webContents) return { installable: false, reason: '无效请求来源' }
      return inspectMarketplaceRepository(String(repo))
    })
    ipcMain.handle('marketplace:approve-build', async (event, packageName) => {
      if (event.sender !== childWindows.marketplace?.webContents) return false
      const profile = service?.profile ?? 'web'
      const result = await dialog.showMessageBox(childWindows.marketplace, {
        type: 'warning',
        buttons: ['允许并继续安装', '取消'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        title: '允许第三方构建脚本',
        message: `${packageName} 要求在安装时运行构建脚本`,
        detail: `只会在当前 ${profile} profile 中允许这个精确包名运行脚本。请仅在信任该 GitHub 仓库时继续。`,
      })
      if (result.response !== 0) return false
      allowProfileBuild(config.dshHome(), profile, String(packageName))
      return true
    })
    ipcMain.on('marketplace:open-repository', (event, value) => {
      if (event.sender !== childWindows.marketplace?.webContents || !isGitHubRepositoryUrl(value)) return
      shell.openExternal(value)
    })
    ipcMain.handle('profiles:list', () => pf.listProfiles())
    ipcMain.handle('profiles:create', (_e, name, template) => pf.createProfile(String(name), String(template ?? 'web')))
    ipcMain.handle('profiles:rename', (_e, oldName, newName) => pf.renameProfile(String(oldName), String(newName)))
    ipcMain.handle('profiles:remove', (_e, name) => pf.removeProfile(String(name)))
    ipcMain.handle('profiles:copy', (_e, from, to) => pf.copyProfile(String(from), String(to)))
    ipcMain.handle('profiles:switch', async (_e, name) => {
      const old = service.profile
      try {
        await globalThis.__restartDsh(String(name))
      } catch (err) {
        // 回滚：__restartDsh 内 restart 失败时 service.profile 已指向新 profile，
        // 必须显式传旧 profile（默认参 `service?.profile ?? 'web'` 此时取到的是新的）
        try { await globalThis.__restartDsh(old) } catch { /* 回滚失败也上报 */ }
        throw err
      }
      config.set('lastProfile', service.profile)
      return { ok: true }
    })
    // 手动/自动重启当前 dsh（#1 用户反馈：bundle 插件装/卸后需要重启生效，
    // v2 重构曾移除该通道导致"无法热插拔"）
    ipcMain.handle('dsh:restart', () => globalThis.__restartDsh())
    ipcMain.on('window:open', (event, kind) => {
      if (event.sender !== mainWindow?.webContents) return
      if (kind === 'plugin' || kind === 'marketplace' || kind === 'env') openChildWindow(kind)
    })
    ipcMain.handle('update:check', async (event) => {
      if (event.sender !== mainWindow?.webContents) return null
      return checkForUpdates(updateService, true)
    })
    ipcMain.on('update:action', (event, action) => {
      if (event.sender !== mainWindow?.webContents || !pendingUpdateRelease) return
      const release = pendingUpdateRelease
      pendingUpdateRelease = null
      if (action === 'download') shell.openExternal(release.html_url)
      if (action === 'ignore') updateService.ignore(release.tag_name)
    })
    ipcMain.handle('theme:get', () => themeState)
    // 主题广播：主窗口探针上报（MutationObserver + 2s 轮询兜底），实时推给所有子窗口
    // （通道名 'theme:changed' 与 preload.cjs 的 themeApi.onChange 契约一致）
    ipcMain.on('theme:probe', (_e, theme) => {
      themeState = theme
      syncWindowChrome(mainWindow)
      for (const [kind, win] of Object.entries(childWindows)) {
        if (win && !win.isDestroyed()) {
          syncWindowChrome(win)
          win.webContents.send('theme:changed', theme)
        }
      }
    })
  })

  // 退出竞态防护：quit 链一旦开始就置位，防止 stop() 的 child.kill()
  // （Windows TerminateProcess，exit code 非 0）触发 'exit' → 幽灵重启。
  // window-all-closed 必须在 service.stop() 之前置位——stop 期间的
  // 'exit' 事件先于 app.quit() 的 before-quit 到达。
  app.on('before-quit', () => { quitting = true })

  app.on('window-all-closed', async () => {
    quitting = true
    if (service) await service.stop()
    logStream?.end()
    app.quit()
  })
}
