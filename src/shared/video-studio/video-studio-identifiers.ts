import * as z from 'zod'

/** Rejects empty strings, path separators, traversal segments, and leading-dot hidden names. */
export function createSafeResourceIdSchema(label: string, maxLength = 128) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .refine(
      (value) => !/[\\/\0]/.test(value) && !value.includes('..') && !value.startsWith('.'),
      `Invalid ${label}`
    )
}

export const SafeResourceIdSchema = createSafeResourceIdSchema('resource id')
export type SafeResourceId = z.infer<typeof SafeResourceIdSchema>
