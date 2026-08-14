export function buildEnv({ DSH_HOME, binDir, ...extra }) {
  const pathKey = 'PATH'
  const existing = process.env[pathKey] || ''
  return {
    ...process.env,
    ...extra,
    DSH_HOME,
    [pathKey]: `${binDir}${process.platform === 'win32' ? ';' : ':'}${existing}`,
  }
}
