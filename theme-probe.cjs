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

if (document.body) {
  report()
  new MutationObserver(report).observe(document.body, {
    attributes: true,
    attributeFilter: ['data-ds-dark-theme'],
  })
} else {
  document.addEventListener('DOMContentLoaded', report)
}
setInterval(report, 2000)
