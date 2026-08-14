import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWriteStream, mkdirSync } from 'node:fs'
import { createConfig } from './src/config.js'
import { findFreePort, waitForPort } from './src/port-waiter.js'
import { DshService } from './src/dsh-service.js'
import { createPluginManager } from './src/plugin-manager.js'
import { buildEnv } from './src/main-env.js'

// ESM 下没有全局 __dirname，用 import.meta.url 推导
const __dirname = dirname(fileURLToPath(import.meta.url))

const RESOURCES_DIR = process.env.DSH_DESKTOP_DEV === '1'
  ? join(process.cwd(), 'resources')
  : join(process.resourcesPath, 'resources')

const nodePath = join(RESOURCES_DIR, 'node', 'node.exe')
const pnpmBinDir = join(RESOURCES_DIR, 'bin')
const dshEntry = join(RESOURCES_DIR, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

let mainWindow = null
let pluginWindow = null
let service = null
let restartCount = 0

function resourcePaths() {
  return { nodePath, pnpmBinDir, dshEntry }
}

async function startDsh(config) {
  const port = await findFreePort(3080, 3090)
  if (port === null) {
    dialog.showErrorBox('无法启动', '端口 3080-3090 全部被占用，请关闭占用程序后重试。')
    app.exit(1)
    return null
  }
  config.set('port', port)

  const { nodePath, pnpmBinDir, dshEntry } = resourcePaths()
  mkdirSync(config.logsDir(), { recursive: true })
  const logStream = createWriteStream(join(config.logsDir(), 'dsh.log'), { flags: 'a' })
  const fullEnv = buildEnv({ DSH_HOME: config.dshHome(), binDir: pnpmBinDir })

  service = new DshService({
    nodePath, dshEntry, dshHome: config.dshHome(), port,
    env: fullEnv, logStream, waitForPortImpl: waitForPort,
  })
  // post-start 的 'error' 必须挂监听（如真实 spawn 后段错误），否则 uncaught
  service.on('error', (err) => {
    logStream.write(`\n[dsh-desktop] dsh error: ${err.message}\n`)
  })
  service.on('exit', (code) => {
    if (restartCount < 2 && code !== 0) {
      restartCount++
      logStream.write(`\n[dsh-desktop] dsh exited (${code}), restart #${restartCount}\n`)
      startDsh(config).then((svc) => {
        if (svc && mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(`http://127.0.0.1:${svc.port}/`)
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
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  mainWindow.loadURL(`http://127.0.0.1:${service.port}/`)
}

function createPluginWindow() {
  if (pluginWindow && !pluginWindow.isDestroyed()) {
    pluginWindow.focus()
    return
  }
  pluginWindow = new BrowserWindow({
    width: 640, height: 720,
    title: '插件管理',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // 注意：package.json 是 "type": "module"，.js 会被当 ESM 加载；
      // ESM preload 要求 sandbox:false，故 preload 用 .cjs 保持沙箱默认开启
      preload: join(__dirname, 'preload.cjs'),
    },
  })
  pluginWindow.loadFile(join(__dirname, 'plugin-window.html'))
  pluginWindow.on('closed', () => { pluginWindow = null })
}

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
    })

    try {
      await startDsh(config)
    } catch (err) {
      dialog.showErrorBox('dsh 启动失败', `${err.message}\n\n日志位置: ${join(config.logsDir(), 'dsh.log')}`)
      app.exit(1)
      return
    }

    createMainWindow()

    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: '应用', submenu: [
        { label: '插件管理', click: createPluginWindow },
        { label: '打开 dsh 日志目录', click: () => shell.openPath(join(config.logsDir())) },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ]},
    ]))

    globalThis.__pluginManager = pm
    globalThis.__restartDsh = async () => {
      restartCount = 0
      await service.restart()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(`http://127.0.0.1:${service.port}/`)
      }
    }
  })

  app.on('window-all-closed', async () => {
    if (service) await service.stop()
    app.quit()
  })
}
