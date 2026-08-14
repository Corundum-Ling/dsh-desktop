const statusEl = document.getElementById('status')
const newNameEl = document.getElementById('new-name')
const createBtn = document.getElementById('create-btn')
const listEl = document.getElementById('profile-list')
const outputEl = document.getElementById('output')
const countEl = document.getElementById('profile-count')

let busy = false

function setStatus(text, isError = false) {
  statusEl.textContent = text
  statusEl.classList.toggle('error', isError)
}

function setBusy(value) {
  busy = value
  createBtn.disabled = value
  newNameEl.disabled = value
  for (const button of listEl.querySelectorAll('button')) button.disabled = value
  for (const control of document.querySelectorAll('.ask-input-row button, .ask-input-row input')) control.disabled = value
}

function createEmptyState() {
  const empty = document.createElement('div')
  empty.className = 'empty-state'
  const content = document.createElement('div')
  const title = document.createElement('strong')
  title.textContent = '还没有可用环境'
  const detail = document.createElement('span')
  detail.textContent = '使用上方表单创建第一个 profile。'
  content.append(title, detail)
  empty.append(content)
  return empty
}

/** Electron 渲染进程无 window.prompt：用页内编辑条完成输入。 */
function askInput(title, initial, trigger, action) {
  if (busy) return
  document.querySelector('.ask-input-row')?.remove()
  const box = document.createElement('div')
  box.className = 'ask-input-row'
  const label = document.createElement('label')
  label.textContent = title
  const input = document.createElement('input')
  input.type = 'text'
  input.value = initial
  label.htmlFor = `profile-dialog-${Date.now()}`
  input.id = label.htmlFor
  const ok = document.createElement('button')
  ok.className = 'primary compact'
  ok.textContent = '确认'
  const cancel = document.createElement('button')
  cancel.className = 'compact'
  cancel.textContent = '取消'
  const finish = (value) => {
    box.remove()
    if (trigger.isConnected) trigger.focus()
    action(value)
  }
  ok.onclick = () => finish(input.value.trim())
  cancel.onclick = () => finish(null)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(input.value.trim())
    if (e.key === 'Escape') finish(null)
  })
  box.append(label, input, ok, cancel)
  document.body.append(box)
  input.focus()
  input.select()
}

function askConfirmation(title, trigger, action) {
  if (busy) return
  document.querySelector('.ask-input-row')?.remove()
  const box = document.createElement('div')
  box.className = 'ask-input-row confirm-row'
  box.setAttribute('role', 'alertdialog')
  box.setAttribute('aria-label', title)
  const label = document.createElement('label')
  label.textContent = title
  const spacer = document.createElement('span')
  const ok = document.createElement('button')
  ok.className = 'danger compact'
  ok.textContent = '确认删除'
  const cancel = document.createElement('button')
  cancel.className = 'compact'
  cancel.textContent = '取消'
  ok.onclick = () => { box.remove(); action() }
  cancel.onclick = () => {
    box.remove()
    if (trigger.isConnected) trigger.focus()
  }
  box.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') cancel.click()
  })
  box.append(label, spacer, ok, cancel)
  document.body.append(box)
  cancel.focus()
}

async function refresh() {
  try {
    const profiles = await window.pluginApi.listProfiles()
    listEl.innerHTML = ''
    countEl.textContent = `${profiles.length} 项`
    if (!profiles.length) {
      listEl.classList.remove('list-panel')
      listEl.append(createEmptyState())
      return
    }
    listEl.classList.add('list-panel')
    for (const p of profiles) {
      const item = document.createElement('div')
      item.className = 'plugin-row'
      const copyBlock = document.createElement('div')
      copyBlock.className = 'row-copy'
      const title = document.createElement('div')
      title.className = 'row-title'
      title.textContent = p.name
      const meta = document.createElement('div')
      meta.className = 'row-meta'
      meta.textContent = (p.bundles || []).join(' · ') || '无 bundle'
      copyBlock.append(title, meta)
      const right = document.createElement('div')
      right.className = 'row-actions'
      const run = document.createElement('button')
      run.className = 'primary compact'
      run.textContent = '切换启动'
      run.setAttribute('aria-label', `切换启动 ${p.name}`)
      run.onclick = async () => {
        if (busy) return
        setBusy(true)
        setStatus(`正在切换到 ${p.name}，dsh 将重启...`)
        outputEl.hidden = false
        try {
          const res = await window.pluginApi.switchProfile(p.name)
          outputEl.textContent = JSON.stringify(res, null, 2)
          setStatus(`已切换到 ${p.name}`)
        } catch (err) {
          outputEl.textContent = String(err)
          setStatus(`切换失败: ${err.message}`, true)
        } finally {
          setBusy(false)
        }
      }
      const copy = document.createElement('button')
      copy.className = 'compact'
      copy.textContent = '复制'
      copy.setAttribute('aria-label', `复制 ${p.name}`)
      copy.onclick = () => {
        askInput('复制为', p.name + '-copy', copy, async (to) => {
          if (!to) return
          setBusy(true)
          try {
            await window.pluginApi.copyProfile(p.name, to)
            setStatus(`已复制为 ${to}`)
            await refresh()
          } catch (err) {
            setStatus(`复制失败: ${err.message}`, true)
          } finally {
            setBusy(false)
          }
        })
      }
      const rename = document.createElement('button')
      rename.className = 'compact'
      rename.textContent = '重命名'
      rename.setAttribute('aria-label', `重命名 ${p.name}`)
      rename.onclick = () => {
        askInput('新名称', p.name, rename, async (to) => {
          if (!to || to === p.name) return
          setBusy(true)
          try {
            await window.pluginApi.renameProfile(p.name, to)
            setStatus(`已重命名为 ${to}`)
            await refresh()
          } catch (err) {
            setStatus(`重命名失败: ${err.message}`, true)
          } finally {
            setBusy(false)
          }
        })
      }
      const del = document.createElement('button')
      del.className = 'danger compact'
      del.textContent = '删除'
      del.setAttribute('aria-label', `删除 ${p.name}`)
      del.onclick = () => {
        if (busy) return
        askConfirmation(`删除 profile “${p.name}”？此操作不会删除其他环境。`, del, async () => {
          setBusy(true)
          try {
            await window.pluginApi.removeProfile(p.name)
            setStatus(`已删除 ${p.name}`)
            await refresh()
          } catch (err) {
            setStatus(`删除失败: ${err.message}`, true)
          } finally {
            setBusy(false)
          }
        })
      }
      right.append(run, copy, rename, del)
      item.append(copyBlock, right)
      listEl.append(item)
    }
  } catch (err) {
    setStatus(`环境加载失败: ${err.message}`, true)
  }
}

createBtn.onclick = async () => {
  const name = newNameEl.value.trim()
  if (!name || busy) {
    if (!name) setStatus('请输入 profile 名称', true)
    return
  }
  setBusy(true)
  try {
    await window.pluginApi.createProfile(name, 'web')
    newNameEl.value = ''
    setStatus(`已创建 ${name}`)
    await refresh()
  } catch (err) {
    setStatus(`创建失败: ${err.message}`, true)
  } finally {
    setBusy(false)
  }
}

newNameEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') createBtn.click()
})

window.__contentReadyPromise = refresh()
