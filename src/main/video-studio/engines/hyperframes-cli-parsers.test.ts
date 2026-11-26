import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  HYPERFRAMES_PINNED_VERSION,
  checkHyperFramesVersionCompatibility,
  parseHyperFramesCheckJson,
  parseHyperFramesDoctorJson,
  parseHyperFramesPreviewJson,
  parseHyperFramesVersionOutput,
  parsePreviewUrl,
  parseRenderProgressLine,
  validateLoopbackPreviewUrl
} from './hyperframes-cli-parsers'

const FIXTURES_DIR = join(__dirname, '__fixtures__')
const readCaptured = (name: string): string =>
  readFileSync(join(FIXTURES_DIR, 'captured', name), 'utf8')
const readSynthetic = (name: string): string =>
  readFileSync(join(FIXTURES_DIR, 'synthetic', name), 'utf8')

describe('HyperFrames 0.9.94 CLI Parsers', () => {
  it('enforces exact semver string equality against HYPERFRAMES_PINNED_VERSION 0.9.94', () => {
    const capturedVersion = parseHyperFramesVersionOutput(readCaptured('hyperframes-version.txt'))
    expect(HYPERFRAMES_PINNED_VERSION).toBe('0.9.94')
    expect(capturedVersion).toBe('0.9.94')
    expect(checkHyperFramesVersionCompatibility(capturedVersion)).toBe('exact')

    expect(checkHyperFramesVersionCompatibility('0.9.95')).toBe('unverified')
    expect(checkHyperFramesVersionCompatibility('0.9.93')).toBe('unverified')
    expect(checkHyperFramesVersionCompatibility('1.9.0')).toBe('unverified')
    expect(checkHyperFramesVersionCompatibility('0.9.94-rc.1')).toBe('unverified')
    expect(checkHyperFramesVersionCompatibility('')).toBe('missing')
    expect(checkHyperFramesVersionCompatibility(null)).toBe('missing')
  })

  it('parses captured doctor-actual.json and synthetic doctor-ready.json accurately', () => {
    const actualDoctor = parseHyperFramesDoctorJson(readCaptured('doctor-actual.json'))
    expect(actualDoctor).not.toBeNull()
    expect(actualDoctor?.detectedVersion).toBe('0.9.94')
    expect(actualDoctor?.versionCompatibility).toBe('exact')
    expect(actualDoctor?.nodeOk).toBe(true)
    expect(actualDoctor?.chromeOk).toBe(true)
    expect(actualDoctor?.cliBinaryOk).toBe(true)
    expect(actualDoctor?.ffmpegOk).toBe(false)
    expect(actualDoctor?.ffprobeOk).toBe(false)
    expect(actualDoctor?.missingRequiredTools).toEqual(['ffmpeg', 'ffprobe'])
    expect(actualDoctor?.meta?.latestVersion).toBe('0.9.96')

    const readyDoctor = parseHyperFramesDoctorJson(readSynthetic('doctor-ready.json'))
    expect(readyDoctor).not.toBeNull()
    expect(readyDoctor?.ok).toBe(true)
    expect(readyDoctor?.detectedVersion).toBe('0.9.94')
    expect(readyDoctor?.versionCompatibility).toBe('exact')
    expect(readyDoctor?.ffmpegOk).toBe(true)
    expect(readyDoctor?.ffprobeOk).toBe(true)
    expect(readyDoctor?.chromeOk).toBe(true)
    expect(readyDoctor?.nodeOk).toBe(true)
    expect(readyDoctor?.missingRequiredTools).toEqual([])

    const newerDoctor = parseHyperFramesDoctorJson(
      JSON.stringify({
        ok: true,
        checks: [{ name: 'FFmpeg', ok: true }],
        _meta: { version: '0.9.95' }
      })
    )
    expect(newerDoctor?.versionCompatibility).toBe('unverified')
    expect(newerDoctor?.detectedVersion).toBe('0.9.95')

    const olderDoctor = parseHyperFramesDoctorJson(
      JSON.stringify({
        ok: true,
        checks: [{ name: 'FFmpeg', ok: true }],
        _meta: { version: '0.9.93' }
      })
    )
    expect(olderDoctor?.versionCompatibility).toBe('unverified')
  })

  it('parses captured init-check-no-browser.json unknown_flag error payload as status error', () => {
    const report = parseHyperFramesCheckJson(
      readCaptured('init-check-no-browser.json'),
      '',
      2,
      45,
      { inputFingerprint: 'fp-no-browser' }
    )
    expect(report.status).toBe('error')
    expect(report.passed).toBe(false)
    expect(report.inputFingerprint).toBe('fp-no-browser')
    expect(report.productionGate.allowed).toBe(false)
    expect(report.findings[0]).toMatchObject({
      severity: 'error',
      code: 'unknown_flag'
    })
    expect(report.findings[0]?.fixHint).toContain('--browser-gpu')
  })

  it('parses captured init-check-browser.json without false partial and ignores non-finding hdr metadata', () => {
    const report = parseHyperFramesCheckJson(readCaptured('init-check-browser.json'), '', 0, 1250, {
      inputFingerprint: 'fp-browser-ok'
    })
    expect(report.status).toBe('passed')
    expect(report.passed).toBe(true)
    expect(report.engine).toBe('hyperframes')
    expect(report.engineVersion).toBe('0.9.94')
    expect(report.inputFingerprint).toBe('fp-browser-ok')
    expect(report.skippedChecks).toEqual([])
    expect(report.productionGate).toEqual({ allowed: true, blockingReasons: [] })
    expect(report.errors).toEqual([])
    expect(report.warnings).toHaveLength(1)
    expect(report.warnings[0]).toMatchObject({
      severity: 'warning',
      code: 'sweep_static',
      file: 'index.html'
    })
    expect(report.findings.some((f) => f.code === 'audio_none' && f.severity === 'info')).toBe(true)
    expect(report.sectionStatuses.hdr).toBeUndefined()
    expect(report.sectionStatuses.layout).toMatchObject({
      status: 'passed',
      errorCount: 0,
      warningCount: 1
    })
  })

  it('enforces strict failed > partial precedence on synthetic check-failed-contrast-layout.json', () => {
    const report = parseHyperFramesCheckJson(
      readSynthetic('check-failed-contrast-layout.json'),
      '',
      1,
      800,
      { inputFingerprint: 'fp-failed' }
    )
    expect(report.status).toBe('failed')
    expect(report.passed).toBe(false)
    expect(report.browserSkipped).toBe(true)
    expect(report.skippedChecks).toContain('browser')
    expect(report.productionGate.allowed).toBe(false)
    expect(report.errors).toHaveLength(2)

    const contrastFinding = report.findings.find((f) => f.code === 'wcag_aa_contrast')
    expect(contrastFinding).toMatchObject({
      severity: 'error',
      section: 'contrast',
      sourceFile: 'compositions/01-opening.html',
      suggestedColor: '#E2E8F0'
    })
    expect(contrastFinding?.fixHint).toContain('4.5:1')
  })

  it('dynamically discovers unknown sections with findings[] and handles hdr without findings[]', () => {
    const report = parseHyperFramesCheckJson(
      readSynthetic('check-hdr-unknown-section.json'),
      '',
      0,
      620,
      { inputFingerprint: 'fp-hdr' }
    )
    expect(report.status).toBe('passed')
    expect(report.passed).toBe(true)
    expect(report.productionGate.allowed).toBe(true)
    expect(report.sectionStatuses.hdr).toBeUndefined()
    expect(report.sectionStatuses.experimentalAudit).toMatchObject({
      status: 'passed',
      errorCount: 0,
      warningCount: 1
    })
    expect(report.warnings).toEqual([
      expect.objectContaining({
        code: 'hdr_gamut_clipping_risk',
        section: 'experimentalAudit',
        severity: 'warning'
      })
    ])
    expect(report.snapshots?.files).toEqual(['.hyperframes/artifacts/snapshots/t-0.500.png'])
  })

  it('reports partial when browserSkipped is true and errorCount is 0, keeping status distinct from productionGate', () => {
    const report = parseHyperFramesCheckJson(
      JSON.stringify({
        ok: true,
        browserSkipped: true,
        lint: { ok: true, errorCount: 0, warningCount: 0, infoCount: 0, findings: [] },
        _meta: { version: '0.9.94' }
      }),
      '',
      0,
      200,
      { inputFingerprint: 'fp-partial' }
    )
    expect(report.status).toBe('partial')
    expect(report.passed).toBe(false)
    expect(report.skippedChecks).toEqual(['browser'])
    expect(report.productionGate.allowed).toBe(false)
    expect(report.productionGate.blockingReasons.length).toBeGreaterThan(0)
  })

  it('handles hyperframes lint --json static mode as partial on 0 errors and failed on >0 errors', () => {
    const cleanLint = parseHyperFramesCheckJson(
      JSON.stringify({
        ok: true,
        errorCount: 0,
        warningCount: 0,
        infoCount: 0,
        findings: [],
        filesScanned: 2,
        _meta: { version: '0.9.94' }
      }),
      '',
      0,
      100,
      { staticLintMode: true, inputFingerprint: 'fp-lint-ok' }
    )
    expect(cleanLint.status).toBe('partial')
    expect(cleanLint.skippedChecks).toEqual([
      'browser',
      'runtime',
      'layout',
      'motion',
      'contrast',
      'craft',
      'audio'
    ])
    expect(cleanLint.productionGate.allowed).toBe(false)

    const failedLint = parseHyperFramesCheckJson(
      JSON.stringify({
        ok: false,
        errorCount: 1,
        warningCount: 0,
        infoCount: 0,
        findings: [{ code: 'missing_timeline', severity: 'error', message: 'Missing timeline' }],
        _meta: { version: '0.9.94' }
      }),
      '',
      1,
      100,
      { staticLintMode: true, inputFingerprint: 'fp-lint-fail' }
    )
    expect(failedLint.status).toBe('failed')
    expect(failedLint.errors).toHaveLength(1)
    expect(failedLint.productionGate.allowed).toBe(false)
  })

  it('parses captured preview-start-actual.json and enforces loopback URL validation', () => {
    const parsed = parseHyperFramesPreviewJson(readCaptured('preview-start-actual.json'), 3002)
    expect(parsed).toMatchObject({
      ok: true,
      ready: true,
      pid: 11008,
      port: 3002,
      host: '127.0.0.1',
      projectName: 'hf-cap-165139268',
      url: 'http://127.0.0.1:3002/#project/hf-cap-165139268',
      serverUrl: 'http://127.0.0.1:3002/'
    })

    const evilUrl = parseHyperFramesPreviewJson(
      JSON.stringify({
        schemaVersion: 1,
        operation: 'start',
        ok: true,
        result: {
          state: 'started',
          mode: 'foreground',
          projectName: 'p',
          projectDir: '/tmp/p',
          host: 'evil.example',
          port: 3002,
          pid: 123,
          serverUrl: 'https://evil.example:3002',
          studioUrl: 'https://evil.example:3002/#project/p',
          ready: true
        }
      }),
      3002
    )
    expect(evilUrl).toMatchObject({ ok: false, errorCode: 'invalid_preview_url' })

    expect(
      parsePreviewUrl(
        JSON.stringify({
          schemaVersion: 1,
          operation: 'start',
          ok: true,
          result: {
            state: 'starting',
            studioUrl: 'http://127.0.0.1:3002/#project/p',
            ready: false
          }
        }),
        3002
      )
    ).toBeNull()
    expect(parsePreviewUrl('Studio preview failed to bind', 3002)).toBeNull()
    expect(validateLoopbackPreviewUrl('http://[::1]:3002/#project/p')).toMatchObject({
      host: '[::1]',
      port: 3002
    })
  })

  it('parses @hf-progress lines from synthetic render-progress.txt and probe output cleanly', () => {
    const lines = readSynthetic('render-progress.txt')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('@hf-progress'))

    const updates = lines.map((line) => parseRenderProgressLine(line))
    expect(updates[0]).toMatchObject({ progressPercent: 15, stageLabel: 'extract_video' })
    expect(updates[1]).toMatchObject({ progressPercent: 24, stageLabel: 'capture' })
    expect(updates[2]).toMatchObject({ progressPercent: 46, stageLabel: 'capture' })
    expect(updates[5]).toMatchObject({ progressPercent: 90, stageLabel: 'encode' })

    const probeFirstLine = readCaptured('render-actual-probe.txt')
      .split(/\r?\n/)
      .find((line) => line.includes('FFmpeg not found'))
    expect(probeFirstLine).toBeDefined()
    expect(parseRenderProgressLine(probeFirstLine ?? '')).toMatchObject({
      progressPercent: undefined,
      logLine: probeFirstLine
    })
  })
})
