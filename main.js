import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWriteStream, mkdirSync } from 'node:fs'
import { createConfig } from './src/config.js'
import { findFreePort, waitForPort } from './src/port-waiter.js'
import { DshService } from './src/dsh-service.js'
import { createPluginManager } from './src/plugin-manager.js'
import { createPluginService } from './src/plugin-service.js'
import { createMarketplace } from './src/marketplace.js'
import { createProfileService } from './src/profile-service.js'
import { runDumpConfig } from './src/dump-config.js'
import { buildEnv } from './src/main-env.js'

// ESM 下没有全局 __dirname，用 import.meta.url 推导
const __dirname = dirname(fileURLToPath(import.meta.url))

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
// themeState 占位（Task 9 主题同步完善其内容与广播）
let themeState = { isDark: false, variables: {} }

function resourcePaths() {
  return { nodePath, pnpmBinDir, dshEntry }
}

// 市场数据源：拉取 awesome-dsh-plugins 的 PLUGINS.md 原始内容，
// createMarketplace 负责解析与缓存
async function fetchPluginsMd() {
  const res = await fetch('https://raw.githubusercontent.com/AdamPlatin123/awesome-dsh-plugins/main/PLUGINS.md')
  if (!res.ok) throw new Error(`市场数据源 HTTP ${res.status}`)
  return res.text()
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
    webPreferences: {
      contextIsolation: true, nodeIntegration: false,
      preload: join(__dirname, 'theme-probe.cjs'),
    },
  })
  mainWindow.loadURL(`http://127.0.0.1:${service.port}/`)
  mainWindow.on('closed', () => { mainWindow = null })
}

// 子窗口统一管理：插件管理 / 插件市场 / 环境管理三个窗口，
// 无菜单栏 + parent 附属主窗口（关主窗口子窗口跟着关），按 kind 单例复用
function openChildWindow(kind) {
  const win = childWindows[kind]
  if (win && !win.isDestroyed()) { win.focus(); return }
  const conf = {
    plugin: { width: 720, height: 800, file: 'plugin-window.html' },
    marketplace: { width: 900, height: 760, file: 'marketplace-window.html' },
    env: { width: 640, height: 560, file: 'env-window.html' },
  }[kind]
  childWindows[kind] = new BrowserWindow({
    ...conf, title: { plugin: '插件管理', marketplace: '插件市场', env: '环境管理' }[kind],
    parent: mainWindow,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // 注意：package.json 是 "type": "module"，.js 会被当 ESM 加载；
      // ESM preload 要求 sandbox:false，故 preload 用 .cjs 保持沙箱默认开启
      preload: join(__dirname, 'preload.cjs'),
    },
  })
  childWindows[kind].setMenu(null)
  childWindows[kind].loadFile(join(__dirname, conf.file))
  // 主题应用：加载完成后先把当前主题推给子窗口（theme:get 兜底之外，确保首帧即一致）
  childWindows[kind].webContents.on('did-finish-load', () => {
    childWindows[kind].webContents.send('theme:changed', themeState)
  })
  childWindows[kind].on('closed', () => { childWindows[kind] = null })
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

    try {
      await startDsh(config)
    } catch (err) {
      dialog.showErrorBox('dsh 启动失败', `${err.message}\n\n日志位置: ${join(config.logsDir(), 'dsh.log')}`)
      app.exit(1)
      return
    }

    createMainWindow()

    // 菜单平铺：v2 起去掉"应用"下拉，顶层直接五项
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: '插件管理', click: () => openChildWindow('plugin') },
      { label: '插件市场', click: () => openChildWindow('marketplace') },
      { label: '环境管理', click: () => openChildWindow('env') },
      { type: 'separator' },
      { label: '打开日志目录', click: () => shell.openPath(join(config.logsDir())) },
      { type: 'separator' },
      { role: 'quit', label: '退出' },
    ]))

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
      return { ok: true }
    })
    ipcMain.handle('theme:get', () => themeState)
    // 主题广播：主窗口探针上报（MutationObserver + 2s 轮询兜底），实时推给所有子窗口
    // （通道名 'theme:changed' 与 preload.cjs 的 themeApi.onChange 契约一致）
    ipcMain.on('theme:probe', (_e, theme) => {
      themeState = theme
      for (const [kind, win] of Object.entries(childWindows)) {
        if (win && !win.isDestroyed()) win.webContents.send('theme:changed', theme)
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
