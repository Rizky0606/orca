import type { SettingsSearchEntry } from '../search/settings-search'
import { getBrowserPaneSearchEntries } from './browser-search'
import { getBrowserUsePaneSearchEntries } from './use/browser-use-search'
import { getBrowserPasswordsSearchEntry } from './passwords/browser-passwords-copy'
import { getBrowserMemorySaverSearchEntry } from './browser-memory-saver-search'
import { getBrowserExtensionsSearchEntry } from './extensions/browser-extensions-search'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'

export const getBrowserPaneCombinedSearchEntries = createLocalizedCatalog(
  (): SettingsSearchEntry[] => [
    ...getBrowserUsePaneSearchEntries(),
    ...getBrowserPaneSearchEntries(),
    getBrowserMemorySaverSearchEntry(),
    getBrowserPasswordsSearchEntry(),
    getBrowserExtensionsSearchEntry(),
    {
      title: translate(
        'settings.browser.webSearchProviders.title',
        'General Chat Web Search & API keys'
      ),
      description: translate(
        'settings.browser.webSearchProviders.description',
        'Built-in DuckDuckGo search works with zero keys. Add optional encrypted keys for Tavily, Brave, or Exa.'
      ),
      keywords: [
        'web search',
        'deep research',
        'general chat',
        'tavily',
        'brave',
        'exa',
        'duckduckgo'
      ]
    }
  ]
)
