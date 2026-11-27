import * as z from 'zod'
import { createSafeResourceIdSchema } from './video-studio-identifiers'
import { VideoStudioEngineSchema } from './video-studio-project'

export const AssetIdSchema = createSafeResourceIdSchema('asset id')

export const AssetTypeSchema = z.enum([
  'object',
  'character',
  'environment',
  'graphic',
  'model3d',
  'audio',
  'video',
  'lottie',
  'custom'
])
export type AssetType = z.infer<typeof AssetTypeSchema>

export const AssetFormatSchema = z.enum([
  'svg',
  'layered-svg',
  'png',
  'webp',
  'glb',
  'gltf',
  'lottie',
  'html',
  'mp4',
  'webm',
  'wav',
  'mp3'
])
export type AssetFormat = z.infer<typeof AssetFormatSchema>

export const AssetStateEntrySchema = z.object({
  file: z.string().trim().min(1),
  format: AssetFormatSchema.optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
  label: z.string().optional(),
  notes: z.string().optional(),
  dependencies: z.array(z.string().trim().min(1)).optional()
})
export type AssetStateEntry = z.infer<typeof AssetStateEntrySchema>

export const AssetVectorPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().optional()
})
export type AssetVectorPoint = z.infer<typeof AssetVectorPointSchema>

export const AssetAllowedTransformSchema = z.enum([
  'translate',
  'rotate',
  'scale',
  'opacity',
  'morph',
  'color'
])
export type AssetAllowedTransform = z.infer<typeof AssetAllowedTransformSchema>

export const AssetComponentSpecSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().optional(),
  selector: z.string().optional(),
  parentComponentId: z.string().trim().min(1).optional(),
  animatable: z.boolean(),
  pivot: AssetVectorPointSchema.optional(),
  anchor: AssetVectorPointSchema.optional(),
  allowedTransforms: z.array(AssetAllowedTransformSchema).optional()
})
export type AssetComponentSpec = z.infer<typeof AssetComponentSpecSchema>

export const AssetProvenanceSchema = z.object({
  source: z.enum(['library', 'imported', 'generated']),
  libraryAssetId: AssetIdSchema.optional(),
  libraryVersion: z.number().int().positive().optional(),
  originUrl: z.string().trim().url().optional()
})
export type AssetProvenance = z.infer<typeof AssetProvenanceSchema>

export const AssetLicenseSchema = z.object({
  spdx: z.string().optional(),
  attribution: z.string().optional(),
  commercialAllowed: z.boolean().optional()
})
export type AssetLicense = z.infer<typeof AssetLicenseSchema>

export const AssetConsistencySchema = z.object({
  lockGeometry: z.boolean(),
  lockProportions: z.boolean(),
  lockMaterials: z.boolean()
})
export type AssetConsistency = z.infer<typeof AssetConsistencySchema>

export const MasterAssetRecordSchema = z.object({
  id: AssetIdSchema,
  schemaVersion: z.literal(1),
  version: z.number().int().positive(),
  snapshotRevision: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  type: AssetTypeSchema,
  format: AssetFormatSchema,
  tags: z.array(z.string().trim().min(1)).default([]),
  defaultState: z.string().trim().min(1),
  states: z.record(z.string().trim().min(1), AssetStateEntrySchema),
  components: z.array(AssetComponentSpecSchema).default([]),
  supportedEngines: z.array(VideoStudioEngineSchema).min(1),
  dependencies: z.array(z.string().trim().min(1)).default([]),
  provenance: AssetProvenanceSchema,
  license: AssetLicenseSchema.optional(),
  consistency: AssetConsistencySchema,
  createdAt: z.number().nonnegative(),
  updatedAt: z.number().nonnegative()
})
export type MasterAssetRecord = z.infer<typeof MasterAssetRecordSchema>

export const AssetDynamicReferenceWarningSchema = z.object({
  file: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  expression: z.string().optional(),
  mayBeReferencedDynamically: z.literal(true).default(true)
})
export type AssetDynamicReferenceWarning = z.infer<typeof AssetDynamicReferenceWarningSchema>

export function dynamicReferenceWarning(
  file: string,
  reason: string,
  expression?: string
): AssetDynamicReferenceWarning {
  return {
    file,
    reason,
    ...(expression !== undefined ? { expression } : {}),
    mayBeReferencedDynamically: true
  }
}

export function validateMasterAssetInvariants(asset: MasterAssetRecord): {
  ok: boolean
  errors: string[]
} {
  const errors: string[] = []
  const stateKeys = Object.keys(asset.states)
  if (stateKeys.length === 0 || !Object.hasOwn(asset.states, asset.defaultState)) {
    errors.push(`defaultState "${asset.defaultState}" must reference an existing entry in states`)
  }

  const componentById = new Map<string, AssetComponentSpec>()
  const duplicateIds = new Set<string>()
  for (const component of asset.components) {
    if (componentById.has(component.id)) {
      duplicateIds.add(component.id)
    } else {
      componentById.set(component.id, component)
    }
  }
  for (const duplicateId of duplicateIds) {
    errors.push(`Duplicate component id "${duplicateId}"`)
  }

  for (const component of asset.components) {
    if (component.parentComponentId === undefined) {
      continue
    }
    if (component.parentComponentId === component.id) {
      errors.push(
        `Component "${component.id}" cannot reference itself as parentComponentId (cycle)`
      )
      continue
    }
    if (!componentById.has(component.parentComponentId)) {
      errors.push(
        `Component "${component.id}" references unknown parentComponentId "${component.parentComponentId}"`
      )
    }
  }

  // 0 = unvisited, 1 = visiting, 2 = visited
  const visitState = new Map<string, 0 | 1 | 2>()
  for (const id of componentById.keys()) {
    if ((visitState.get(id) ?? 0) !== 0) {
      continue
    }
    const chain: string[] = []
    let current: string | undefined = id
    while (current !== undefined) {
      const state = visitState.get(current) ?? 0
      if (state === 1) {
        const cycleStart = chain.indexOf(current)
        const cyclePath = [...chain.slice(cycleStart), current].join(' -> ')
        errors.push(`Component parentComponentId cycle detected: ${cyclePath}`)
        break
      }
      if (state === 2) {
        break
      }
      visitState.set(current, 1)
      chain.push(current)
      const parentId = componentById.get(current)?.parentComponentId
      current =
        parentId && componentById.has(parentId) && parentId !== current ? parentId : undefined
    }
    for (const nodeId of chain) {
      visitState.set(nodeId, 2)
    }
  }

  return { ok: errors.length === 0, errors }
}
