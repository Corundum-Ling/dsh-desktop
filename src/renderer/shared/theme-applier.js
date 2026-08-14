// 接收主题广播并应用到 :root（变量值来自 dsh UI 实际计算值，含插件皮肤）
function applyTheme(theme) {
  if (!theme || !theme.variables) return
  const root = document.documentElement
  for (const [name, value] of Object.entries(theme.variables)) {
    if (value) root.style.setProperty(name, value)
  }
  if (theme.isDark) document.body.setAttribute('data-ds-dark-theme', '')
  else document.body.removeAttribute('data-ds-dark-theme')
}
window.__themeReadyPromise = Promise.resolve(window.themeApi?.get())
  .then((theme) => { if (theme) applyTheme(theme) })
  .catch(() => {})
  .then(() => new Promise((resolve) => {
    document.documentElement.setAttribute('data-theme-ready', '')
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  }))
window.themeApi?.onChange((theme) => {
  applyTheme(theme)
})
