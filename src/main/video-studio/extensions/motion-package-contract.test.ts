import { describe, expect, it } from 'vitest'
import { RUNTIME_PASSTHROUGH_CODES } from '../../runtime/rpc/runtime-passthrough-codes'
import { MotionPackageManifestSchema } from './motion-package-contract'

describe('OpenMotion Contract Seam & Runtime Passthrough Codes', () => {
  it('validates OpenMotion v0.2 motion-package.json contract seam', () => {
    const manifest = MotionPackageManifestSchema.parse({
      name: 'technical-explainer-pack',
      version: '0.2.0',
      license: 'Apache-2.0',
      entry: 'index.html',
      dependencies: { gsap: '^3.12.0' },
      hashedInventory: {
        'DESIGN.md': 'a'.repeat(64)
      },
      inputsSchemaPath: 'inputs.schema.json',
      elementsDir: 'elements',
      materialsDir: 'materials',
      presetsDir: 'presets'
    })
    expect(manifest.name).toBe('technical-explainer-pack')
  })

  it('registers all Video Studio consistency passthrough error codes', () => {
    const expectedCodes = [
      'video_studio_file_conflict',
      'video_studio_tx_recovery_conflict',
      'video_studio_invalid_path',
      'video_studio_style_not_found',
      'video_studio_style_readonly',
      'video_studio_asset_not_found',
      'video_studio_asset_in_use',
      'video_studio_asset_invariant_invalid',
      'video_studio_scene_not_found',
      'video_studio_invalid_state_file',
      'video_studio_preview_session_stale',
      'video_studio_execution_approval_required'
    ]
    for (const code of expectedCodes) {
      expect(RUNTIME_PASSTHROUGH_CODES.has(code)).toBe(true)
    }
  })
})
