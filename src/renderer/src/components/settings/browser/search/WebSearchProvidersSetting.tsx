import { useCallback, useEffect, useState } from 'react'
import { Check, KeyRound, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslate } from '@/i18n/use-translate'
import {
  listGeneralChatSearchProvidersForTarget,
  setGeneralChatSearchProviderKeyForTarget
} from '@/runtime/general-chat/general-chat-client'
import { runtimeRpcTargetForAuthorityKey } from '@/runtime/rpc/targets/runtime-client-target'
import type { ExecutionHostId } from '../../../../../../shared/execution-host/execution-host'
import type {
  ConfigurableSearchProvider,
  SearchProviderStatus
} from '../../../../../../shared/general-chat/general-chat-contract'
import { SearchableSetting } from '../../section-layout/SearchableSetting'
import { translateSearchKeyword } from '../../search/settings-search-keywords'
import type { Translate } from '@/i18n/use-translate'

const PROVIDER_LABELS: Record<ConfigurableSearchProvider, string> = {
  tavily: 'Tavily Search API',
  brave: 'Brave Search API',
  exa: 'Exa Search API'
}

function isConfigurableProvider(
  provider: SearchProviderStatus['provider']
): provider is ConfigurableSearchProvider {
  return provider === 'tavily' || provider === 'brave' || provider === 'exa'
}

async function saveProviderKeyRequest(
  target: NonNullable<ReturnType<typeof runtimeRpcTargetForAuthorityKey>>,
  provider: ConfigurableSearchProvider,
  apiKey: string
): Promise<SearchProviderStatus[]> {
  const response = await setGeneralChatSearchProviderKeyForTarget(target, provider, apiKey)
  return response.providers
}

export function getWebSearchProvidersSearchEntry(translateFn: Translate) {
  return {
    title: translateFn(
      'settings.browser.webSearchProviders.title',
      'General Chat Web Search & API keys'
    ),
    description: translateFn(
      'settings.browser.webSearchProviders.description',
      'Built-in DuckDuckGo search works with zero keys. Add optional encrypted keys for Tavily, Brave, or Exa.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'settings.browser.webSearchProviders.searchKeywords.webSearch',
        'web search',
        undefined,
        translateFn
      ),
      ...translateSearchKeyword(
        'settings.browser.webSearchProviders.searchKeywords.deepResearch',
        'deep research',
        undefined,
        translateFn
      ),
      ...translateSearchKeyword(
        'settings.browser.webSearchProviders.searchKeywords.generalChat',
        'general chat',
        undefined,
        translateFn
      ),
      ...translateSearchKeyword(
        'settings.browser.webSearchProviders.searchKeywords.tavily',
        'tavily',
        { englishOnly: true },
        translateFn
      ),
      ...translateSearchKeyword(
        'settings.browser.webSearchProviders.searchKeywords.brave',
        'brave',
        { englishOnly: true },
        translateFn
      ),
      ...translateSearchKeyword(
        'settings.browser.webSearchProviders.searchKeywords.exa',
        'exa',
        { englishOnly: true },
        translateFn
      ),
      ...translateSearchKeyword(
        'settings.browser.webSearchProviders.searchKeywords.duckduckgo',
        'duckduckgo',
        { englishOnly: true },
        translateFn
      )
    ]
  }
}

export function WebSearchProvidersSetting({
  hostId
}: {
  hostId: ExecutionHostId
}): React.JSX.Element {
  const t = useTranslate()
  const [statuses, setStatuses] = useState<SearchProviderStatus[]>([])
  const [draftKeys, setDraftKeys] = useState<Partial<Record<ConfigurableSearchProvider, string>>>(
    {}
  )
  const [busyProvider, setBusyProvider] = useState<ConfigurableSearchProvider | null>(null)
  const [error, setError] = useState<string | null>(null)
  const searchEntry = getWebSearchProvidersSearchEntry(t)

  const target = runtimeRpcTargetForAuthorityKey(hostId)

  const loadStatuses = useCallback(async () => {
    if (!target) {
      return
    }
    try {
      const response = await listGeneralChatSearchProvidersForTarget(target)
      setStatuses(response.providers)
      setError(null)
    } catch {
      setError(
        t(
          'settings.browser.webSearchProviders.loadFailed',
          'Could not inspect search providers on the selected host.'
        )
      )
    }
  }, [target, t])

  useEffect(() => {
    void loadStatuses()
  }, [loadStatuses])

  const saveKey = async (provider: ConfigurableSearchProvider, apiKey: string): Promise<void> => {
    if (!target) {
      return
    }
    setBusyProvider(provider)
    setError(null)
    await saveProviderKeyRequest(target, provider, apiKey)
      .then((nextStatuses) => {
        setStatuses(nextStatuses)
        setDraftKeys((prev) => ({ ...prev, [provider]: '' }))
      })
      .catch(() => {
        setError(
          t(
            'settings.browser.webSearchProviders.saveFailed',
            'Could not update the encrypted API key on this host.'
          )
        )
      })
    setBusyProvider(null)
  }

  return (
    <SearchableSetting
      title={searchEntry.title}
      description={searchEntry.description}
      keywords={searchEntry.keywords}
      className="space-y-3 py-3"
    >
      <div className="space-y-1">
        <Label>
          {t(
            'settings.browser.webSearchProviders.heading',
            'General Chat Web Search & Deep Research'
          )}
        </Label>
        <p className="text-xs text-muted-foreground">
          {t(
            'settings.browser.webSearchProviders.subtext',
            'DuckDuckGo is always ready with zero setup. Optional API keys are encrypted on this computer or paired host.'
          )}
        </p>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium">
            {t('settings.browser.webSearchProviders.duckduckgo', 'DuckDuckGo (Built-in default)')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              'settings.browser.webSearchProviders.duckduckgoDesc',
              'Zero-config web search and automatic fallback when API providers are unset.'
            )}
          </p>
        </div>
        <Badge variant="secondary">
          <Check aria-hidden="true" className="size-3" />
          {t('settings.browser.webSearchProviders.readyBadge', 'Ready')}
        </Badge>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <div className="space-y-2">
        {statuses
          .filter((entry) => isConfigurableProvider(entry.provider))
          .map((entry) => {
            if (!isConfigurableProvider(entry.provider)) {
              return null
            }
            const provider = entry.provider
            const draft = draftKeys[provider] ?? ''
            const busy = busyProvider === provider
            return (
              <div
                key={provider}
                className="flex flex-col gap-2 rounded-md border border-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-2">
                  <KeyRound aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">{PROVIDER_LABELS[provider]}</span>
                  {entry.configured ? (
                    <Badge variant="secondary">
                      {t('settings.browser.webSearchProviders.configured', 'Configured')}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="password"
                    value={draft}
                    disabled={busy}
                    aria-label={t(
                      'settings.browser.webSearchProviders.inputLabel',
                      '{{provider}} API key',
                      { provider: PROVIDER_LABELS[provider] }
                    )}
                    placeholder={
                      entry.configured
                        ? t(
                            'settings.browser.webSearchProviders.replacePlaceholder',
                            'Replace saved key…'
                          )
                        : t(
                            'settings.browser.webSearchProviders.enterPlaceholder',
                            'Paste optional key…'
                          )
                    }
                    density="compact"
                    className="w-44"
                    onChange={(event) =>
                      setDraftKeys((prev) => ({ ...prev, [provider]: event.target.value }))
                    }
                  />
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={busy || draft.trim().length === 0}
                    onClick={() => void saveKey(provider, draft)}
                  >
                    {t('common.save', 'Save')}
                  </Button>
                  {entry.configured ? (
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="muted-field-icon"
                      disabled={busy}
                      aria-label={t(
                        'settings.browser.webSearchProviders.removeKey',
                        'Remove {{provider}} key',
                        { provider: PROVIDER_LABELS[provider] }
                      )}
                      onClick={() => void saveKey(provider, '')}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}
      </div>
    </SearchableSetting>
  )
}
