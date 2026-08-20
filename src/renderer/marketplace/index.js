const statusEl = document.getElementById('status')
const searchEl = document.getElementById('search')
const refreshBtn = document.getElementById('refresh-btn')
const listEl = document.getElementById('list')
const outputEl = document.getElementById('output')
const countEl = document.getElementById('result-count')
const typeFilter = createFilter(document.getElementById('type-filter'), [
  ['', '全部类型'],
  ['installable', '可安装'],
  ['plugin', '插件'],
  ['skill', 'Skill'],
  ['bundle', '插件集'],
  ['client', '客户端'],
  ['tool', '工具'],
  ['unknown', '待确认'],
])
const categoryFilter = createFilter(document.getElementById('category-filter'), [['', '全部分类']])
const detailBackdrop = document.getElementById('detail-backdrop')
const detailDialog = document.getElementById('detail-dialog')
const detailType = document.getElementById('detail-type')
const detailTitle = document.getElementById('detail-title')
const detailMeta = document.getElementById('detail-meta')
const detailDescription = document.getElementById('detail-description')
const detailNotice = document.getElementById('detail-notice')
const detailRepository = document.getElementById('detail-repository')
const detailInstall = document.getElementById('detail-install')

let plugins = []
let busy = false
let detailPlugin = null
let detailTrigger = null

function createFilter(root, initialOptions) {
  const trigger = root.querySelector('.filter-trigger')
  const label = trigger.querySelector('span')
  const menu = root.querySelector('.filter-menu')
  const filter = { root, trigger, menu, label, value: '', options: [], disabled: false, onChange: null }

  filter.close = () => {
    menu.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
  }
  filter.setOptions = (options) => {
    filter.options = options
    if (!options.some(([value]) => value === filter.value)) filter.value = ''
    menu.replaceChildren(...options.map(([value, text]) => {
      const option = document.createElement('button')
      option.type = 'button'
      option.className = 'filter-option'
      option.setAttribute('role', 'option')
      option.setAttribute('aria-selected', String(value === filter.value))
      option.textContent = text
      option.onclick = () => {
        filter.value = value
        filter.sync()
        filter.close()
        filter.onChange?.()
        trigger.focus()
      }
      return option
    }))
    filter.sync()
  }
  filter.sync = () => {
    label.textContent = filter.options.find(([value]) => value === filter.value)?.[1] || filter.options[0]?.[1] || ''
    for (const [index, option] of [...menu.children].entries()) {
      option.setAttribute('aria-selected', String(filter.options[index]?.[0] === filter.value))
    }
  }
  filter.setDisabled = (value) => {
    filter.disabled = value
    trigger.disabled = value
    if (value) filter.close()
  }
  trigger.onclick = () => {
    if (filter.disabled) return
    const opening = menu.hidden
    closeFilters(root)
    menu.hidden = !opening
    trigger.setAttribute('aria-expanded', String(opening))
  }
  filter.setOptions(initialOptions)
  return filter
}

function closeFilters(except = null) {
  for (const filter of [typeFilter, categoryFilter]) {
    if (filter.root !== except) filter.close()
  }
}

function setStatus(text, isError = false) {
  statusEl.textContent = text
  statusEl.classList.toggle('error', isError)
}

function setBusy(value) {
  busy = value
  refreshBtn.disabled = value
  searchEl.disabled = value
  typeFilter.setDisabled(value)
  categoryFilter.setDisabled(value)
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
      ? `已加载 ${plugins.length} 个生态条目（缓存${data.stale ? '，网络失败降级' : ''}）`
      : `已加载 ${plugins.length} 个生态条目`)
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
  const type = typeFilter.value
  const typeMatches = p => type === 'installable' ? p.installable : !type || p.type === type
  const categories = [...new Set(plugins.filter(typeMatches).map(p => p.category).filter(Boolean))]
  const selectedCategory = categories.includes(categoryFilter.value) ? categoryFilter.value : ''
  categoryFilter.value = selectedCategory
  categoryFilter.setOptions([['', '全部分类'], ...categories.map(value => [value, value])])
  const list = plugins.filter(p =>
    (!q || [p.name, p.repo, p.description, p.category, p.typeLabel].some(value => String(value || '').toLowerCase().includes(q))) &&
    (!selectedCategory || p.category === selectedCategory) && typeMatches(p))
    .sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1) || a.name.localeCompare(b.name))
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
    card.tabIndex = 0
    card.setAttribute('role', 'group')
    card.setAttribute('aria-label', `查看 ${p.name} 详情`)
    const head = document.createElement('div')
    head.className = 'card-head'
    const h = document.createElement('h3')
    h.textContent = p.name
    h.title = p.name
    const badge = document.createElement('span')
    badge.className = 'badge ' + (p.verified ? 'ok' : 'warn')
    badge.textContent = p.verdict || (p.verified ? '可用' : '待测')
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
    const stars = document.createElement('span')
    stars.className = 'star-label'
    stars.textContent = p.stars === null ? '' : `★ ${p.stars.toLocaleString('en-US')}`
    meta.append(repo, cat, stars)
    const footer = document.createElement('div')
    footer.className = 'card-footer'
    const typeLabel = document.createElement('span')
    typeLabel.className = 'type-label'
    typeLabel.textContent = p.typeLabel
    const install = document.createElement('button')
    install.className = 'primary compact'
    install.textContent = p.installable ? '安装' : '查看项目'
    install.setAttribute('aria-label', `${p.installable ? '安装' : '查看'} ${p.name}`)
    install.onclick = (event) => {
      event.stopPropagation()
      if (p.installable) installPlugin(p)
      else window.pluginApi.openRepository(`https://github.com/${p.repo}`)
    }
    card.addEventListener('click', () => openDetails(p, card))
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        openDetails(p, card)
      }
    })
    footer.append(typeLabel, install)
    card.append(head, desc, meta, footer)
    listEl.append(card)
  }
}

async function installPlugin(p) {
  if (busy) return
  setBusy(true)
  outputEl.hidden = false
  setStatus(`正在验证 ${p.name}...`)
  try {
    const inspection = await window.pluginApi.inspectRepository(p.repo)
    if (!inspection.installable) {
      outputEl.textContent = inspection.reason
      setStatus(`无法安装 ${p.name}: ${inspection.reason}`, true)
      outputEl.focus()
      return
    }
    if (inspection.requiresBuildApproval) {
      setStatus(`${p.name} 需要构建脚本授权...`)
      const approved = await window.pluginApi.approveBuild(inspection.packageName)
      if (!approved) {
        outputEl.textContent = '安装已取消：未授权第三方构建脚本。'
        setStatus('安装已取消')
        return
      }
    }
    setStatus(`正在安装 ${p.name}...`)
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
      const allowBuilds = /allowBuilds/i.test(res.output)
      setStatus(res.ok
        ? '安装完成（效果请以 dsh UI 实际表现为准）'
        : allowBuilds
          ? '安装被 pnpm 阻止：该仓库要求执行构建脚本，请查看下方完整说明'
          : '安装失败（见下方输出）', !res.ok)
      if (!res.ok) outputEl.focus()
    }
  } catch (err) {
    outputEl.textContent = String(err)
    setStatus(`安装失败: ${err.message}`, true)
    outputEl.focus()
  } finally {
    setBusy(false)
  }
}

function closeDetails() {
  if (detailBackdrop.hidden) return
  detailBackdrop.hidden = true
  detailPlugin = null
  detailTrigger?.focus()
}

function openDetails(p, trigger) {
  detailPlugin = p
  detailTrigger = trigger
  detailType.textContent = p.typeLabel
  detailType.className = `badge ${p.installable ? 'ok' : 'warn'}`
  detailTitle.textContent = p.name
  detailMeta.textContent = [p.category, p.stars === null ? '' : `★ ${p.stars.toLocaleString('en-US')}`, p.verdict].filter(Boolean).join(' · ')
  detailDescription.textContent = p.description || '暂无详细说明。'
  detailNotice.textContent = p.installable
    ? `安装来源：github.com/${p.repo}`
    : '此条目不是可直接安装到当前 dsh profile 的插件，仅提供项目详情与仓库入口。'
  detailInstall.hidden = !p.installable
  detailBackdrop.hidden = false
  detailDialog.focus()
}

detailBackdrop.addEventListener('click', (event) => { if (event.target === detailBackdrop) closeDetails() })
document.getElementById('detail-close').onclick = closeDetails
detailRepository.onclick = () => { if (detailPlugin) window.pluginApi.openRepository(`https://github.com/${detailPlugin.repo}`) }
detailInstall.onclick = () => {
  if (!detailPlugin) return
  const plugin = detailPlugin
  closeDetails()
  installPlugin(plugin)
}
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  closeFilters()
  if (!detailBackdrop.hidden) closeDetails()
})
document.addEventListener('click', (event) => {
  if (!event.target.closest('.filter-select')) closeFilters()
})

searchEl.oninput = render
typeFilter.onChange = render
categoryFilter.onChange = render
refreshBtn.onclick = () => loadMarketplace(true)
window.__contentReadyPromise = loadMarketplace()
