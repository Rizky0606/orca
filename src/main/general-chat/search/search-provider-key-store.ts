import * as z from 'zod'
import type {
  ConfigurableSearchProvider,
  SearchProviderStatus
} from '../../../shared/general-chat/general-chat-research-contract'
import { createEncryptedApiKeyFileStore } from '../../credentials/encrypted-api-key-file-store'

const ProviderEntrySchema = z.object({
  apiKey: z.string(),
  updatedAt: z.number().nonnegative()
})

const SearchKeyMapSchema = z.object({
  tavily: ProviderEntrySchema.optional(),
  brave: ProviderEntrySchema.optional(),
  exa: ProviderEntrySchema.optional()
})

type SearchKeyMap = z.infer<typeof SearchKeyMapSchema>

const CONFIGURABLE_PROVIDERS: readonly ConfigurableSearchProvider[] = ['tavily', 'brave', 'exa']

const defaultStore = createEncryptedApiKeyFileStore({
  fileName: 'general-chat-search-keys.enc',
  envelopePrefix: 'orca-general-chat-search-keys:v1:',
  providerLabel: 'General Chat web search keys',
  logScope: 'general-chat-search'
})

export type SearchKeyBackingStore = {
  read: () => Promise<string | null>
  write: (value: string) => Promise<void>
  clear: () => Promise<void>
}

function buildProviderStatuses(map: SearchKeyMap): SearchProviderStatus[] {
  return [
    {
      provider: 'duckduckgo',
      configured: true,
      requiresKey: false,
      updatedAt: null
    },
    ...CONFIGURABLE_PROVIDERS.map((provider) => {
      const entry = map[provider]
      return {
        provider,
        configured: Boolean(entry?.apiKey),
        requiresKey: true,
        updatedAt: entry?.updatedAt ?? null
      }
    })
  ]
}

export class SearchProviderKeyStore {
  private lane: Promise<void> = Promise.resolve()

  constructor(
    private readonly store: SearchKeyBackingStore = {
      read: defaultStore.read,
      write: defaultStore.save,
      clear: defaultStore.clear
    }
  ) {}

  private async readMap(): Promise<SearchKeyMap> {
    const raw = await this.store.read()
    if (!raw) {
      return {}
    }
    try {
      return SearchKeyMapSchema.parse(JSON.parse(raw))
    } catch {
      return {}
    }
  }

  listStatuses(): Promise<SearchProviderStatus[]> {
    return this.lane.then(async () => buildProviderStatuses(await this.readMap()))
  }

  getApiKey(provider: ConfigurableSearchProvider): Promise<string | null> {
    return this.lane.then(async () => {
      const map = await this.readMap()
      const key = map[provider]?.apiKey.trim()
      return key ? key : null
    })
  }

  setApiKey(provider: ConfigurableSearchProvider, apiKey: string): Promise<SearchProviderStatus[]> {
    const trimmed = apiKey.trim()
    const next = this.lane.then(async () => {
      const map = await this.readMap()
      const updated: SearchKeyMap = { ...map }
      if (trimmed) {
        updated[provider] = { apiKey: trimmed, updatedAt: Date.now() }
      } else {
        delete updated[provider]
      }
      await (Object.keys(updated).length === 0
        ? this.store.clear()
        : this.store.write(JSON.stringify(updated)))
      return buildProviderStatuses(updated)
    })
    this.lane = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }
}

let sharedKeyStore: SearchProviderKeyStore | null = null

export function getSharedSearchProviderKeyStore(): SearchProviderKeyStore {
  sharedKeyStore ??= new SearchProviderKeyStore()
  return sharedKeyStore
}
