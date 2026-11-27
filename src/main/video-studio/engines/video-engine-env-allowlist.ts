const CANONICAL_ALLOWED_ENV_KEYS = new Map<string, string>(
  [
    'PATH',
    'PATHEXT',
    'SystemRoot',
    'COMSPEC',
    'WINDIR',
    'OS',
    'PROCESSOR_ARCHITECTURE',
    'NUMBER_OF_PROCESSORS',
    'TEMP',
    'TMP',
    'TMPDIR',
    'HOME',
    'USERPROFILE',
    'HOMEDRIVE',
    'HOMEPATH',
    'APPDATA',
    'LOCALAPPDATA',
    'PROGRAMDATA',
    'ProgramFiles',
    'ProgramFiles(x86)',
    'CommonProgramFiles',
    'XDG_CACHE_HOME',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
    'XDG_RUNTIME_DIR',
    'DISPLAY',
    'WAYLAND_DISPLAY',
    'USER',
    'LOGNAME',
    'SHELL',
    'TERM',
    'COLORTERM',
    'NO_COLOR',
    'FORCE_COLOR',
    'CI',
    'TZ',
    'NODE_ENV',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'LANG'
  ].map((canonical) => [canonical.toUpperCase(), canonical])
)

const SECRET_ENV_NAME_PATTERN =
  /(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|PRIVATE|COOKIE|BEARER)/i

function isAllowedVideoEngineEnvKey(key: string): string | null {
  const upper = key.toUpperCase()
  const canonical = CANONICAL_ALLOWED_ENV_KEYS.get(upper)
  if (canonical) {
    return canonical
  }
  if (upper.startsWith('LC_') && !SECRET_ENV_NAME_PATTERN.test(key)) {
    return key
  }
  if (upper.startsWith('HYPERFRAMES_') && !SECRET_ENV_NAME_PATTERN.test(key)) {
    return key
  }
  return null
}

/** Filters process.env to an explicit non-secret allowlist so API keys, provider tokens, and ORCA_* secrets never reach engine subprocesses. */
export function buildSanitizedVideoEngineEnv(
  sourceEnv: NodeJS.ProcessEnv = process.env,
  extraEnv?: Readonly<Record<string, string>>
): Record<string, string> {
  const sanitized: Record<string, string> = {}
  for (const [key, value] of Object.entries(sourceEnv)) {
    if (value === undefined) {
      continue
    }
    const targetKey = isAllowedVideoEngineEnvKey(key)
    if (targetKey) {
      sanitized[targetKey] = value
    }
  }
  if (extraEnv) {
    for (const [key, value] of Object.entries(extraEnv)) {
      const targetKey = isAllowedVideoEngineEnvKey(key)
      if (targetKey) {
        sanitized[targetKey] = value
      }
    }
  }
  return sanitized
}
