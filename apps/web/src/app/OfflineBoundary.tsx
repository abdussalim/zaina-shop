import { CloudOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { useConnectivity } from './ConnectivityContext.js'

export function OfflineBoundary({ allowOffline, children }: { allowOffline: boolean; children: ReactNode }) {
  const { isOffline, lastSnapshotAt } = useConnectivity()
  if (!isOffline || allowOffline) return <>{children}</>
  return (
    <section className="offline-state" role="status" aria-live="polite">
      <CloudOff aria-hidden="true" />
      <strong>Koneksi diperlukan</strong>
      <p>Halaman ini tidak menyimpan data bisnis offline. Sambungkan perangkat untuk melanjutkan.</p>
      {lastSnapshotAt ? <small>Snapshot katalog/stok terakhir: {new Date(lastSnapshotAt).toLocaleString('id-ID')}</small> : null}
    </section>
  )
}
