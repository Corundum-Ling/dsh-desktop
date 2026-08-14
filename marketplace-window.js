const statusEl = document.getElementById('status')
const searchEl = document.getElementById('search')
const refreshBtn = document.getElementById('refresh-btn')
const listEl = document.getElementById('list')
const outputEl = document.getElementById('output')
const countEl = document.getElementById('result-count')

let plugins = []
let busy = false

function setStatus(text, isError = false) {
  statusEl.textContent = text
  statusEl.classList.toggle('error', isError)
}

function setBusy(value) {
  busy = value
  refreshBtn.disabled = value
  searchEl.disabled = value
  for (const button of listEl.querySelectorAll('button')) button.disabled = value
}

function renderEmptyState(title, detail) {
  const empty = document.createElement('div')
  empty.className = 'empty-state'
  const content = document.createElement('div')
  const heading = document.createElement('strong')
  heading.textContent = title
  const description = document.createElement('span')
  description.textContent = detail
  content.append(heading, description)
  empty.append(content)
  listEl.append(empty)
}

async function loadMarketplace(refresh = false) {
  if (busy) return
  setBusy(true)
  setStatus(refresh ? '正在刷新市场...' : '正在加载市场...')
  try {
    const data = await window.pluginApi.marketplace(refresh)
    plugins = data.plugins
    setStatus(data.fromCache
      ? `已加载 ${plugins.length} 个插件（缓存${data.stale ? '，网络失败降级' : ''}）`
      : `已加载 ${plugins.length} 个插件`)
    render()
  } catch (err) {
    setStatus(`市场加载失败: ${err.message}`, true)
    plugins = []
    render()
  } finally {
    setBusy(false)
  }
}

function render() {
  const q = searchEl.value.trim().toLowerCase()
  const list = plugins.filter(p =>
    !q || [p.name, p.description, p.category].some(value => String(value || '').toLowerCase().includes(q)))
  listEl.innerHTML = ''
  countEl.textContent = `${list.length} / ${plugins.length} 项`
  if (!list.length) {
    renderEmptyState(
      plugins.length ? '没有匹配的插件' : '市场暂时不可用',
      plugins.length ? '尝试缩短关键词或按插件分类搜索。' : '请稍后刷新，已缓存的数据会在网络异常时继续显示。',
    )
    return
  }
  for (const p of list) {
    const card = document.createElement('div')
    card.className = 'card'
    const head = document.createElement('div')
    head.className = 'card-head'
    const h = document.createElement('h3')
    h.textContent = p.name
    h.title = p.name
    const badge = document.createElement('span')
    badge.className = 'badge ' + (p.verified ? 'ok' : 'warn')
    badge.textContent = p.verified ? '已验证' : '待测'
    head.append(h, badge)
    const desc = document.createElement('div')
    desc.className = 'desc'
    desc.textContent = p.description || '(无说明)'
    const meta = document.createElement('div')
    meta.className = 'meta'
    const repo = document.createElement('span')
    repo.className = 'repo-label'
    repo.textContent = p.repo
    repo.title = p.repo
    const cat = document.createElement('span')
    cat.className = 'category-label'
    cat.textContent = p.category
    meta.append(repo, cat)
    const footer = document.createElement('div')
    footer.className = 'card-footer'
    const install = document.createElement('button')
    install.className = 'primary compact'
    install.textContent = '安装'
    install.setAttribute('aria-label', `安装 ${p.name}`)
    install.onclick = async () => {
      if (busy) return
      setBusy(true)
      outputEl.hidden = false
      setStatus(`正在安装 ${p.name}...`)
      try {
        // 裸 owner/repo 会被 npm 解析，市场仓库必须显式添加 github: 前缀。
        const res = await window.pluginApi.install('github:' + p.repo)
        outputEl.textContent = res.output
        if (res.ok && res.needsRestart) {
          setStatus('安装成功，正在重启 dsh...')
          try {
            await window.pluginApi.restart()
            setStatus('重启完成（插件效果请以 dsh UI 实际表现为准）')
          } catch (err) {
            setStatus(`插件已安装，但重启失败: ${err.message}`, true)
          }
        } else {
          setStatus(res.ok ? '安装完成（效果请以 dsh UI 实际表现为准）' : '安装失败（见输出）', !res.ok)
        }
      } catch (err) {
        outputEl.textContent = String(err)
        setStatus(`安装失败: ${err.message}`, true)
      } finally {
        setBusy(false)
      }
    }
    footer.append(install)
    card.append(head, desc, meta, footer)
    listEl.append(card)
  }
}

searchEl.oninput = render
refreshBtn.onclick = () => loadMarketplace(true)
loadMarketplace()
