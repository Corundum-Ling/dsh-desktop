const statusEl = document.getElementById('status')
const searchEl = document.getElementById('search')
const refreshBtn = document.getElementById('refresh-btn')
const listEl = document.getElementById('list')
const outputEl = document.getElementById('output')

let plugins = []

async function loadMarketplace(refresh = false) {
  statusEl.textContent = refresh ? '正在刷新市场...' : '正在加载市场...'
  try {
    const data = await window.pluginApi.marketplace(refresh)
    plugins = data.plugins
    statusEl.textContent = data.fromCache
      ? `已加载 ${plugins.length} 个插件（缓存${data.stale ? '，网络失败降级' : ''}）`
      : `已加载 ${plugins.length} 个插件`
    render()
  } catch (err) {
    statusEl.textContent = `市场加载失败: ${err.message}`
  }
}

function render() {
  const q = searchEl.value.trim().toLowerCase()
  const list = plugins.filter(p =>
    !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
  listEl.innerHTML = ''
  if (!list.length) {
    listEl.innerHTML = '<div style="color:var(--dsw-alias-label-secondary)">无匹配插件</div>'
    return
  }
  for (const p of list) {
    const card = document.createElement('div')
    card.className = 'card'
    const h = document.createElement('h3')
    h.textContent = p.name
    const desc = document.createElement('div')
    desc.className = 'desc'
    desc.textContent = p.description || '(无说明)'
    const meta = document.createElement('div')
    meta.className = 'meta'
    const repo = document.createElement('span')
    repo.textContent = p.repo
    const badge = document.createElement('span')
    badge.className = 'badge ' + (p.verified ? 'ok' : 'warn')
    badge.textContent = p.verified ? '✅ 已验证' : '待测'
    const cat = document.createElement('span')
    cat.textContent = p.category
    meta.append(repo, badge, cat)
    const install = document.createElement('button')
    install.className = 'primary'
    install.textContent = '安装'
    install.onclick = async () => {
      outputEl.hidden = false
      statusEl.textContent = `正在安装 ${p.name}...`
      // git 源判定需 github: 前缀（裸 owner/repo 会被当 npm 包处理）
      const res = await window.pluginApi.install('github:' + p.repo)
      outputEl.textContent = res.output
      statusEl.textContent = res.ok
        ? (res.needsRestart ? '安装成功（bundle，重启生效）' : '安装成功（已实时挂载）')
        : '安装失败（见输出）'
    }
    card.append(h, desc, meta, install)
    listEl.append(card)
  }
}

searchEl.oninput = render
refreshBtn.onclick = () => loadMarketplace(true)
loadMarketplace()
