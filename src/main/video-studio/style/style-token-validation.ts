import type {
  StyleProfile,
  StyleProfileTokensPatch
} from '../../../shared/video-studio/video-studio-style-contract'

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const NAMED_COLOR_RE = /^[a-zA-Z]{1,32}$/
const FUNC_COLOR_RE = /^(rgb|rgba|hsl|hsla|oklch|oklab)\(([^()]{1,96})\)$/
const FUNC_COLOR_ARG_RE = /^[0-9.,%\s/+-]+$/
const FUNC_COLOR_UNIT_RE = /\b(deg|rad|grad|turn|none)\b/g
const FONT_FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}$/
const SIMPLE_EASING_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/
const CUBIC_BEZIER_RE =
  /^cubic-bezier\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)$/
const STEPS_EASING_RE =
  /^steps\(\s*\d+\s*(?:,\s*(?:start|end|jump-start|jump-end|jump-none|jump-both))?\s*\)$/
const STYLE_TAG_TEXT_RE = /^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,79}$/

function invalidTokenError(field: string, reason: string): Error {
  return Object.assign(new Error(`video_studio_invalid_style_token:${field}:${reason}`), {
    code: 'invalid_argument'
  })
}

export function isSafeCssColor(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 128) {
    return false
  }
  if (HEX_COLOR_RE.test(trimmed) || NAMED_COLOR_RE.test(trimmed)) {
    return true
  }
  const match = FUNC_COLOR_RE.exec(trimmed)
  if (!match) {
    return false
  }
  const argsWithoutUnits = match[2].replace(FUNC_COLOR_UNIT_RE, '').trim()
  return argsWithoutUnits.length > 0 && FUNC_COLOR_ARG_RE.test(argsWithoutUnits)
}

export function assertSafeCssColor(value: string, field: string): string {
  const trimmed = value.trim()
  if (!isSafeCssColor(trimmed)) {
    throw invalidTokenError(field, 'invalid CSS color token')
  }
  return trimmed
}

export function isSafeFontFamily(value: string): boolean {
  return FONT_FAMILY_RE.test(value.trim())
}

export function assertSafeFontFamily(value: string, field: string): string {
  const trimmed = value.trim()
  if (!isSafeFontFamily(trimmed)) {
    throw invalidTokenError(field, 'invalid font family token')
  }
  return trimmed
}

export function assertSafeEasing(value: string, field: string): string {
  const trimmed = value.trim()
  if (
    !SIMPLE_EASING_RE.test(trimmed) &&
    !CUBIC_BEZIER_RE.test(trimmed) &&
    !STEPS_EASING_RE.test(trimmed)
  ) {
    throw invalidTokenError(field, 'invalid easing token')
  }
  return trimmed
}

function assertSafeStyleTag(value: string, field: string): string {
  const trimmed = value.trim()
  if (!STYLE_TAG_TEXT_RE.test(trimmed)) {
    throw invalidTokenError(field, 'invalid style identifier token')
  }
  return trimmed
}

/** Validates palette colors, typography fonts, easing, and style descriptors against CSS/HTML injection. */
export function assertSafeStyleProfileTokens(
  profile: StyleProfile | StyleProfileTokensPatch
): void {
  const palette = profile.visual?.palette
  if (palette) {
    const paletteFields: (keyof typeof palette)[] = [
      'background',
      'surface',
      'primaryText',
      'secondaryText',
      'accentPrimary',
      'accentSecondary',
      'highlight',
      'border'
    ]
    for (const key of paletteFields) {
      const value = palette[key]
      if (value !== undefined) {
        assertSafeCssColor(value, `visual.palette.${key}`)
      }
    }
  }
  if (profile.visual?.lighting !== undefined) {
    assertSafeStyleTag(profile.visual.lighting, 'visual.lighting')
  }
  if (profile.visual?.renderingStyle !== undefined) {
    assertSafeStyleTag(profile.visual.renderingStyle, 'visual.renderingStyle')
  }
  if (profile.typography?.displayFont !== undefined) {
    assertSafeFontFamily(profile.typography.displayFont, 'typography.displayFont')
  }
  if (profile.typography?.bodyFont !== undefined) {
    assertSafeFontFamily(profile.typography.bodyFont, 'typography.bodyFont')
  }
  if (profile.typography?.monoFont !== undefined) {
    assertSafeFontFamily(profile.typography.monoFont, 'typography.monoFont')
  }
  if (profile.motion?.defaultEasing !== undefined) {
    assertSafeEasing(profile.motion.defaultEasing, 'motion.defaultEasing')
  }
  if (profile.subtitle) {
    if (profile.subtitle.backgroundColor !== undefined) {
      assertSafeCssColor(profile.subtitle.backgroundColor, 'subtitle.backgroundColor')
    }
    if (profile.subtitle.textColor !== undefined) {
      assertSafeCssColor(profile.subtitle.textColor, 'subtitle.textColor')
    }
    if (profile.subtitle.highlightColor !== undefined) {
      assertSafeCssColor(profile.subtitle.highlightColor, 'subtitle.highlightColor')
    }
  }
}
