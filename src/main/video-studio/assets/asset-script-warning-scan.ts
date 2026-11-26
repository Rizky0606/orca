import {
  dynamicReferenceWarning,
  type AssetDynamicReferenceWarning
} from '../../../shared/video-studio/video-studio-asset-contract'

export const SCRIPT_EXTS = new Set(['.js', '.mjs', '.cjs'])
const HTML_SCRIPT_TAG_RE = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
const TEMPLATE_LITERAL_RE = /`(?:\\[\s\S]|[^`\\])*`/g
const TEMPLATE_ASSET_CUE_RE =
  /\$\{[^}]+\}[\s\S]*(?:assets\/|(?:objects|characters|environments|graphics|models|audio|video|lottie|custom)\/|asset-registry|\.(?:svg|png|webp|glb|gltf|mp4|webm|wav|mp3|json)\b)|(?:assets\/|(?:objects|characters|environments|graphics|models|audio|video|lottie|custom)\/|asset-registry)[\s\S]*\$\{[^}]+\}/i
const CONCAT_ASSET_RE =
  /(?:['"`](?:assets\/|(?:objects|characters|environments|graphics|models|audio|video|lottie|custom)\/)[^'"`]*['"`]\s*\+|\+\s*['"`][^'"`]*\.(?:svg|png|webp|glb|gltf|mp4|webm|wav|mp3|json)['"`])|(?:\[\s*['"]assets['"]\s*,[^[\]]{0,160}\]\s*\.join\s*\()/gi
const EVAL_CALL_RE = /\b(?:eval|new\s+Function)\s*\(/g
const DYNAMIC_FETCH_RE = /\b(?:fetch|import)\s*\(\s*(?!['"][^'"]+['"]\s*\))[^)]*assets\//gi

export function extractScriptBlocks(content: string, ext: string): string[] {
  if (SCRIPT_EXTS.has(ext)) {
    return [content]
  }
  if (ext !== '.html' && ext !== '.htm' && ext !== '.svg') {
    return []
  }
  const blocks: string[] = []
  HTML_SCRIPT_TAG_RE.lastIndex = 0
  let match: RegExpExecArray | null = HTML_SCRIPT_TAG_RE.exec(content)
  while (match !== null) {
    if (match[1].trim()) {
      blocks.push(match[1])
    }
    match = HTML_SCRIPT_TAG_RE.exec(content)
  }
  return blocks
}

function collectRegexWarnings(
  regex: RegExp,
  scriptText: string,
  reason: string,
  pushUnique: (reason: string, expr: string) => void
): void {
  regex.lastIndex = 0
  let match: RegExpExecArray | null = regex.exec(scriptText)
  while (match !== null) {
    pushUnique(reason, match[0])
    match = regex.exec(scriptText)
  }
}

export function scanScriptTextForWarnings(
  relFile: string,
  scriptText: string,
  seen: Set<string>,
  out: AssetDynamicReferenceWarning[]
): void {
  const pushUnique = (reason: string, expression: string): void => {
    const trimmed = expression.trim().slice(0, 160)
    const key = `${relFile}::${reason}::${trimmed}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push(dynamicReferenceWarning(relFile, reason, trimmed))
    }
  }

  TEMPLATE_LITERAL_RE.lastIndex = 0
  let tplMatch: RegExpExecArray | null = TEMPLATE_LITERAL_RE.exec(scriptText)
  while (tplMatch !== null) {
    if (TEMPLATE_ASSET_CUE_RE.test(tplMatch[0])) {
      pushUnique('Dynamic template literal may construct asset paths under assets/', tplMatch[0])
    }
    tplMatch = TEMPLATE_LITERAL_RE.exec(scriptText)
  }

  collectRegexWarnings(
    CONCAT_ASSET_RE,
    scriptText,
    'Dynamic string concatenation may construct asset paths under assets/',
    pushUnique
  )
  collectRegexWarnings(
    EVAL_CALL_RE,
    scriptText,
    'Evaluated JavaScript (eval/Function) may reference assets dynamically',
    pushUnique
  )
  collectRegexWarnings(
    DYNAMIC_FETCH_RE,
    scriptText,
    'Dynamic fetch/import expression targets assets/',
    pushUnique
  )
}
