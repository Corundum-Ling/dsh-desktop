const statusEl = document.getElementById('status')
const specEl = document.getElementById('spec')
const installBtn = document.getElementById('install-btn')
const listEl = document.getElementById('plugin-list')
const outputEl = document.getElementById('output')

let busy = false
function setStatus(text, isError = false) {
  statusEl.textContent = text
  statusEl.classList.toggle('error', isError)
}
function setBusy(value) {
  busy = value
  installBtn.disabled = value
  for (const b of listEl.querySelectorAll('button')) b.disabled = value
}

async function refresh() {
  try {
    const view = await window.pluginApi.list()
    listEl.innerHTML = ''
    if (!view.rows.length && !view.inserts.length) {
      listEl.innerHTML = '<div style="color:var(--dsw-alias-label-secondary)">暂无插件行（dsh 未就绪或行树为空）</div>'
      return
    }
    // bundle 分组
    const groups = {}
    for (const row of view.rows) {
      const key = row.bundle || '(未归属)'
      ;(groups[key] ??= []).push(row)
    }
    for (const [bundle, rows] of Object.entries(groups)) {
      const g = document.createElement('div')
      g.className = 'bundle-group'
      g.textContent = bundle
      listEl.append(g)
      for (const row of rows) {
        const item = document.createElement('div')
        item.className = 'plugin-row'
        const label = document.createElement('span')
        label.textContent = `${row.id}  (${row.name || '? '})`
        const right = document.createElement('div')
        right.style.display = 'flex'
        right.style.alignItems = 'center'
        right.style.gap = '8px'
        // 启停开关（bundle 行可启停）
        const sw = document.createElement('label')
        sw.className = 'switch'
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = !row.disabled
        cb.onchange = async () => {
          if (busy) { cb.checked = !cb.checked; return }
          setBusy(true)
          const res = await window.pluginApi.setEnabled(row.id, cb.checked)
          setBusy(false)
          if (!res.ok) { setStatus(`启停失败: ${res.output}`, true); cb.checked = !cb.checked }
          else {
            // dsh rc.6 的 cordis.patch.yml HMR 在我们环境不生效（实测），
            // 启停后自动重启保证生效（重启 = 重新加载 patch，100% 可靠）
            setStatus(`${row.id} ${cb.checked ? '已启用' : '已禁用'}，正在重启 dsh...`)
            try {
              await window.pluginApi.restart()
              setStatus(`${row.id} ${cb.checked ? '已启用' : '已禁用'}（重启生效）`)
            } catch (err) {
              setStatus(`重启失败: ${err.message}（可稍后重开应用）`, true)
            }
          }
        }
        const slider = document.createElement('span')
        slider.className = 'slider'
        sw.append(cb, slider)
        right.append(sw)
        // 卸载按钮（核心组件禁用，core 由 list 按 bundle 归属标注）
        if (!row.core) {
          const rm = document.createElement('button')
          rm.className = 'danger'
          rm.textContent = '卸载'
          rm.onclick = async () => {
            if (busy) return
            setBusy(true)
            outputEl.hidden = false
            const res = await window.pluginApi.remove(row.name)
            outputEl.textContent = res.output
            setBusy(false)
            if (res.ok && res.needsRestart) {
              // bundle 卸载后自动重启（#1 用户反馈：不会自动重启无法热插拔）
              setStatus('已卸载，正在重启 dsh...')
              try {
                await window.pluginApi.restart()
                setStatus('重启完成')
              } catch (err) {
                setStatus(`重启失败: ${err.message}（可稍后重开应用）`, true)
              }
            } else {
              setStatus(res.ok ? '已卸载' : '卸载失败（见输出）', !res.ok)
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
        item.append(label, right)
        listEl.append(item)
      }
    }
    // 非 bundle insert 行
    if (view.inserts.length) {
      const g = document.createElement('div')
      g.className = 'bundle-group'
      g.textContent = '非 bundle 插件（insert 行）'
      listEl.append(g)
      for (const ins of view.inserts) {
        const item = document.createElement('div')
        item.className = 'plugin-row'
        const label = document.createElement('span')
        label.textContent = `${ins.name}  (${ins.id})`
        // 启停开关（insert 行：块存在即挂载中；禁用 = 移除 insert 块，HMR 实时卸载）
        const sw = document.createElement('label')
        sw.className = 'switch'
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = true
        cb.onchange = async () => {
          if (busy) { cb.checked = !cb.checked; return }
          setBusy(true)
          const res = await window.pluginApi.setEnabled(ins.id, cb.checked)
          setBusy(false)
          if (!res.ok) { setStatus(`启停失败: ${res.output}`, true); cb.checked = !cb.checked }
          else {
            // 同 bundle 行：HMR 不生效，重启保证
            setStatus(`${ins.name} ${cb.checked ? '已启用' : '已禁用'}，正在重启 dsh...`)
            try {
              await window.pluginApi.restart()
              setStatus(`${ins.name} ${cb.checked ? '已启用' : '已禁用'}（配置已写入）`)
            } catch (err) {
              setStatus(`重启失败: ${err.message}（可稍后重开应用）`, true)
            }
          }
        }
        const slider = document.createElement('span')
        slider.className = 'slider'
        sw.append(cb, slider)
        const rm = document.createElement('button')
        rm.className = 'danger'
        rm.textContent = '卸载（实时）'
        rm.onclick = async () => {
          if (busy) return
          setBusy(true)
          const res = await window.pluginApi.removeInsert(ins.id)
          setBusy(false)
          setStatus(res.ok ? '已实时卸载' : `失败: ${res.output}`, !res.ok)
          await refresh()
        }
        const right = document.createElement('div')
        right.style.display = 'flex'
        right.style.alignItems = 'center'
        right.style.gap = '8px'
        right.append(sw, rm)
        item.append(label, right)
        listEl.append(item)
      }
    }
  } catch (err) {
    setStatus(`加载失败: ${err.message}`, true)
  }
}

installBtn.onclick = async () => {
  const spec = specEl.value.trim()
  if (!spec || busy) return
  setBusy(true)
  setStatus(`正在安装 ${spec}...`)
  outputEl.hidden = false
  const res = await window.pluginApi.install(spec)
  outputEl.textContent = res.output
  setBusy(false)
  if (res.ok) {
    if (res.needsRestart) {
      // bundle 插件安装后自动重启（#1 用户反馈：不会自动重启无法热插拔）
      setStatus('安装成功（bundle 插件），正在重启 dsh...')
      try {
        await window.pluginApi.restart()
        setStatus('重启完成（插件效果请以 dsh UI 实际表现为准）')
      } catch (err) {
        setStatus(`重启失败: ${err.message}（可稍后重开应用）`, true)
      }
    } else {
      setStatus('安装完成（效果请以 dsh UI 实际表现为准）')
    }
  } else {
    setStatus('安装失败（见下方输出）', true)
  }
  specEl.value = ''
  await refresh()
}

refresh()
