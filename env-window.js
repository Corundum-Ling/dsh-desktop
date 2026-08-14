const statusEl = document.getElementById('status')
const newNameEl = document.getElementById('new-name')
const createBtn = document.getElementById('create-btn')
const listEl = document.getElementById('profile-list')
const outputEl = document.getElementById('output')

async function refresh() {
  const profiles = await window.pluginApi.listProfiles()
  listEl.innerHTML = ''
  if (!profiles.length) {
    listEl.innerHTML = '<div style="color:var(--dsw-alias-label-secondary)">无 profile</div>'
    return
  }
  for (const p of profiles) {
    const item = document.createElement('div')
    item.className = 'plugin-row'
    const label = document.createElement('span')
    label.textContent = `${p.name}  (${(p.bundles || []).join(', ') || '无 bundle'})`
    const right = document.createElement('div')
    right.style.display = 'flex'
    right.style.gap = '6px'
    const run = document.createElement('button')
    run.className = 'primary'
    run.textContent = '切换启动'
    run.onclick = async () => {
      if (statusEl.textContent === '切换中...') return
      statusEl.textContent = `正在切换到 ${p.name}（dsh 将重启）...`
      outputEl.hidden = false
      try {
        const res = await window.pluginApi.switchProfile(p.name)
        outputEl.textContent = JSON.stringify(res)
        statusEl.textContent = '切换完成'
      } catch (err) {
        outputEl.textContent = String(err)
        statusEl.textContent = '切换失败'
      }
    }
    const copy = document.createElement('button')
    copy.textContent = '复制'
    copy.onclick = async () => {
      const to = prompt('复制为:', p.name + '-copy')
      if (!to) return
      try {
        await window.pluginApi.copyProfile(p.name, to)
        await refresh()
      } catch (err) { statusEl.textContent = `复制失败: ${err.message}` }
    }
    const rename = document.createElement('button')
    rename.textContent = '重命名'
    rename.onclick = async () => {
      const to = prompt('新名称:', p.name)
      if (!to || to === p.name) return
      try {
        await window.pluginApi.renameProfile(p.name, to)
        await refresh()
      } catch (err) { statusEl.textContent = `重命名失败: ${err.message}` }
    }
    const del = document.createElement('button')
    del.className = 'danger'
    del.textContent = '删除'
    del.onclick = async () => {
      if (!confirm(`删除 profile ${p.name}？`)) return
      try {
        await window.pluginApi.removeProfile(p.name)
        await refresh()
      } catch (err) { statusEl.textContent = `删除失败: ${err.message}` }
    }
    right.append(run, copy, rename, del)
    item.append(label, right)
    listEl.append(item)
  }
}

createBtn.onclick = async () => {
  const name = newNameEl.value.trim()
  if (!name) return
  try {
    await window.pluginApi.createProfile(name, 'web')
    newNameEl.value = ''
    await refresh()
  } catch (err) { statusEl.textContent = `创建失败: ${err.message}` }
}

refresh()
