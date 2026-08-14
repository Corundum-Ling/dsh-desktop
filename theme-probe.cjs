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
  report()
  new MutationObserver(report).observe(document.body, {
    attributes: true,
    attributeFilter: ['data-ds-dark-theme'],
  })
}

if (document.body) {
  mount()
} else {
  document.addEventListener('DOMContentLoaded', mount)
}
setInterval(report, 2000)
