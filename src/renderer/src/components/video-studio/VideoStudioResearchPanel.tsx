import { ExternalLink, FileText, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useTranslate } from '@/i18n/use-translate'
import type { VideoStudioInspectorController } from './video-studio-inspector-types'

export function VideoStudioResearchPanel({
  projectId,
  inspector
}: {
  projectId: string
  inspector: VideoStudioInspectorController
}) {
  const t = useTranslate()
  const docs = inspector.documents
  const frontmatter = docs?.briefFrontmatter ?? {}
  const [audience, setAudience] = useState(
    typeof frontmatter.audience === 'string' ? frontmatter.audience : ''
  )
  const [message, setMessage] = useState(
    typeof frontmatter.message === 'string' ? frontmatter.message : ''
  )
  const [briefBody, setBriefBody] = useState(docs?.briefMarkdown ?? '')
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceTitle, setSourceTitle] = useState('')
  const [verificationStatus, setVerificationStatus] = useState<
    'verified' | 'unverified' | 'assumed'
  >('verified')

  const busy = inspector.busyAction !== null
  const sources = docs?.researchSources ?? []

  function handleSaveBrief(event: FormEvent) {
    event.preventDefault()
    void inspector.updateBrief({
      frontmatter: {
        ...(audience.trim() ? { audience: audience.trim() } : {}),
        ...(message.trim() ? { message: message.trim() } : {})
      },
      briefMarkdown: briefBody
    })
  }

  function handleAddSource(event: FormEvent) {
    event.preventDefault()
    if (!sourceUrl.trim() || !sourceTitle.trim()) {
      return
    }
    void inspector
      .upsertSource({
        url: sourceUrl.trim(),
        title: sourceTitle.trim(),
        verificationStatus
      })
      .then((ok) => {
        if (ok) {
          setSourceUrl('')
          setSourceTitle('')
        }
      })
  }

  return (
    <section
      key={`${projectId}:${docs?.revisions['BRIEF.md'] ?? ''}`}
      className="grid min-w-0 gap-5 rounded-md border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText aria-hidden="true" className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            {t('videoStudio.researchBriefTitle', 'Research & creative brief')}
          </h3>
        </div>
        <Badge variant="outline">
          {t('videoStudio.sourcesCount', '{{count}} source(s)', { count: sources.length })}
        </Badge>
      </div>

      {inspector.error ? (
        <p role="alert" className="text-xs text-destructive wrap-anywhere">
          {inspector.error}
        </p>
      ) : null}

      <form onSubmit={handleSaveBrief} className="grid min-w-0 gap-3">
        <div className="grid min-w-0 gap-3 @sm:grid-cols-2">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={`brief-audience-${projectId}`}>
              {t('videoStudio.briefAudience', 'Target audience')}
            </Label>
            <Input
              id={`brief-audience-${projectId}`}
              className="min-h-11 @lg:min-h-9"
              value={audience}
              disabled={busy}
              onChange={(e) => setAudience(e.currentTarget.value)}
            />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={`brief-message-${projectId}`}>
              {t('videoStudio.briefMessage', 'Core takeaway')}
            </Label>
            <Input
              id={`brief-message-${projectId}`}
              className="min-h-11 @lg:min-h-9"
              value={message}
              disabled={busy}
              onChange={(e) => setMessage(e.currentTarget.value)}
            />
          </div>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`brief-markdown-${projectId}`}>
            {t('videoStudio.briefMarkdown', 'BRIEF.md')}
          </Label>
          <Textarea
            id={`brief-markdown-${projectId}`}
            rows={5}
            className="font-mono text-xs"
            value={briefBody}
            disabled={busy}
            onChange={(e) => setBriefBody(e.currentTarget.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={busy} className="min-h-11 @lg:min-h-8">
            {t('videoStudio.saveBrief', 'Save brief')}
          </Button>
        </div>
      </form>

      <div className="grid min-w-0 gap-3 border-t border-border pt-4">
        <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {t('videoStudio.verifiedSources', 'Sources & references')}
        </h4>
        {sources.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t(
              'videoStudio.noResearchSources',
              'No research sources recorded yet. Add citations below or hand off from General Chat research.'
            )}
          </p>
        ) : (
          <ul className="grid min-w-0 gap-2">
            {sources.map((src) => (
              <li
                key={src.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded border border-border bg-background p-2.5 text-xs"
              >
                <div className="grid min-w-0 flex-1 gap-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium wrap-anywhere">{src.title}</span>
                    <Badge
                      variant={
                        src.verificationStatus === 'verified'
                          ? 'secondary'
                          : src.verificationStatus === 'unverified'
                            ? 'warning'
                            : 'outline'
                      }
                    >
                      {src.verificationStatus}
                    </Badge>
                    <Badge variant="outline">{src.origin}</Badge>
                  </div>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:underline wrap-anywhere"
                  >
                    <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
                    {src.url}
                  </a>
                  {src.snippet ? (
                    <p className="line-clamp-2 text-muted-foreground wrap-anywhere">
                      {src.snippet}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={t('videoStudio.deleteSource', 'Delete source')}
                  className="min-h-11 @lg:min-h-8"
                  onClick={() => void inspector.deleteSource(src.id)}
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAddSource} className="grid min-w-0 gap-2 pt-1 @sm:grid-cols-12">
          <Input
            aria-label={t('videoStudio.sourceTitleLabel', 'Source title')}
            placeholder={t('videoStudio.sourceTitlePlaceholder', 'Source title')}
            className="min-h-11 @sm:col-span-4 @lg:min-h-9"
            value={sourceTitle}
            disabled={busy}
            onChange={(e) => setSourceTitle(e.currentTarget.value)}
          />
          <Input
            aria-label={t('videoStudio.sourceUrlLabel', 'Source URL')}
            placeholder="https://..."
            type="url"
            className="min-h-11 @sm:col-span-4 @lg:min-h-9"
            value={sourceUrl}
            disabled={busy}
            onChange={(e) => setSourceUrl(e.currentTarget.value)}
          />
          <Select
            value={verificationStatus}
            disabled={busy}
            onValueChange={(v) => {
              if (v === 'verified' || v === 'unverified' || v === 'assumed') {
                setVerificationStatus(v)
              }
            }}
          >
            <SelectTrigger className="min-h-11 @sm:col-span-2 @lg:min-h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="verified">verified</SelectItem>
              <SelectItem value="unverified">unverified</SelectItem>
              <SelectItem value="assumed">assumed</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={busy || !sourceUrl.trim() || !sourceTitle.trim()}
            className="min-h-11 @sm:col-span-2 @lg:min-h-9"
          >
            <Plus aria-hidden="true" className="size-3.5" />
            {t('videoStudio.addSource', 'Add')}
          </Button>
        </form>
      </div>
    </section>
  )
}
