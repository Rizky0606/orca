import { useCallback, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import type { VideoStudioProject } from '../../../src/shared/video-studio/video-studio-project'
import { BottomDrawer } from '../components/bottom-drawer/BottomDrawer'
import { BottomDrawerModalHost } from '../components/bottom-drawer/bottom-drawer-modal-host'
import { useBottomDrawerModalHostBackClaim } from '../components/bottom-drawer/bottom-drawer-modal-host-scope'
import { ListRow } from '../components/list/ListGroup'
import { SheetHeader } from '../components/nav-bar/SheetHeader'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { SettingsEmptyRow, SettingsNote, SettingsSection } from '../settings/settings-screen-frame'
import {
  mobileStructuredSessionHref,
  openMobileStructuredSession
} from '../session/native-chat/agent-session/open-mobile-structured-session'
import { listHostGeneralChats, listHostVideoProjects } from './host-feature-browse-operations'
import type { HostScreenController } from './use-host-screen-controller'

export type HostBrowseFeature = 'general-chat' | 'video-studio'

export function HostFeatureBrowseSheet(props: {
  controller: HostScreenController
  feature: HostBrowseFeature | null
  onClose: () => void
}) {
  return (
    <BottomDrawerModalHost>
      <BrowseDrawer {...props} />
    </BottomDrawerModalHost>
  )
}

function BrowseDrawer({
  controller,
  feature,
  onClose
}: {
  controller: HostScreenController
  feature: HostBrowseFeature | null
  onClose: () => void
}) {
  const t = useMobileTranslation()
  const { client, connState, hostId, actions, state } = controller
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [chats, setChats] = useState<Awaited<ReturnType<typeof listHostGeneralChats>> | null>(null)
  const [projects, setProjects] = useState<Awaited<
    ReturnType<typeof listHostVideoProjects>
  > | null>(null)
  const [selected, setSelected] = useState<VideoStudioProject | null>(null)
  const owner = useRef(0)
  useBottomDrawerModalHostBackClaim(selected ? () => setSelected(null) : null)

  useEffect(() => {
    const revision = ++owner.current
    setChats(null)
    setProjects(null)
    setSelected(null)
    setError(null)
    setOpening(false)
    if (!feature || !client || connState !== 'connected') {
      setLoading(false)
      return
    }
    const generation = client.getGeneration?.()
    const current = () =>
      owner.current === revision &&
      client.getState() === 'connected' &&
      client.getGeneration?.() === generation
    setLoading(true)
    const read =
      feature === 'general-chat'
        ? listHostGeneralChats(client, current).then((result) => {
            if (current()) {
              setChats(result)
            }
          })
        : listHostVideoProjects(client, current).then((result) => {
            if (current()) {
              setProjects(result)
            }
          })
    void read
      .catch(() => {
        if (current()) {
          setError(t('hostScreen.featureBrowse.loadError', 'Could not load this host. Try again.'))
        }
      })
      .finally(() => {
        if (current()) {
          setLoading(false)
        }
      })
    return () => {
      owner.current += 1
    }
  }, [attempt, client, connState, feature, hostId, t])

  const openChat = useCallback(
    async (tab: NonNullable<typeof chats>['tabs'][number]) => {
      if (!client || !chats || !hostId || opening) {
        return
      }
      const revision = owner.current
      const generation = client.getGeneration?.()
      const current = () =>
        owner.current === revision &&
        client.getState() === 'connected' &&
        client.getGeneration?.() === generation
      setOpening(true)
      setError(null)
      try {
        const result = await openMobileStructuredSession({
          client,
          source: {
            kind: 'notification',
            sessionId: tab.sessionId,
            worktreeId: chats.worktree,
            agent: tab.agent
          },
          current,
          inventory: { worktreeId: chats.worktree, tabs: chats.tabs }
        })
        if (!current()) {
          return
        }
        if (
          result.kind !== 'opened' ||
          result.target.worktreeId !== chats.worktree ||
          result.target.sessionId !== tab.sessionId
        ) {
          throw new Error('Chat unavailable')
        }
        onClose()
        actions.navigateFromHostList(mobileStructuredSessionHref(hostId, result.target, result.tab))
      } catch {
        if (current()) {
          setError(
            t('hostScreen.featureBrowse.openError', 'Could not open this conversation. Try again.')
          )
        }
      } finally {
        if (current()) {
          setOpening(false)
        }
      }
    },
    [actions, chats, client, hostId, onClose, opening, t]
  )

  const title =
    feature === 'general-chat'
      ? t('generalChat.title', 'General Chat')
      : t('videoStudio.title', 'Video Studio')
  return (
    <BottomDrawer
      visible={feature !== null}
      onClose={onClose}
      scrollResetKey={selected?.id ?? feature}
    >
      <View>
        <SheetHeader
          title={selected?.title ?? title}
          subtitle={state.hostName}
          onClose={onClose}
          {...(selected
            ? { onBack: { label: t('common.back', 'Back'), onPress: () => setSelected(null) } }
            : {})}
        />
        {loading ? <SettingsNote>{t('common.loading', 'Loading…')}</SettingsNote> : null}
        {error ? (
          <SettingsSection>
            <ListRow
              title={error}
              onPress={() => setAttempt((value) => value + 1)}
              value={t('common.retry', 'Retry')}
            />
          </SettingsSection>
        ) : null}
        {feature === 'general-chat' && chats ? (
          <>
            <SettingsSection>
              {chats.tabs.length ? (
                chats.tabs.map((tab) => (
                  <ListRow
                    key={tab.id}
                    title={tab.title}
                    disabled={opening}
                    onPress={() => void openChat(tab)}
                  />
                ))
              ) : (
                <SettingsEmptyRow>
                  {t('generalChat.noConversations', 'No conversations yet.')}
                </SettingsEmptyRow>
              )}
            </SettingsSection>
            {chats.researchJobs.length > 0 ? (
              <SettingsSection title={t('generalChat.researchJobs', 'Deep Research')}>
                {chats.researchJobs.slice(0, 6).map((job) => (
                  <ListRow
                    key={job.id}
                    title={job.topic}
                    subtitle={t('generalChat.researchSourcesCount', '{{count}} source(s)', {
                      count: job.sourcesCollected
                    })}
                    value={job.status}
                  />
                ))}
              </SettingsSection>
            ) : null}
          </>
        ) : null}
        {feature === 'video-studio' && projects ? (
          selected ? (
            <SettingsSection>
              <ListRow title={t('videoStudio.stage', 'Stage')} value={selected.workflowStage} />
              <ListRow
                title={t('videoStudio.aspectRatio', 'Aspect ratio')}
                value={selected.aspectRatio}
              />
              <ListRow
                title={t('videoStudio.duration', 'Duration')}
                value={`${selected.durationSeconds} s`}
              />
              <ListRow title={t('videoStudio.engine', 'Engine')} value={selected.engine} />
              <ListRow title={t('videoStudio.fps', 'FPS')} value={`${selected.fps} fps`} />
              <ListRow
                title={t('videoStudio.renders', 'Renders')}
                value={String(selected.renders.length)}
              />
              {selected.prompt ? (
                <ListRow title={t('videoStudio.prompt', 'Prompt')} subtitle={selected.prompt} />
              ) : null}
            </SettingsSection>
          ) : (
            <SettingsSection>
              {projects.projects.length ? (
                projects.projects.map((project) => (
                  <ListRow
                    key={project.id}
                    title={project.title}
                    subtitle={project.workflowStage}
                    onPress={() => setSelected(project)}
                  />
                ))
              ) : (
                <SettingsEmptyRow>
                  {t('videoStudio.noProjects', 'No projects yet.')}
                </SettingsEmptyRow>
              )}
            </SettingsSection>
          )
        ) : null}
        {projects?.invalidRecords ? (
          <SettingsNote alert>
            {t('videoStudio.invalidRecords', 'Some projects could not be displayed.')}
          </SettingsNote>
        ) : null}
      </View>
    </BottomDrawer>
  )
}
