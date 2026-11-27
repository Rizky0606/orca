import { VideoStudioAssetStore } from './assets/video-studio-asset-store'
import { VideoStudioProjectDocumentsStore } from './documents/video-studio-project-documents'
import { VideoStudioStyleStore } from './style/video-studio-style-store'
import { VideoStudioFileWatcher } from './video-studio-file-watcher'
import { VideoStudioLockCoordinator } from './video-studio-locks'
import { VideoStudioPreviewManager, type PreviewOsControl } from './video-studio-preview-manager'
import { VideoStudioTransactionCoordinator } from './video-studio-transactions'
import { VideoStudioTrustStore } from './video-studio-trust-store'

export type VideoStudioHostServices = {
  locks: VideoStudioLockCoordinator
  watcher: VideoStudioFileWatcher
  tx: VideoStudioTransactionCoordinator
  trustStore: VideoStudioTrustStore
  previewManager: VideoStudioPreviewManager
  styleStore: VideoStudioStyleStore
  documents: VideoStudioProjectDocumentsStore
  assets: VideoStudioAssetStore
}

export function createVideoStudioHostServices(
  profileDir: string,
  options: { previewOsControl?: PreviewOsControl; watcherDebounceMs?: number } = {}
): VideoStudioHostServices {
  const locks = new VideoStudioLockCoordinator()
  const watcher = new VideoStudioFileWatcher({ debounceMs: options.watcherDebounceMs })
  const tx = new VideoStudioTransactionCoordinator(locks, {
    onBeforeCommit: ({ projectDir, projectId }) => watcher.beginWrite(projectDir, projectId),
    onAfterCommit: ({ projectDir, projectId, revisions, succeeded }) =>
      watcher.endWrite(projectDir, projectId, revisions, succeeded)
  })
  const trustStore = new VideoStudioTrustStore(profileDir)
  const previewManager = new VideoStudioPreviewManager(profileDir, {
    osControl: options.previewOsControl
  })
  const styleStore = new VideoStudioStyleStore(profileDir, locks, tx)
  const documents = new VideoStudioProjectDocumentsStore(profileDir, locks, tx, trustStore)
  const assets = new VideoStudioAssetStore(profileDir, locks, tx)
  return { locks, watcher, tx, trustStore, previewManager, styleStore, documents, assets }
}
