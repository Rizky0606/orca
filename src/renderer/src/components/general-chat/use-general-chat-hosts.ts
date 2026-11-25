import { useEffect } from 'react'
import {
  useConfiguredFeatureHosts,
  type ConfiguredFeatureHost
} from '@/runtime/hosts/catalog/use-configured-feature-hosts'
import { useGeneralChatSelection } from './general-chat-selection-store'

export type GeneralChatHost = ConfiguredFeatureHost

export function useGeneralChatHosts() {
  const savedHostId = useGeneralChatSelection((state) => state.hostId)
  const selectHost = useGeneralChatSelection((state) => state.selectHost)
  const catalog = useConfiguredFeatureHosts(savedHostId)
  const hostId = catalog.selectedHost?.id
  useEffect(() => {
    if (hostId && useGeneralChatSelection.getState().hostId === null) {
      selectHost(hostId)
    }
  }, [hostId, selectHost])
  return { ...catalog, selectHost }
}
