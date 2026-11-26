import * as z from 'zod'
import type { MasterAssetRecord } from '../../../shared/video-studio/video-studio-asset-contract'
import type { StyleProfile } from '../../../shared/video-studio/video-studio-style-contract'

export const MotionPackageManifestSchema = z.object({
  name: z.string().trim().min(1),
  version: z.string().trim().min(1),
  license: z.string().trim().min(1),
  entry: z.string().trim().min(1),
  dependencies: z.record(z.string(), z.string()).default({}),
  hashedInventory: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/i)).default({}),
  inputsSchemaPath: z.string().trim().min(1).optional(),
  elementsDir: z.string().trim().min(1).optional(),
  materialsDir: z.string().trim().min(1).optional(),
  presetsDir: z.string().trim().min(1).optional()
})
export type MotionPackageManifest = z.infer<typeof MotionPackageManifestSchema>

export type MotionPackageInspection = {
  manifest: MotionPackageManifest
  valid: boolean
  errors: string[]
}

export type MotionPackageMappingResult = {
  styleProfilePatch?: Partial<StyleProfile>
  assets: MasterAssetRecord[]
  warnings: string[]
}

export type MotionPackageAdapter = {
  inspectPackage(packageDir: string): Promise<MotionPackageInspection>
  validateManifest(rawManifest: unknown): {
    valid: boolean
    manifest?: MotionPackageManifest
    errors: string[]
  }
  mapToStyleAndAssets(
    packageDir: string,
    manifest: MotionPackageManifest
  ): Promise<MotionPackageMappingResult>
}
