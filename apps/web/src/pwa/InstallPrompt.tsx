import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button.js'

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const INSTALL_DISMISSED_KEY = 'zaina_pwa_install_dismissed_until'
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000

function isInstallDismissed(): boolean {
  try {
    const raw = window.localStorage.getItem(INSTALL_DISMISSED_KEY)
    if (!raw) return false
    const until = Number(raw)
    return Number.isFinite(until) && until > Date.now()
  } catch {
    return false
  }
}

export function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      if (isInstallDismissed()) return
      setInstallEvent(event as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])
  if (!installEvent) return null

  function handleDismiss() {
    try {
      window.localStorage.setItem(
        INSTALL_DISMISSED_KEY,
        String(Date.now() + DISMISS_DURATION_MS),
      )
    } catch {
      // Ignore storage failures
    }
    setInstallEvent(null)
  }

  return (
    <aside className="pwa-prompt pwa-prompt--inline" aria-live="polite" aria-atomic="true">
      <div className="pwa-prompt__copy">
        <strong>Pasang Toko Zaina</strong>
        <span>Akses katalog lebih cepat dari layar utama.</span>
      </div>
      <div className="pwa-prompt__actions">
        <Button
          size="small"
          variant="ghost"
          onClick={handleDismiss}
          aria-label="Tutup saran pemasangan"
        >
          Nanti
        </Button>
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
      </div>
    </aside>
  )
}
