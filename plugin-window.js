const statusEl = document.getElementById('status')
const specEl = document.getElementById('spec')
const installBtn = document.getElementById('install-btn')
const listEl = document.getElementById('plugin-list')
const outputEl = document.getElementById('output')
const countEl = document.getElementById('plugin-count')

let busy = false
function setStatus(text, isError = false) {
  statusEl.textContent = text
  statusEl.classList.toggle('error', isError)
}
function setBusy(value) {
  busy = value
  installBtn.disabled = value
  specEl.disabled = value
  for (const control of listEl.querySelectorAll('button, input')) control.disabled = value
}
function createEmptyState(title, detail) {
  const empty = document.createElement('div')
  empty.className = 'empty-state'
  const content = document.createElement('div')
  const heading = document.createElement('strong')
  heading.textContent = title
  const description = document.createElement('span')
  description.textContent = detail
  content.append(heading, description)
  empty.append(content)
  return empty
}
function createRowCopy(title, meta) {
  const copy = document.createElement('div')
  copy.className = 'row-copy'
  const titleEl = document.createElement('div')
  titleEl.className = 'row-title'
  titleEl.textContent = title
  const metaEl = document.createElement('div')
  metaEl.className = 'row-meta'
  metaEl.textContent = meta
  copy.append(titleEl, metaEl)
  return copy
}

async function refresh() {
  setBusy(true)
  try {
    const view = await window.pluginApi.list()
    listEl.innerHTML = ''
    countEl.textContent = `${view.rows.length + view.inserts.length} 项`
    if (!view.rows.length && !view.inserts.length) {
      listEl.append(createEmptyState('暂无已挂载插件', 'dsh 可能尚未就绪，也可以从上方安装一个插件。'))
      return
    }
    // bundle 分组
    const groups = {}
    for (const row of view.rows) {
      const key = row.bundle || '(未归属)'
      ;(groups[key] ??= []).push(row)
    }
    for (const [bundle, rows] of Object.entries(groups)) {
      const section = document.createElement('section')
      section.className = 'bundle-section'
      const g = document.createElement('div')
      g.className = 'bundle-group'
      g.textContent = `${bundle} · ${rows.length}`
      const panel = document.createElement('div')
      panel.className = 'list-panel'
      section.append(g, panel)
      listEl.append(section)
      for (const row of rows) {
        const item = document.createElement('div')
        item.className = 'plugin-row'
        const copy = createRowCopy(row.name || row.id, row.name ? row.id : '名称不可用')
        const right = document.createElement('div')
        right.className = 'row-actions'
        // 启停开关（bundle 行可启停）
        const sw = document.createElement('label')
        sw.className = 'switch'
        sw.title = `${row.disabled ? '启用' : '禁用'} ${row.name || row.id}`
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = !row.disabled
        cb.setAttribute('aria-label', sw.title)
        cb.onchange = async () => {
          if (busy) { cb.checked = !cb.checked; return }
          setBusy(true)
          try {
            const res = await window.pluginApi.setEnabled(row.id, cb.checked)
            if (!res.ok) {
              setStatus(`启停失败: ${res.output}`, true)
              cb.checked = !cb.checked
            } else {
              // rc.6 的 patch HMR 在桌面封装中不稳定，重启确保配置生效。
              setStatus(`${row.id} ${cb.checked ? '已启用' : '已禁用'}，正在重启 dsh...`)
              try {
                await window.pluginApi.restart()
                setStatus(`${row.id} ${cb.checked ? '已启用' : '已禁用'}（重启生效）`)
              } catch (err) {
                setStatus(`配置已更新，但重启失败: ${err.message}`, true)
              }
            }
          } catch (err) {
            setStatus(`操作失败: ${err.message}`, true)
          } finally {
            setBusy(false)
          }
        }
        const slider = document.createElement('span')
        slider.className = 'slider'
        sw.append(cb, slider)
        right.append(sw)
        // 卸载按钮（核心组件禁用，core 由 list 按 bundle 归属标注）
        if (!row.core) {
          const rm = document.createElement('button')
          rm.className = 'danger compact'
          rm.textContent = '卸载'
          rm.setAttribute('aria-label', `卸载 ${row.name || row.id}`)
          rm.onclick = async () => {
            if (busy) return
            setBusy(true)
            outputEl.hidden = false
            try {
              const res = await window.pluginApi.remove(row.name)
              outputEl.textContent = res.output
              if (res.ok && res.needsRestart) {
                setStatus('已卸载，正在重启 dsh...')
                try {
                  await window.pluginApi.restart()
                  setStatus('卸载完成，dsh 已重启')
                } catch (err) {
                  setStatus(`插件已卸载，但重启失败: ${err.message}`, true)
                }
              } else {
                setStatus(res.ok ? '已卸载' : '卸载失败（见输出）', !res.ok)
              }
            } catch (err) {
              setStatus(`卸载失败: ${err.message}`, true)
            } finally {
              setBusy(false)
            }
            await refresh()
          }
          right.append(rm)
        } else {
          const tag = document.createElement('span')
          tag.className = 'badge ok'
          tag.textContent = '核心'
          right.append(tag)
        }
        item.append(copy, right)
        panel.append(item)
      }
    }
    // 非 bundle insert 行
    if (view.inserts.length) {
      const section = document.createElement('section')
      section.className = 'bundle-section'
      const g = document.createElement('div')
      g.className = 'bundle-group'
      g.textContent = `非 bundle 插件 · ${view.inserts.length}`
      const panel = document.createElement('div')
      panel.className = 'list-panel'
      section.append(g, panel)
      listEl.append(section)
      for (const ins of view.inserts) {
        const item = document.createElement('div')
        item.className = 'plugin-row'
        const copy = createRowCopy(ins.name, ins.id)
        // 启停开关（insert 行：块存在即挂载中；禁用 = 移除 insert 块，HMR 实时卸载）
        const sw = document.createElement('label')
        sw.className = 'switch'
        sw.title = `禁用 ${ins.name}`
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = true
        cb.setAttribute('aria-label', sw.title)
        cb.onchange = async () => {
          if (busy) { cb.checked = !cb.checked; return }
          setBusy(true)
          try {
            const res = await window.pluginApi.setEnabled(ins.id, cb.checked)
            if (!res.ok) {
              setStatus(`启停失败: ${res.output}`, true)
              cb.checked = !cb.checked
            } else {
              setStatus(`${ins.name} ${cb.checked ? '已启用' : '已禁用'}，正在重启 dsh...`)
              try {
                await window.pluginApi.restart()
                setStatus(`${ins.name} ${cb.checked ? '已启用' : '已禁用'}（配置已写入）`)
              } catch (err) {
                setStatus(`配置已更新，但重启失败: ${err.message}`, true)
              }
            }
          } catch (err) {
            setStatus(`操作失败: ${err.message}`, true)
          } finally {
            setBusy(false)
          }
        }
        const slider = document.createElement('span')
        slider.className = 'slider'
        sw.append(cb, slider)
        const rm = document.createElement('button')
        rm.className = 'danger compact'
        rm.textContent = '卸载'
        rm.setAttribute('aria-label', `卸载 ${ins.name}`)
        rm.onclick = async () => {
          if (busy) return
          setBusy(true)
          try {
            const res = await window.pluginApi.removeInsert(ins.id)
            setStatus(res.ok ? '已实时卸载' : `失败: ${res.output}`, !res.ok)
            await refresh()
          } catch (err) {
            setStatus(`卸载失败: ${err.message}`, true)
          } finally {
            setBusy(false)
          }
        }
        const right = document.createElement('div')
        right.className = 'row-actions'
        right.append(sw, rm)
        item.append(copy, right)
        panel.append(item)
      }
    }
  } catch (err) {
    setStatus(`加载失败: ${err.message}`, true)
  } finally {
    setBusy(false)
  }
}

installBtn.onclick = async () => {
  const spec = specEl.value.trim()
  if (!spec || busy) {
    if (!spec) setStatus('请输入插件包名或 GitHub 仓库地址', true)
    return
  }
  setBusy(true)
  setStatus(`正在安装 ${spec}...`)
  outputEl.hidden = false
  try {
    const res = await window.pluginApi.install(spec)
    outputEl.textContent = res.output
    if (res.ok) {
      if (res.needsRestart) {
        setStatus('安装成功，正在重启 dsh...')
        try {
          await window.pluginApi.restart()
          setStatus('重启完成（插件效果请以 dsh UI 实际表现为准）')
        } catch (err) {
          setStatus(`插件已安装，但重启失败: ${err.message}`, true)
        }
      } else {
        setStatus('安装完成（效果请以 dsh UI 实际表现为准）')
      }
    } else {
      setStatus('安装失败（见下方输出）', true)
    }
    specEl.value = ''
  } catch (err) {
    outputEl.textContent = String(err)
    setStatus(`安装失败: ${err.message}`, true)
  } finally {
    setBusy(false)
  }
  await refresh()
}

specEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') installBtn.click()
})

refresh()
