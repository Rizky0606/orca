import { useTranslate } from '@/i18n/use-translate'

export default function GeneralChatPage(): React.JSX.Element {
  const t = useTranslate()
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-lg font-semibold">{t('generalChat.title', 'General Chat')}</h1>
      <p className="text-sm text-muted-foreground">
        {t('generalChat.emptyDescription', 'Conversations here are independent of your projects.')}
      </p>
    </section>
  )
}
