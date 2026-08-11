import { CloudOff, RefreshCw } from 'lucide-react'
import { Button } from '../components/ui/Button.js'
import { useConnectivity } from './ConnectivityContext.js'

export function OfflineBanner() {
  const { isOffline, status, lastSnapshotAt, refreshSnapshot } = useConnectivity()
  if (!isOffline && status !== 'checking') return null
  return (
    <div className="offline-banner" aria-live="polite" aria-atomic="true">
      <CloudOff aria-hidden="true" />
      <span>
        {status === 'checking' ? 'Memeriksa koneksi…' : 'Offline. Katalog dan stok memakai snapshot terakhir.'}
        {lastSnapshotAt ? ` Terakhir diperbarui ${new Date(lastSnapshotAt).toLocaleString('id-ID')}.` : ''}
      </span>
      {status === 'offline' ? <Button size="small" variant="ghost" icon={<RefreshCw aria-hidden="true" />} onClick={() => void refreshSnapshot()}>Coba lagi</Button> : null}
    </div>
  )
}
