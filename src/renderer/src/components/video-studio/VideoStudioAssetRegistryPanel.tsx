import { AlertTriangle, BookmarkPlus, Layers, PackagePlus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useTranslate } from '@/i18n/use-translate'
import type { VideoStudioInspectorController } from './video-studio-inspector-types'

export function VideoStudioAssetRegistryPanel({
  inspector
}: {
  inspector: VideoStudioInspectorController
}) {
  const t = useTranslate()
  const projectAssets = inspector.projectAssets
  const assets = projectAssets?.assets ?? []
  const warnings = projectAssets?.warnings ?? []
  const invariantErrors = projectAssets?.invariantErrors ?? {}
  const libraryAssets = inspector.libraryAssets

  const [newAssetId, setNewAssetId] = useState('')
  const [newAssetName, setNewAssetName] = useState('')
  const [newAssetState, setNewAssetState] = useState('default')
  const [newSvg, setNewSvg] = useState(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="80" height="80" x="10" y="10" /></svg>'
  )
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [selectedStates, setSelectedStates] = useState<Record<string, string>>({})
  const busy = inspector.busyAction !== null

  function handleRegister(event: FormEvent) {
    event.preventDefault()
    if (!newAssetId.trim() || !newAssetName.trim() || !newSvg.trim()) {
      return
    }
    void inspector
      .registerAsset({
        id: newAssetId.trim(),
        name: newAssetName.trim(),
        defaultState: newAssetState.trim() || 'default',
        svgContent: newSvg
      })
      .then((ok) => {
        if (ok) {
          setNewAssetId('')
          setNewAssetName('')
        }
      })
  }

  return (
    <section className="grid min-w-0 gap-4 rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers aria-hidden="true" className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            {t('videoStudio.masterAssetRegistry', 'Master Asset Registry')}
          </h3>
        </div>
        <Badge variant="outline">
          {t('videoStudio.projectAssetsCount', '{{count}} asset(s)', { count: assets.length })}
        </Badge>
      </div>

      {warnings.length > 0 ? (
        <div
          role="status"
          className="grid gap-1 rounded border border-status-warning-border bg-status-warning-background p-3 text-xs text-status-warning-text"
        >
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
            {t(
              'videoStudio.dynamicAssetWarningsTitle',
              'Dynamic script references detected — unused asset files will not be deleted automatically'
            )}
          </p>
          {warnings.map((w) => (
            <p key={`${w.file}:${w.reason}`} className="font-mono wrap-anywhere">
              {w.file}: {w.reason}
              {w.expression ? ` (${w.expression})` : ''}
            </p>
          ))}
        </div>
      ) : null}

      {Object.keys(invariantErrors).length > 0 ? (
        <div
          role="alert"
          className="grid gap-1 rounded border border-destructive/40 p-2.5 text-xs text-destructive"
        >
          {Object.entries(invariantErrors).map(([assetId, errs]) => (
            <p key={assetId} className="wrap-anywhere">
              {assetId}: {errs.join('; ')}
            </p>
          ))}
        </div>
      ) : null}

      {assets.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t(
            'videoStudio.noProjectAssets',
            'No master assets registered in this project yet. Apply a reusable Host Library asset or register an inline SVG object below.'
          )}
        </p>
      ) : (
        <ul className="grid min-w-0 gap-2">
          {assets.map((asset) => {
            const stateKeys = Object.keys(asset.states)
            const activeState = selectedStates[asset.id] ?? asset.defaultState
            const confirming = confirmRemoveId === asset.id
            return (
              <li
                key={asset.id}
                className="grid min-w-0 gap-2 rounded border border-border bg-background p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">{asset.name}</span>
                    <span className="font-mono text-muted-foreground">{asset.id}</span>
                    <Badge variant="outline">
                      {asset.type} · {asset.format}
                    </Badge>
                    <Badge variant="secondary">v{asset.version}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      className="min-h-11 @lg:min-h-8"
                      onClick={() => void inspector.saveAssetToLibrary(asset.id)}
                    >
                      <BookmarkPlus aria-hidden="true" className="size-3.5" />
                      {t('videoStudio.saveToLibrary', 'Save to library')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      className="min-h-11 @lg:min-h-8"
                      onClick={() => setConfirmRemoveId(confirming ? null : asset.id)}
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" />
                      {t('videoStudio.removeAsset', 'Remove')}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground">
                    {t('videoStudio.assetStatesLabel', 'States:')}
                  </span>
                  {stateKeys.map((stateKey) => (
                    <Button
                      key={stateKey}
                      type="button"
                      size="sm"
                      variant={activeState === stateKey ? 'secondary' : 'outline'}
                      className="h-6 px-2 text-2xs"
                      onClick={() =>
                        setSelectedStates((prev) => ({ ...prev, [asset.id]: stateKey }))
                      }
                    >
                      {stateKey}
                      {stateKey === asset.defaultState ? ' ★' : ''}
                    </Button>
                  ))}
                  {asset.components.length > 0 ? (
                    <Badge variant="outline">
                      {t('videoStudio.componentsCount', '{{count}} component(s)', {
                        count: asset.components.length
                      })}
                    </Badge>
                  ) : null}
                  {asset.consistency.lockGeometry ? (
                    <Badge variant="referenceLabel">locked geometry</Badge>
                  ) : null}
                </div>

                {asset.states[activeState]?.file ? (
                  <p className="font-mono text-muted-foreground wrap-anywhere">
                    {asset.states[activeState].file}
                  </p>
                ) : null}

                {confirming ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      className="min-h-11 @lg:min-h-8"
                      onClick={() => {
                        setConfirmRemoveId(null)
                        void inspector.removeProjectAsset(asset.id, {
                          force: true,
                          forceDeleteFiles: false
                        })
                      }}
                    >
                      {t('videoStudio.detachKeepFiles', 'Detach (keep files on disk)')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      className="min-h-11 @lg:min-h-8"
                      onClick={() => {
                        setConfirmRemoveId(null)
                        void inspector.removeProjectAsset(asset.id, {
                          force: true,
                          forceDeleteFiles: true
                        })
                      }}
                    >
                      {t('videoStudio.forceDeleteFiles', 'Force remove & delete exclusive files')}
                    </Button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {libraryAssets.length > 0 ? (
        <div className="grid gap-2 border-t border-border pt-3">
          <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {t('videoStudio.hostAssetLibraryHeading', 'Host Asset Library')}
          </h4>
          <div className="flex flex-wrap gap-2">
            {libraryAssets.map((item) => (
              <Button
                key={`${item.id}:${item.version}`}
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                className="min-h-11 @lg:min-h-8"
                onClick={() => void inspector.applyLibraryAsset(item.id, item.version)}
              >
                <PackagePlus aria-hidden="true" className="size-3.5" />
                {item.name} (v{item.version})
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <form onSubmit={handleRegister} className="grid min-w-0 gap-2 border-t border-border pt-3">
        <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {t('videoStudio.registerInlineAsset', 'Register inline SVG asset')}
        </h4>
        <div className="grid min-w-0 gap-2 @sm:grid-cols-3">
          <Input
            aria-label={t('videoStudio.assetIdLabel', 'Asset ID')}
            placeholder="ac_indoor_001"
            className="min-h-11 @lg:min-h-9"
            value={newAssetId}
            disabled={busy}
            onChange={(e) => setNewAssetId(e.currentTarget.value)}
          />
          <Input
            aria-label={t('videoStudio.assetNameLabel', 'Asset name')}
            placeholder={t('videoStudio.assetNamePlaceholder', 'Indoor AC Unit')}
            className="min-h-11 @lg:min-h-9"
            value={newAssetName}
            disabled={busy}
            onChange={(e) => setNewAssetName(e.currentTarget.value)}
          />
          <Input
            aria-label={t('videoStudio.defaultStateLabel', 'Default state')}
            placeholder="closed"
            className="min-h-11 @lg:min-h-9"
            value={newAssetState}
            disabled={busy}
            onChange={(e) => setNewAssetState(e.currentTarget.value)}
          />
        </div>
        <Textarea
          rows={2}
          className="font-mono text-xs"
          aria-label={t('videoStudio.assetSvgLabel', 'SVG markup')}
          value={newSvg}
          disabled={busy}
          onChange={(e) => setNewSvg(e.currentTarget.value)}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={busy || !newAssetId.trim() || !newAssetName.trim()}
            className="min-h-11 @lg:min-h-8"
          >
            {t('videoStudio.registerAssetButton', 'Register asset')}
          </Button>
        </div>
      </form>
    </section>
  )
}
