export function buildEnv({ DSH_HOME, binDir, ...extra }) {
  const pathKey = process.platform === 'win32' ? 'PATH' : 'PATH'
  const existing = process.env[pathKey] || ''
  return {
    ...process.env,
    ...extra,
    DSH_HOME,
    [pathKey]: `${binDir}${pathKey === 'PATH' ? ';' : ':'}${existing}`,
  }
}
