const REPOSITORY = 'Corundum-Ling/dsh-desktop'
const RELEASES_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value ?? ''))
  return match ? match.slice(1).map(Number) : null
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1
  }
  return 0
}

function isReleaseUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'github.com' &&
      url.pathname.startsWith(`/Corundum-Ling/dsh-desktop/releases/`)
  } catch {
    return false
  }
}

export function createUpdateService({ currentVersion, config, fetchImpl = fetch, now = () => Date.now() }) {
  let activeCheck = null

  async function check({ force = false } = {}) {
    if (activeCheck) return activeCheck
    if (!force && now() - Number(config.get('lastUpdateCheckAt', 0)) < CHECK_INTERVAL_MS) {
      return { status: 'skipped' }
    }
    activeCheck = (async () => {
      try {
        config.set('lastUpdateCheckAt', now())
        const response = await fetchImpl(RELEASES_URL, {
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-desktop-update-checker' },
          signal: AbortSignal.timeout(10_000),
        })
        if (response.status === 403) return { status: 'rate-limited' }
        if (!response.ok) return { status: 'error', error: new Error(`GitHub HTTP ${response.status}`) }
        const release = await response.json()
        const current = parseVersion(currentVersion)
        const latest = parseVersion(release.tag_name)
        if (!current || !latest || release.draft || release.prerelease || !isReleaseUrl(release.html_url)) {
          return { status: 'none' }
        }
        if (compareVersions(latest, current) <= 0) return { status: 'none', version: release.tag_name }
        if (config.get('ignoredUpdateVersion') === release.tag_name) return { status: 'ignored', release }
        return { status: 'available', release }
      } catch (error) {
        return { status: 'error', error }
      } finally {
        activeCheck = null
      }
    })()
    return activeCheck
  }

  return {
    check,
    ignore(version) {
      config.set('ignoredUpdateVersion', version)
    },
    repository: REPOSITORY,
  }
}

export { CHECK_INTERVAL_MS, RELEASES_URL, compareVersions, parseVersion }
