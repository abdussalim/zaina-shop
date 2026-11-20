import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { registerServiceWorker, requestServiceWorkerUpdate } from './register.js'
import { InstallPrompt } from './InstallPrompt.js'
import { UpdatePrompt } from './UpdatePrompt.js'

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
    if (waitingRegistration) {
      requestServiceWorkerUpdate(waitingRegistration)
    }
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
