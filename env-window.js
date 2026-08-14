const statusEl = document.getElementById('status')
const newNameEl = document.getElementById('new-name')
const createBtn = document.getElementById('create-btn')
const listEl = document.getElementById('profile-list')
const outputEl = document.getElementById('output')

let busy = false

/** Electron 渲染进程无 window.prompt：在 search-row 临时渲染 label+input+确认/取消 */
function askInput(title, initial, action) {
  const row = document.querySelector('.search-row')
  const box = document.createElement('div')
  box.className = 'ask-input-row'
  box.style.display = 'flex'
  box.style.gap = '8px'
  box.style.alignItems = 'center'
  const label = document.createElement('span')
  label.textContent = title
  const input = document.createElement('input')
  input.value = initial
  const ok = document.createElement('button')
  ok.className = 'primary'
  ok.textContent = '确认'
  const cancel = document.createElement('button')
  cancel.textContent = '取消'
  const finish = (value) => { box.remove(); action(value) }
  ok.onclick = () => finish(input.value.trim())
  cancel.onclick = () => finish(null)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(input.value.trim())
    if (e.key === 'Escape') finish(null)
  })
  box.append(label, input, ok, cancel)
  row.append(box)
  input.focus()
  input.select()
}

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
      if (busy) return
      busy = true
      statusEl.textContent = `正在切换到 ${p.name}（dsh 将重启）...`
      outputEl.hidden = false
      try {
        const res = await window.pluginApi.switchProfile(p.name)
        outputEl.textContent = JSON.stringify(res)
        statusEl.textContent = '切换完成'
      } catch (err) {
        outputEl.textContent = String(err)
        statusEl.textContent = '切换失败'
      } finally {
        busy = false
      }
    }
    const copy = document.createElement('button')
    copy.textContent = '复制'
    copy.onclick = async () => {
      askInput('复制为:', p.name + '-copy', async (to) => {
        if (!to) return
        try {
          await window.pluginApi.copyProfile(p.name, to)
          await refresh()
        } catch (err) { statusEl.textContent = `复制失败: ${err.message}` }
      })
    }
    const rename = document.createElement('button')
    rename.textContent = '重命名'
    rename.onclick = async () => {
      askInput('新名称:', p.name, async (to) => {
        if (!to || to === p.name) return
        try {
          await window.pluginApi.renameProfile(p.name, to)
          await refresh()
        } catch (err) { statusEl.textContent = `重命名失败: ${err.message}` }
      })
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
