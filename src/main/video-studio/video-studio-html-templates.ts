import {
  videoStudioDimensionsForAspectRatio,
  type VideoStudioProject
} from '../../shared/video-studio/video-studio-project'
import type { StyleProfile } from '../../shared/video-studio/video-studio-style-contract'
import { escapeHtml } from './video-studio-document-seeds'

export const MAIN_COMPOSITION_ID = 'video-studio-main'
export const OPENING_COMPOSITION_ID = '01-opening'
const GSAP_CDN_URL = 'https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js'

function buildGoogleFontsUrl(styleProfile: StyleProfile): string {
  const families = Array.from(
    new Set([styleProfile.typography.displayFont, styleProfile.typography.bodyFont])
  )
    .map((name) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;600;700`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${families}&display=swap`
}

/** Builds the root `index.html` orchestrator mounting `compositions/01-opening.html`. */
export function buildIndexHtml(project: VideoStudioProject, styleProfile: StyleProfile): string {
  const { width, height } = videoStudioDimensionsForAspectRatio(project.aspectRatio)
  const safeTitle = escapeHtml(project.title)
  const safePrompt = escapeHtml(
    project.prompt.trim() || 'Edit compositions/01-opening.html or add modular scenes.'
  )
  const duration = project.durationSeconds
  const { palette } = styleProfile.visual
  const fontsUrl = buildGoogleFontsUrl(styleProfile)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <meta name="description" content="${safePrompt}" />
    <title>${safeTitle}</title>
    <link rel="stylesheet" href="${fontsUrl}" />
    <script src="${GSAP_CDN_URL}"></script>
    <style>
      :root {
        --hf-bg: ${palette.background};
        --hf-surface: ${palette.surface};
        --hf-ink: ${palette.primaryText};
        --hf-muted: ${palette.secondaryText};
        --hf-accent: ${palette.accentPrimary};
        --hf-accent-secondary: ${palette.accentSecondary ?? palette.accentPrimary};
        --hf-highlight: ${palette.highlight ?? palette.accentPrimary};
      }
      * {
        box-sizing: border-box;
      }
      html,
      body {
        margin: 0;
        padding: 0;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        background: var(--hf-bg);
        color: var(--hf-ink);
        font-family: "${styleProfile.typography.bodyFont}", system-ui, sans-serif;
      }
      #root {
        position: relative;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
      }
      .comp-layer {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="${MAIN_COMPOSITION_ID}"
      data-start="0"
      data-width="${width}"
      data-height="${height}"
      data-fps="${project.fps}"
      data-duration="${duration}"
    >
      <div
        id="opening-layer"
        class="comp-layer"
        data-composition-id="${OPENING_COMPOSITION_ID}"
        data-composition-src="./compositions/01-opening.html"
        data-start="0"
        data-duration="${duration}"
        data-track-index="0"
      ></div>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      if (typeof gsap !== 'undefined') {
        const tl = gsap.timeline({ paused: true });
        window.__timelines['${MAIN_COMPOSITION_ID}'] = tl;
        tl.seek(0);
      }
    </script>
  </body>
</html>
`
}

/** Builds the modular `<template>` sub-composition for `compositions/01-opening.html`. */
export function buildOpeningCompositionHtml(
  project: VideoStudioProject,
  styleProfile: StyleProfile
): string {
  const { width, height } = videoStudioDimensionsForAspectRatio(project.aspectRatio)
  const safeTitle = escapeHtml(project.title)
  const safePrompt = escapeHtml(
    project.prompt.trim() || 'Edit compositions/01-opening.html or add modular scenes.'
  )
  const duration = project.durationSeconds
  const exitAt = Math.max(1.2, duration - 0.8)
  const { palette } = styleProfile.visual
  const fontsUrl = buildGoogleFontsUrl(styleProfile)

  return `<template id="tpl-${OPENING_COMPOSITION_ID}">
  <div
    data-composition-id="${OPENING_COMPOSITION_ID}"
    data-width="${width}"
    data-height="${height}"
    data-duration="${duration}"
  >
    <link rel="stylesheet" href="${fontsUrl}" />
    <section id="scene-opening" class="scene-opening">
      <p id="scene-kicker" class="kicker">Orca Video Studio</p>
      <h1 id="scene-title" class="headline">${safeTitle}</h1>
      <p id="scene-prompt" class="summary">${safePrompt}</p>
    </section>

    <style>
      [data-composition-id="${OPENING_COMPOSITION_ID}"] .scene-opening {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 10%;
        gap: 24px;
        text-align: center;
        background: ${palette.background};
        color: ${palette.primaryText};
        font-family: "${styleProfile.typography.bodyFont}", system-ui, sans-serif;
      }
      [data-composition-id="${OPENING_COMPOSITION_ID}"] .kicker {
        margin: 0;
        font-size: 28px;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: ${palette.accentPrimary};
      }
      [data-composition-id="${OPENING_COMPOSITION_ID}"] .headline {
        margin: 0;
        max-width: 18ch;
        font-family: "${styleProfile.typography.displayFont}", system-ui, sans-serif;
        font-size: clamp(48px, 6vw, 96px);
        line-height: 1.08;
        font-weight: ${styleProfile.typography.titleWeight};
        color: ${palette.primaryText};
      }
      [data-composition-id="${OPENING_COMPOSITION_ID}"] .summary {
        margin: 0;
        max-width: 52ch;
        font-size: clamp(28px, 2.5vw, 34px);
        line-height: 1.45;
        color: ${palette.secondaryText};
      }
    </style>

    <script src="${GSAP_CDN_URL}"></script>
    <script>
      (function () {
        window.__timelines = window.__timelines || {};
        if (typeof gsap === 'undefined') {
          return;
        }
        const tl = gsap.timeline({ paused: true });
        tl.fromTo(
          '[data-composition-id="${OPENING_COMPOSITION_ID}"] #scene-kicker',
          { y: 12, opacity: 0.9 },
          { y: 0, opacity: 1, duration: 0.45, ease: 'power2.out' },
          0
        );
        tl.fromTo(
          '[data-composition-id="${OPENING_COMPOSITION_ID}"] #scene-title',
          { y: 10, opacity: 1 },
          { y: 0, opacity: 1, duration: 0.65, ease: 'power3.out' },
          0
        );
        tl.fromTo(
          '[data-composition-id="${OPENING_COMPOSITION_ID}"] #scene-prompt',
          { y: 16, opacity: 0.9 },
          { y: 0, opacity: 1, duration: 0.65, ease: 'power2.out' },
          0.1
        );
        tl.to(
          '[data-composition-id="${OPENING_COMPOSITION_ID}"] #scene-title',
          { y: -6, duration: ${Math.max(0.5, exitAt - 1.2).toFixed(2)}, ease: 'none' },
          1.2
        );
        window.__timelines['${OPENING_COMPOSITION_ID}'] = tl;
      })();
    </script>
  </div>
</template>
`
}
