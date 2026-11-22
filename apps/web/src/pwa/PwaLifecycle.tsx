import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { registerServiceWorker, requestServiceWorkerUpdate } from './register.js'
import { InstallPrompt } from './InstallPrompt.js'
import { UpdatePrompt } from './UpdatePrompt.js'

const UPDATE_RELOAD_FALLBACK_MS = 1500

export function PwaLifecycle() {
  const [waitingRegistration, setWaitingRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)

  useEffect(() => {
    void registerServiceWorker({
      onNeedRefresh: (registration) => {
        setWaitingRegistration(registration)
        setUpdateDismissed(false)
      },
      onOfflineReady: () => {
        toast.success('Aplikasi siap digunakan secara offline!')
      },
    })
  }, [])

  const handleUpdate = () => {
    if (!waitingRegistration) {
      window.location.reload()
      return
    }

    let reloaded = false
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined
    const serviceWorker = 'serviceWorker' in navigator ? navigator.serviceWorker : undefined

    const triggerReload = () => {
      if (reloaded) return
      reloaded = true
      if (fallbackTimer !== undefined) clearTimeout(fallbackTimer)
      serviceWorker?.removeEventListener('controllerchange', triggerReload)
      window.location.reload()
    }

    if (serviceWorker && typeof serviceWorker.addEventListener === 'function') {
      serviceWorker.addEventListener('controllerchange', triggerReload, { once: true })
      fallbackTimer = setTimeout(triggerReload, UPDATE_RELOAD_FALLBACK_MS)
      requestServiceWorkerUpdate(waitingRegistration)
      return
    }

    requestServiceWorkerUpdate(waitingRegistration)
    window.location.reload()
  }

  return (
    <>
      <InstallPrompt />
      <UpdatePrompt
        open={Boolean(waitingRegistration) && !updateDismissed}
        onUpdate={handleUpdate}
        onDismiss={() => setUpdateDismissed(true)}
      />
    </>
  )
}
