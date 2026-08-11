import { RefreshCw } from 'lucide-react'
import { Button } from '../components/ui/Button.js'

export function UpdatePrompt({
  open,
  onUpdate,
  onDismiss,
}: {
  open: boolean
  onUpdate: () => void
  onDismiss: () => void
}) {
  if (!open) return null
  return (
    <aside className="pwa-prompt" aria-live="polite" aria-atomic="true">
      <div>
        <strong>Versi baru siap</strong>
        <span>Pembaruan ditunda sampai Anda memilih muat ulang.</span>
      </div>
      <div className="pwa-prompt__actions">
        <Button size="small" variant="ghost" onClick={onDismiss}>Nanti</Button>
        <Button size="small" icon={<RefreshCw aria-hidden="true" />} onClick={onUpdate}>Muat ulang</Button>
      </div>
    </aside>
  )
}
