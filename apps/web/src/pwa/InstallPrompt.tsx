import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button.js'

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])
  if (!installEvent) return null
  return (
    <aside className="pwa-prompt" role="status" aria-live="polite">
      <div>
        <strong>Pasang Toko Zaina</strong>
        <span>Buka inventaris lebih cepat dari layar utama.</span>
      </div>
      <Button
        size="small"
        variant="secondary"
        icon={<Download aria-hidden="true" />}
        onClick={async () => {
          await installEvent.prompt()
          await installEvent.userChoice
          setInstallEvent(null)
        }}
      >
        Pasang
      </Button>
    </aside>
  )
}
