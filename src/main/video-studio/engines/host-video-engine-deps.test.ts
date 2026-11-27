import { describe, expect, it } from 'vitest'
import { buildSanitizedVideoEngineEnv } from './host-video-engine-deps'

describe('buildSanitizedVideoEngineEnv', () => {
  it('strips API keys, provider tokens, and ORCA_* secrets while keeping allowlisted OS and non-secret HYPERFRAMES_* vars', () => {
    const sourceEnv: NodeJS.ProcessEnv = {
      PATH: '/usr/local/bin:/usr/bin',
      PATHEXT: '.COM;.EXE;.BAT;.CMD',
      SystemRoot: 'C:\\Windows',
      COMSPEC: 'C:\\Windows\\system32\\cmd.exe',
      TEMP: 'C:\\Temp',
      TMP: 'C:\\Temp',
      HOME: '/home/tester',
      USERPROFILE: 'C:\\Users\\tester',
      APPDATA: 'C:\\Users\\tester\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      HYPERFRAMES_CACHE_DIR: '/tmp/hf-cache',
      HYPERFRAMES_NO_TELEMETRY: '1',
      HYPERFRAMES_LOG_LEVEL: 'info',
      OPENAI_API_KEY: 'sk-openai-secret',
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      GITHUB_TOKEN: 'ghp_secret_token',
      GH_TOKEN: 'gho_secret_token',
      TAVILY_API_KEY: 'tvly-secret',
      BRAVE_API_KEY: 'bsa-secret',
      GEMINI_API_KEY: 'AIza-secret',
      AWS_SECRET_ACCESS_KEY: 'aws-secret',
      ORCA_AUTH_TOKEN: 'orca-secret-auth',
      ORCA_DAEMON_SECRET: 'orca-daemon-secret',
      ORCA_API_KEY: 'orca-key',
      HYPERFRAMES_API_KEY: 'hf-secret-key',
      HYPERFRAMES_TOKEN: 'hf-secret-token',
      HYPERFRAMES_SECRET: 'hf-secret',
      RANDOM_UNLISTED_VAR: 'should-not-leak'
    }

    const sanitized = buildSanitizedVideoEngineEnv(sourceEnv)

    expect(sanitized.PATH).toBe('/usr/local/bin:/usr/bin')
    expect(sanitized.PATHEXT).toBe('.COM;.EXE;.BAT;.CMD')
    expect(sanitized.SystemRoot).toBe('C:\\Windows')
    expect(sanitized.COMSPEC).toBe('C:\\Windows\\system32\\cmd.exe')
    expect(sanitized.TEMP).toBe('C:\\Temp')
    expect(sanitized.TMP).toBe('C:\\Temp')
    expect(sanitized.HOME).toBe('/home/tester')
    expect(sanitized.USERPROFILE).toBe('C:\\Users\\tester')
    expect(sanitized.APPDATA).toBe('C:\\Users\\tester\\AppData\\Roaming')
    expect(sanitized.LOCALAPPDATA).toBe('C:\\Users\\tester\\AppData\\Local')
    expect(sanitized.LANG).toBe('en_US.UTF-8')
    expect(sanitized.LC_ALL).toBe('en_US.UTF-8')
    expect(sanitized.HYPERFRAMES_CACHE_DIR).toBe('/tmp/hf-cache')
    expect(sanitized.HYPERFRAMES_NO_TELEMETRY).toBe('1')
    expect(sanitized.HYPERFRAMES_LOG_LEVEL).toBe('info')

    expect(sanitized.OPENAI_API_KEY).toBeUndefined()
    expect(sanitized.ANTHROPIC_API_KEY).toBeUndefined()
    expect(sanitized.GITHUB_TOKEN).toBeUndefined()
    expect(sanitized.GH_TOKEN).toBeUndefined()
    expect(sanitized.TAVILY_API_KEY).toBeUndefined()
    expect(sanitized.BRAVE_API_KEY).toBeUndefined()
    expect(sanitized.GEMINI_API_KEY).toBeUndefined()
    expect(sanitized.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    expect(sanitized.ORCA_AUTH_TOKEN).toBeUndefined()
    expect(sanitized.ORCA_DAEMON_SECRET).toBeUndefined()
    expect(sanitized.ORCA_API_KEY).toBeUndefined()
    expect(sanitized.HYPERFRAMES_API_KEY).toBeUndefined()
    expect(sanitized.HYPERFRAMES_TOKEN).toBeUndefined()
    expect(sanitized.HYPERFRAMES_SECRET).toBeUndefined()
    expect(sanitized.RANDOM_UNLISTED_VAR).toBeUndefined()
  })

  it('normalizes Windows Path casing into PATH without retaining secrets', () => {
    const sanitized = buildSanitizedVideoEngineEnv({
      Path: 'C:\\Windows\\System32',
      OPENAI_API_KEY: 'secret'
    })
    expect(sanitized.PATH).toBe('C:\\Windows\\System32')
    expect(sanitized.Path).toBeUndefined()
    expect(sanitized.OPENAI_API_KEY).toBeUndefined()
  })
})
