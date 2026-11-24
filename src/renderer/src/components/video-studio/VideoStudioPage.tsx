import { useTranslate } from '@/i18n/use-translate'

export default function VideoStudioPage(): React.JSX.Element {
  const t = useTranslate()
  return (
    <section className="flex flex-1 items-center justify-center p-6 text-center">
      <h1 className="text-lg font-semibold">{t('videoStudio.title', 'Video Studio')}</h1>
    </section>
  )
}
