const statusEl = document.getElementById('status')
const specEl = document.getElementById('spec')
const installBtn = document.getElementById('install-btn')
const listEl = document.getElementById('plugin-list')
const outputEl = document.getElementById('output')

async function refresh() {
  const plugins = await window.pluginApi.list()
  listEl.innerHTML = ''
  if (plugins.length === 0) {
    listEl.innerHTML = '<li style="color:#999">暂无插件</li>'
    return
  }
  for (const p of plugins) {
    const li = document.createElement('li')
    const nameSpan = document.createElement('span')
    nameSpan.textContent = `${p.name}@${p.version}`
    const btn = document.createElement('button')
    btn.textContent = '卸载'
    btn.onclick = async () => {
      statusEl.textContent = `正在卸载 ${p.name}...`
      outputEl.hidden = false
      const res = await window.pluginApi.remove(p.name)
      outputEl.textContent = res.output
      if (res.ok) {
        statusEl.textContent = '卸载成功，正在重启 dsh...'
        await window.pluginApi.restart()
        statusEl.textContent = '重启完成'
      } else {
        statusEl.classList.add('error')
        statusEl.textContent = '卸载失败（见下方输出）'
      }
      await refresh()
    }
    li.append(nameSpan, btn)
    listEl.append(li)
  }
}

installBtn.onclick = async () => {
  const spec = specEl.value.trim()
  if (!spec) return
  statusEl.textContent = `正在安装 ${spec}...`
  outputEl.hidden = false
  const res = await window.pluginApi.install(spec)
  outputEl.textContent = res.output
  if (res.ok) {
    statusEl.textContent = '安装成功，正在重启 dsh...'
    await window.pluginApi.restart()
    statusEl.textContent = '重启完成'
  } else {
    statusEl.classList.add('error')
    statusEl.textContent = '安装失败（见下方输出）。若为 git 插件构建权限问题，请改用 npm 已发布包。'
  }
  specEl.value = ''
  await refresh()
}

refresh()
