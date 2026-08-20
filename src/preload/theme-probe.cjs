// 主题探针：监听 dsh UI（主窗口）的亮/暗模式与 --dsw-* 变量实际值，
// 上报给 main 进程广播到子窗口。事件驱动（MutationObserver）+ 2s 轮询兜底
// （覆盖插件注入 style 等 MutationObserver 监听不到的场景）。
const { ipcRenderer } = require('electron')

function collectTheme() {
  const isDark = document.body?.hasAttribute('data-ds-dark-theme') ?? false
  const variables = {}
  const styles = getComputedStyle(document.body)
  for (let i = 0; i < styles.length; i += 1) {
    const name = styles[i]
    if (name.startsWith('--dsw-')) variables[name] = styles.getPropertyValue(name).trim()
  }
  return { isDark, variables }
}

let lastJson = ''
let updateTrigger = null
let pendingUpdateResult = null

function closeUpdateDialog() {
  const backdrop = document.getElementById('dsh-desktop-update-backdrop')
  if (!backdrop || backdrop.hidden) return
  backdrop.hidden = true
  updateTrigger?.focus()
}

function showUpdateDialog(result) {
  if (!result) return
  const backdrop = document.getElementById('dsh-desktop-update-backdrop')
  const dialog = document.getElementById('dsh-desktop-update-dialog')
  if (!backdrop || !dialog) {
    pendingUpdateResult = result
    return
  }
  pendingUpdateResult = null
  const title = document.getElementById('dsh-desktop-update-title')
  const message = document.getElementById('dsh-desktop-update-message')
  const detail = document.getElementById('dsh-desktop-update-detail')
  const actions = document.getElementById('dsh-desktop-update-actions')
  actions.replaceChildren()

  if (result.status === 'available') {
    title.textContent = '发现新版本'
    message.textContent = `${result.latestVersion} 已可下载`
    detail.textContent = `当前版本 ${result.currentVersion}。新版安装不会删除现有用户数据，首次启动时还会创建升级快照。`
    for (const [label, action, className] of [
      ['跳过此版本', 'ignore', ''],
      ['稍后提醒', 'close', ''],
      ['前往下载', 'download', 'primary'],
    ]) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      button.className = className
      button.addEventListener('click', () => {
        if (action !== 'close') ipcRenderer.send('update:action', action)
        closeUpdateDialog()
      })
      actions.append(button)
    }
  } else {
    title.textContent = result.status === 'error' ? '检查更新失败' : '已是最新版本'
    message.textContent = result.status === 'error' ? result.message : `当前版本 ${result.currentVersion}`
    detail.textContent = result.status === 'error' ? '你可以稍后从标题栏再次检查。' : '当前安装已是最新稳定版本。'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'primary'
    button.textContent = '知道了'
    button.addEventListener('click', closeUpdateDialog)
    actions.append(button)
  }

  backdrop.hidden = false
  dialog.focus()
}

function report() {
  const theme = collectTheme()
  const json = JSON.stringify(theme)
  if (json === lastJson) return
  lastJson = json
  ipcRenderer.send('theme:probe', theme)
}

// 挂载逻辑：首报 + 挂 MutationObserver。preload 执行早于 DOM 构建，
// body 通常为 null，必须等 DOMContentLoaded 后再挂 observer（事件驱动通道），
// 否则只剩轮询兜底
function mount() {
  if (!document.body) return
  if (!document.getElementById('dsh-desktop-titlebar')) {
    const titlebar = document.createElement('div')
    titlebar.id = 'dsh-desktop-titlebar'
    const title = document.createElement('span')
    title.className = 'dsh-desktop-titlebar-title'
    title.textContent = 'DeepSeek Harness'
    const nav = document.createElement('nav')
    nav.className = 'dsh-desktop-titlebar-nav'
    nav.setAttribute('aria-label', '桌面管理')
    for (const [kind, label] of [
      ['plugin', '插件管理'],
      ['marketplace', '插件市场'],
      ['env', '环境管理'],
    ]) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      button.addEventListener('click', () => ipcRenderer.send('window:open', kind))
      nav.append(button)
    }
    const updateButton = document.createElement('button')
    updateButton.type = 'button'
    updateButton.textContent = '检查更新'
    updateButton.addEventListener('click', async () => {
      updateTrigger = updateButton
      updateButton.disabled = true
      updateButton.textContent = '检查中...'
      try {
        showUpdateDialog(await ipcRenderer.invoke('update:check'))
      } catch {
        showUpdateDialog({ status: 'error', message: '暂时无法检查更新，请稍后重试。' })
      } finally {
        updateButton.disabled = false
        updateButton.textContent = '检查更新'
      }
    })
    nav.append(updateButton)
    titlebar.append(title, nav)
    document.body.prepend(titlebar)

    const backdrop = document.createElement('div')
    backdrop.id = 'dsh-desktop-update-backdrop'
    backdrop.hidden = true
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) closeUpdateDialog()
    })
    const dialog = document.createElement('section')
    dialog.id = 'dsh-desktop-update-dialog'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.setAttribute('aria-labelledby', 'dsh-desktop-update-title')
    dialog.tabIndex = -1
    const kicker = document.createElement('span')
    kicker.className = 'dsh-desktop-update-kicker'
    kicker.textContent = 'DEEPSEEK HARNESS DESKTOP'
    const dialogTitle = document.createElement('h2')
    dialogTitle.id = 'dsh-desktop-update-title'
    const message = document.createElement('p')
    message.id = 'dsh-desktop-update-message'
    const detail = document.createElement('p')
    detail.id = 'dsh-desktop-update-detail'
    const actions = document.createElement('div')
    actions.id = 'dsh-desktop-update-actions'
    dialog.append(kicker, dialogTitle, message, detail, actions)
    backdrop.append(dialog)
    document.body.append(backdrop)
    if (pendingUpdateResult) showUpdateDialog(pendingUpdateResult)
  }
  report()
  new MutationObserver(report).observe(document.body, {
    attributes: true,
    attributeFilter: ['data-ds-dark-theme'],
  })
}

ipcRenderer.on('update:result', (_event, result) => showUpdateDialog(result))
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeUpdateDialog()
})

if (document.body) {
  mount()
} else {
  document.addEventListener('DOMContentLoaded', mount)
}
setInterval(report, 2000)
