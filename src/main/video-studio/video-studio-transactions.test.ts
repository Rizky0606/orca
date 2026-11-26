import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  computeProjectInputFingerprint,
  stableJsonSerialize
} from './engines/project-input-fingerprint'
import { resolveVideoStudioProjectDir } from './video-studio-composition-paths'
import { resolveContainedPath } from './video-studio-path-containment'
import {
  recoverPendingProjectTransaction,
  signTxJournal,
  VideoStudioLockCoordinator,
  VideoStudioTransactionCoordinator
} from './video-studio-transactions'
import { VideoStudioTrustStore, withExecutionVerifiedSnapshot } from './video-studio-trust-store'

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

let tempRoot: string
let profileDir: string
let projectDir: string
let outsideDir: string

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'orca-vs-tx-'))
  profileDir = join(tempRoot, 'profile')
  outsideDir = join(tempRoot, 'outside')
  projectDir = resolveVideoStudioProjectDir(profileDir, 'proj-1')
  await mkdir(projectDir, { recursive: true })
  await mkdir(outsideDir, { recursive: true })
  await writeFile(join(outsideDir, 'secret.txt'), 'top-secret', 'utf8')
})

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

describe('path containment with symlinks and Windows junctions', () => {
  it('rejects symlink or directory junction targets escaping canonical project root, including non-existent children', async () => {
    const linkType = process.platform === 'win32' ? 'junction' : 'dir'
    const linkPath = join(projectDir, 'escaped-dir')
    await symlink(outsideDir, linkPath, linkType)

    await expect(resolveContainedPath(projectDir, 'escaped-dir/secret.txt')).rejects.toThrow(
      'video_studio_invalid_path'
    )
    await expect(resolveContainedPath(projectDir, 'escaped-dir/new-file.html')).rejects.toThrow(
      'video_studio_invalid_path'
    )
  })

  it('rejects dangling symlinks or junctions pointing outside project root', async () => {
    const danglingTarget = join(outsideDir, 'does-not-exist')
    const dangling = join(projectDir, 'dangling-link')
    if (process.platform === 'win32') {
      await mkdir(danglingTarget, { recursive: true })
      await symlink(danglingTarget, dangling, 'junction')
      await rm(danglingTarget, { recursive: true, force: true })
    } else {
      await symlink(danglingTarget, dangling, 'file')
    }
    await expect(resolveContainedPath(projectDir, 'dangling-link')).rejects.toThrow(
      'video_studio_invalid_path'
    )
  })
})

describe('VideoStudioTransactionCoordinator and recovery', () => {
  it('progresses through preparing -> staged-verified -> committing -> committed and verifies staged & backup hashes', async () => {
    await mkdir(join(projectDir, 'compositions'), { recursive: true })
    await writeFile(join(projectDir, 'index.html'), '<html>v1</html>', 'utf8')
    const locks = new VideoStudioLockCoordinator()
    const tx = new VideoStudioTransactionCoordinator(locks)

    const observedPhases: string[] = []
    const result = await tx.runProjectTransaction({
      projectDir,
      projectId: 'proj-1',
      operations: [
        {
          relativePath: 'index.html',
          content: '<html>v2</html>',
          expectedSha256: sha256('<html>v1</html>')
        },
        {
          relativePath: 'compositions/01-opening.html',
          content: '<section>scene</section>',
          expectedSha256: null
        }
      ],
      onPhase: async (phase) => {
        observedPhases.push(phase)
        if (phase === 'staged-verified' || phase === 'committing') {
          const journal = JSON.parse(await readFile(join(projectDir, '.orca', 'tx.log'), 'utf8'))
          expect(journal.state).toBe(phase)
        }
      }
    })

    expect(observedPhases).toEqual(['preparing', 'staged-verified', 'committing', 'committed'])
    expect(result.txId).toBeTruthy()
    expect(await readFile(join(projectDir, 'index.html'), 'utf8')).toBe('<html>v2</html>')
    expect(await readFile(join(projectDir, 'compositions', '01-opening.html'), 'utf8')).toBe(
      '<section>scene</section>'
    )
    await expect(readFile(join(projectDir, '.orca', 'tx.log'), 'utf8')).rejects.toThrow()
  })

  it('rejects stale expectedSha256 with video_studio_file_conflict without modifying files', async () => {
    await writeFile(join(projectDir, 'index.html'), '<html>actual</html>', 'utf8')
    const tx = new VideoStudioTransactionCoordinator()

    await expect(
      tx.runProjectTransaction({
        projectDir,
        operations: [
          {
            relativePath: 'index.html',
            content: '<html>next</html>',
            expectedSha256: sha256('<html>stale</html>')
          }
        ]
      })
    ).rejects.toThrow('video_studio_file_conflict')

    await expect(
      tx.runProjectTransaction({
        projectDir,
        operations: [
          {
            relativePath: 'index.html',
            content: '<html>next</html>',
            expectedSha256: null
          }
        ]
      })
    ).rejects.toThrow('video_studio_file_conflict')

    expect(await readFile(join(projectDir, 'index.html'), 'utf8')).toBe('<html>actual</html>')
  })

  it('rolls back newly created files (existed: false) cleanly by unlinking on partial commit crash', async () => {
    await writeFile(join(projectDir, 'existing.txt'), 'original', 'utf8')
    const tx = new VideoStudioTransactionCoordinator()
    let capturedTxId = ''

    await expect(
      tx.runProjectTransaction({
        projectDir,
        operations: [
          { relativePath: 'brand-new.txt', content: 'created-mid-tx', expectedSha256: null },
          {
            relativePath: 'existing.txt',
            content: 'updated-mid-tx',
            expectedSha256: sha256('original')
          }
        ],
        onPhase: async (phase, txId) => {
          if (phase === 'committing') {
            capturedTxId = txId
            // Simulate partial commit crash after brand-new.txt was written but before existing.txt
            await writeFile(join(projectDir, 'brand-new.txt'), 'created-mid-tx', 'utf8')
            throw new Error('simulated_crash')
          }
        }
      })
    ).rejects.toThrow('simulated_crash')

    expect(capturedTxId).not.toBe('')
    const recovery = await recoverPendingProjectTransaction(projectDir)
    expect(recovery).toEqual({
      recovered: true,
      action: 'rolled-back',
      txId: capturedTxId
    })
    await expect(readFile(join(projectDir, 'brand-new.txt'), 'utf8')).rejects.toThrow()
    expect(await readFile(join(projectDir, 'existing.txt'), 'utf8')).toBe('original')
  })

  it('refuses recovery with video_studio_tx_recovery_conflict when needed backup is missing or corrupt', async () => {
    await writeFile(join(projectDir, 'a.txt'), 'before-a', 'utf8')
    await writeFile(join(projectDir, 'b.txt'), 'before-b', 'utf8')
    const tx = new VideoStudioTransactionCoordinator()
    let capturedTxId = ''

    await expect(
      tx.runProjectTransaction({
        projectDir,
        operations: [
          { relativePath: 'a.txt', content: 'after-a', expectedSha256: sha256('before-a') },
          { relativePath: 'b.txt', content: 'after-b', expectedSha256: sha256('before-b') }
        ],
        onPhase: async (phase, txId) => {
          if (phase === 'committing') {
            capturedTxId = txId
            // Simulate a.txt already renamed to after-a, b.txt still at before-b, and corrupt backup
            await writeFile(join(projectDir, 'a.txt'), 'after-a', 'utf8')
            const backupsDir = join(projectDir, '.orca', '.staging', txId, 'backups')
            const backupFiles = await readdir(backupsDir)
            const aBackup = backupFiles.find((name) => name.includes('a.txt'))!
            await writeFile(join(backupsDir, aBackup), 'corrupted-backup', 'utf8')
            throw new Error('simulated_crash')
          }
        }
      })
    ).rejects.toThrow('simulated_crash')

    await expect(recoverPendingProjectTransaction(projectDir)).rejects.toThrow(
      'video_studio_tx_recovery_conflict'
    )
    expect(await readFile(join(projectDir, 'a.txt'), 'utf8')).toBe('after-a')
    expect(await readFile(join(projectDir, 'b.txt'), 'utf8')).toBe('before-b')
    const conflict = JSON.parse(
      await readFile(join(projectDir, '.orca', `tx-conflict-${capturedTxId}.json`), 'utf8')
    )
    expect(conflict.reason).toBe('backup_integrity_failed')
  })

  it('rejects tampered or malformed .orca/tx.log with video_studio_tx_recovery_conflict', async () => {
    await writeFile(join(projectDir, 'a.txt'), 'keep-me', 'utf8')
    await mkdir(join(projectDir, '.orca'), { recursive: true })
    await writeFile(join(projectDir, '.orca', 'tx.log'), '{not valid json', 'utf8')

    await expect(recoverPendingProjectTransaction(projectDir)).rejects.toThrow(
      'video_studio_tx_recovery_conflict'
    )
    expect(await readFile(join(projectDir, 'a.txt'), 'utf8')).toBe('keep-me')

    // Also test valid JSON tampered after signing
    const signed = signTxJournal({
      schemaVersion: 1,
      txId: 'tx-tamper',
      state: 'committing',
      createdAt: 1000,
      entries: [
        {
          relativePath: 'a.txt',
          kind: 'write',
          existed: true,
          beforeSha256: sha256('keep-me'),
          afterSha256: sha256('other'),
          backupRelativePath: '.orca/.staging/tx-tamper/backups/0-a.txt',
          stagedRelativePath: '.orca/.staging/tx-tamper/staged/0-a.txt'
        }
      ]
    })
    const tampered = { ...signed, state: 'preparing' }
    await writeFile(join(projectDir, '.orca', 'tx.log'), JSON.stringify(tampered), 'utf8')

    await expect(recoverPendingProjectTransaction(projectDir)).rejects.toThrow(
      'video_studio_tx_recovery_conflict'
    )
    const conflict = JSON.parse(
      await readFile(join(projectDir, '.orca', 'tx-conflict-tx-tamper.json'), 'utf8')
    )
    expect(conflict.reason).toBe('journal_tampered_or_malformed')
  })

  it('is idempotent across interrupted recovery and preserves external agent edits untouched', async () => {
    await writeFile(join(projectDir, 'a.txt'), 'before-a', 'utf8')
    await writeFile(join(projectDir, 'b.txt'), 'before-b', 'utf8')
    const tx = new VideoStudioTransactionCoordinator()
    let capturedTxId = ''

    await expect(
      tx.runProjectTransaction({
        projectDir,
        operations: [
          { relativePath: 'a.txt', content: 'after-a', expectedSha256: sha256('before-a') },
          { relativePath: 'b.txt', content: 'after-b', expectedSha256: sha256('before-b') }
        ],
        onPhase: async (phase, txId) => {
          if (phase === 'committing') {
            capturedTxId = txId
            await writeFile(join(projectDir, 'a.txt'), 'after-a', 'utf8')
            throw new Error('simulated_crash')
          }
        }
      })
    ).rejects.toThrow('simulated_crash')

    // Simulate interruption mid-recovery after first restore step
    await expect(
      recoverPendingProjectTransaction(projectDir, {
        onStep: async (step) => {
          if (step === 'restored-entry:0') {
            throw new Error('recovery_interrupted')
          }
        }
      })
    ).rejects.toThrow('recovery_interrupted')

    // Second recovery pass succeeds cleanly and is idempotent
    const secondPass = await recoverPendingProjectTransaction(projectDir)
    expect(secondPass).toEqual({ recovered: true, action: 'rolled-back', txId: capturedTxId })
    expect(await readFile(join(projectDir, 'a.txt'), 'utf8')).toBe('before-a')
    expect(await readFile(join(projectDir, 'b.txt'), 'utf8')).toBe('before-b')

    const thirdPass = await recoverPendingProjectTransaction(projectDir)
    expect(thirdPass).toEqual({ recovered: false, action: 'none' })
  })

  it('aborts cleanly before committing when backup integrity check fails during staging verification', async () => {
    await writeFile(join(projectDir, 'a.txt'), 'before-a', 'utf8')
    const tx = new VideoStudioTransactionCoordinator()

    await expect(
      tx.runProjectTransaction({
        projectDir,
        operations: [
          { relativePath: 'a.txt', content: 'after-a', expectedSha256: sha256('before-a') }
        ],
        onPhase: async (phase, txId) => {
          if (phase === 'preparing') {
            const backupsDir = join(projectDir, '.orca', '.staging', txId, 'backups')
            const backupFiles = await readdir(backupsDir)
            await rm(join(backupsDir, backupFiles[0]), { force: true })
          }
        }
      })
    ).rejects.toThrow('video_studio_tx_staging_verification_failed')

    expect(await readFile(join(projectDir, 'a.txt'), 'utf8')).toBe('before-a')
    await expect(readFile(join(projectDir, '.orca', 'tx.log'), 'utf8')).rejects.toThrow()
  })

  it('preserves external agent edits untouched with tx-conflict artifact', async () => {
    await writeFile(join(projectDir, 'a.txt'), 'before-a', 'utf8')
    const tx = new VideoStudioTransactionCoordinator()
    let capturedTxId = ''

    // Now test external agent edit conflict preservation
    await expect(
      tx.runProjectTransaction({
        projectDir,
        operations: [
          { relativePath: 'a.txt', content: 'after-a', expectedSha256: sha256('before-a') }
        ],
        onPhase: async (phase, txId) => {
          if (phase === 'committing') {
            capturedTxId = txId
            await writeFile(join(projectDir, 'a.txt'), 'external-agent-edit', 'utf8')
            throw new Error('simulated_crash')
          }
        }
      })
    ).rejects.toThrow('simulated_crash')

    await expect(recoverPendingProjectTransaction(projectDir)).rejects.toThrow(
      'video_studio_tx_recovery_conflict'
    )
    expect(await readFile(join(projectDir, 'a.txt'), 'utf8')).toBe('external-agent-edit')
    const conflict = JSON.parse(
      await readFile(join(projectDir, '.orca', `tx-conflict-${capturedTxId}.json`), 'utf8')
    )
    expect(conflict.reason).toBe('external_modification')
  })

  it('always acquires deterministic fallback project lock when projectId is omitted so concurrent transactions serialize cleanly', async () => {
    await writeFile(join(projectDir, 'a.txt'), 'init-a', 'utf8')
    await writeFile(join(projectDir, 'b.txt'), 'init-b', 'utf8')
    const locks = new VideoStudioLockCoordinator()
    const tx = new VideoStudioTransactionCoordinator(locks)
    const timeline: string[] = []

    const p1 = tx.runProjectTransaction({
      projectDir,
      operations: [{ relativePath: 'a.txt', content: 'next-a', expectedSha256: sha256('init-a') }],
      onPhase: async (phase) => {
        if (phase === 'preparing') {
          expect(locks.getHeldLocks()).toHaveLength(1)
          expect(locks.getHeldLocks()[0]).toMatch(/^project:dir-[a-f0-9]{32}$/)
          timeline.push('tx1:start')
          await new Promise((r) => setTimeout(r, 20))
        } else if (phase === 'committed') {
          timeline.push('tx1:end')
        }
      }
    })

    const p2 = tx.runProjectTransaction({
      projectDir,
      operations: [{ relativePath: 'b.txt', content: 'next-b', expectedSha256: sha256('init-b') }],
      onPhase: async (phase) => {
        if (phase === 'preparing') {
          expect(locks.getHeldLocks()).toHaveLength(1)
          timeline.push('tx2:start')
        } else if (phase === 'committed') {
          timeline.push('tx2:end')
        }
      }
    })

    await Promise.all([p1, p2])
    expect(timeline).toEqual(['tx1:start', 'tx1:end', 'tx2:start', 'tx2:end'])
    expect(await readFile(join(projectDir, 'a.txt'), 'utf8')).toBe('next-a')
    expect(await readFile(join(projectDir, 'b.txt'), 'utf8')).toBe('next-b')
  })
})

describe('VideoStudioLockCoordinator canonical lock order', () => {
  it('serializes shared Host Library and cross-project locks without deadlock and rejects inverted lock acquisition', async () => {
    const locks = new VideoStudioLockCoordinator()
    const events: string[] = []
    let notifyAssetsAcquired!: () => void
    const assetsAcquired = new Promise<void>((resolve) => {
      notifyAssetsAcquired = resolve
    })

    const jobA = locks.withHostStylesLock(async () => {
      events.push('A:styles:enter')
      await locks.withHostAssetsLock(async () => {
        events.push('A:assets:enter')
        notifyAssetsAcquired()
        await locks.withProjectLock('proj-a', async () => {
          events.push('A:proj-a:enter')
          await new Promise((r) => setTimeout(r, 15))
          events.push('A:proj-a:exit')
        })
        events.push('A:assets:exit')
      })
      events.push('A:styles:exit')
    })

    await assetsAcquired
    const jobB = locks.withHostAssetsLock(async () => {
      events.push('B:assets:enter')
      await locks.withProjectLock('proj-b', async () => {
        events.push('B:proj-b:enter')
      })
      events.push('B:assets:exit')
    })

    await Promise.all([jobA, jobB])
    expect(events.indexOf('A:assets:exit')).toBeLessThan(events.indexOf('B:assets:enter'))

    // Inverted orders MUST throw immediately without deadlocking
    await expect(
      locks.withHostAssetsLock(() => locks.withHostStylesLock(async () => {}))
    ).rejects.toThrow('video_studio_lock_order_violation')

    await expect(
      locks.withProjectLock('proj-a', () => locks.withHostAssetsLock(async () => {}))
    ).rejects.toThrow('video_studio_lock_order_violation')

    await expect(
      locks.withProjectLock('proj-a', () => locks.withProjectLock('proj-b', async () => {}))
    ).rejects.toThrow('video_studio_lock_order_violation')
  })
})

describe('Host-Managed Trust Store & TOCTOU verification', () => {
  it('rejects self-approval written inside project .orca/project-state.json', async () => {
    await writeFile(join(projectDir, 'index.html'), '<html><body>ok</body></html>', 'utf8')
    await mkdir(join(projectDir, '.orca'), { recursive: true })
    await writeFile(
      join(projectDir, '.orca', 'project-state.json'),
      JSON.stringify({ trustState: 'approved-render', approved: true }),
      'utf8'
    )

    const trustStore = new VideoStudioTrustStore(profileDir)
    await expect(
      trustStore.assertApprovedForExecution({
        projectId: 'proj-1',
        projectDir,
        mode: 'preview'
      })
    ).rejects.toThrow('video_studio_execution_approval_required')
  })

  it('invalidates approval when .js, .css, .svg, hyperframes.json, engineConfig, or runtimeIdentity changes', async () => {
    await mkdir(join(projectDir, 'assets'), { recursive: true })
    await writeFile(
      join(projectDir, 'index.html'),
      '<html><script src="app.js"></script></html>',
      'utf8'
    )
    await writeFile(join(projectDir, 'app.js'), 'console.log(1)', 'utf8')
    await writeFile(join(projectDir, 'style.css'), 'body { color: #000; }', 'utf8')
    await writeFile(join(projectDir, 'assets', 'icon.svg'), '<svg></svg>', 'utf8')
    await writeFile(join(projectDir, 'hyperframes.json'), '{"version":1}', 'utf8')

    const trustStore = new VideoStudioTrustStore(profileDir)
    const initial = await computeProjectInputFingerprint(projectDir, {
      engineConfig: { quality: 'draft' },
      runtimeIdentity: 'hyperframes@0.9.94'
    })

    await trustStore.approveProjectExecution({
      projectId: 'proj-1',
      projectDir,
      trustState: 'approved-preview',
      inputFingerprint: initial.inputFingerprint,
      engineConfig: { quality: 'draft' },
      runtimeIdentity: 'hyperframes@0.9.94'
    })

    // Preview & check allowed, render rejected when only approved-preview
    await expect(
      trustStore.assertApprovedForExecution({
        projectId: 'proj-1',
        projectDir,
        mode: 'preview',
        engineConfig: { quality: 'draft' },
        runtimeIdentity: 'hyperframes@0.9.94'
      })
    ).resolves.toMatchObject({ inputFingerprint: initial.inputFingerprint })

    await expect(
      trustStore.assertApprovedForExecution({
        projectId: 'proj-1',
        projectDir,
        mode: 'render',
        engineConfig: { quality: 'draft' },
        runtimeIdentity: 'hyperframes@0.9.94'
      })
    ).rejects.toThrow('video_studio_execution_approval_required')

    // Mutating runtimeIdentity or engineConfig invalidates
    expect(stableJsonSerialize([1, undefined])).toBe('[1,null]')
    await expect(
      trustStore.assertApprovedForExecution({
        projectId: 'proj-1',
        projectDir,
        mode: 'preview',
        engineConfig: { quality: 'draft' },
        runtimeIdentity: 'hyperframes@0.9.95'
      })
    ).rejects.toThrow('video_studio_execution_approval_required')

    await expect(
      trustStore.assertApprovedForExecution({
        projectId: 'proj-1',
        projectDir,
        mode: 'preview',
        engineConfig: { quality: 'delivery' },
        runtimeIdentity: 'hyperframes@0.9.94'
      })
    ).rejects.toThrow('video_studio_execution_approval_required')

    // Mutating .js, .css, .svg, hyperframes.json invalidates
    for (const [rel, nextContent] of [
      ['app.js', 'console.log(2)'],
      ['style.css', 'body { color: #fff; }'],
      ['assets/icon.svg', '<svg><circle/></svg>'],
      ['hyperframes.json', '{"version":2}']
    ] as const) {
      const target = join(projectDir, ...rel.split('/'))
      const prev = await readFile(target, 'utf8')
      await writeFile(target, nextContent, 'utf8')
      await expect(
        trustStore.assertApprovedForExecution({
          projectId: 'proj-1',
          projectDir,
          mode: 'check',
          engineConfig: { quality: 'draft' },
          runtimeIdentity: 'hyperframes@0.9.94'
        })
      ).rejects.toThrow('video_studio_execution_approval_required')
      await writeFile(target, prev, 'utf8')
    }
  })

  it('catches TOCTOU file modification right before Chrome spawn via withExecutionVerifiedSnapshot', async () => {
    await writeFile(join(projectDir, 'index.html'), '<html>safe</html>', 'utf8')
    const trustStore = new VideoStudioTrustStore(profileDir)
    const fp = await computeProjectInputFingerprint(projectDir)
    await trustStore.approveProjectExecution({
      projectId: 'proj-1',
      projectDir,
      trustState: 'approved-render',
      inputFingerprint: fp.inputFingerprint
    })

    const spawnSpy = vi.fn(async () => 'spawned')
    await expect(
      withExecutionVerifiedSnapshot(
        trustStore,
        {
          projectId: 'proj-1',
          projectDir,
          mode: 'render',
          prepare: async () => {
            // Attacker modifies index.html during pre-spawn prepare window
            await writeFile(
              join(projectDir, 'index.html'),
              '<html><script>evil()</script></html>',
              'utf8'
            )
          }
        },
        spawnSpy
      )
    ).rejects.toThrow('video_studio_execution_approval_required')

    expect(spawnSpy).not.toHaveBeenCalled()
  })

  it('scopes trust decisions to (projectId, projectRootRealpath), supports revocation, and allows transaction under outer canonical lock', async () => {
    await writeFile(join(projectDir, 'index.html'), '<html>ok</html>', 'utf8')
    const otherDir = resolveVideoStudioProjectDir(profileDir, 'proj-2')
    await mkdir(otherDir, { recursive: true })
    await writeFile(join(otherDir, 'index.html'), '<html>ok</html>', 'utf8')

    const trustStore = new VideoStudioTrustStore(profileDir)
    const fp = await computeProjectInputFingerprint(projectDir)
    await trustStore.approveProjectExecution({
      projectId: 'proj-1',
      projectDir,
      trustState: 'approved-render',
      inputFingerprint: fp.inputFingerprint
    })

    // Same projectId at a different projectRootRealpath is rejected
    await expect(
      trustStore.assertApprovedForExecution({
        projectId: 'proj-1',
        projectDir: otherDir,
        mode: 'preview'
      })
    ).rejects.toThrow('video_studio_execution_approval_required')

    await trustStore.revokeProjectExecution('proj-1', projectDir)
    await expect(
      trustStore.assertApprovedForExecution({
        projectId: 'proj-1',
        projectDir,
        mode: 'preview'
      })
    ).rejects.toThrow('video_studio_execution_approval_required')

    // Transaction called inside outer canonical lock (hostAssets -> project:proj-1) succeeds without self-deadlock
    const locks = new VideoStudioLockCoordinator()
    const tx = new VideoStudioTransactionCoordinator(locks)
    await locks.withHostAssetsLock(() =>
      locks.withProjectLock('proj-1', async () => {
        await tx.runProjectTransaction({
          projectDir,
          projectId: 'proj-1',
          operations: [
            {
              relativePath: 'index.html',
              content: '<html>updated-under-lock</html>',
              expectedSha256: sha256('<html>ok</html>')
            }
          ]
        })
      })
    )
    expect(await readFile(join(projectDir, 'index.html'), 'utf8')).toBe(
      '<html>updated-under-lock</html>'
    )
  })
})
