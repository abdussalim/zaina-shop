import { AlertCircle, CloudOff, PackageOpen } from 'lucide-react'
import type { ReactNode } from 'react'

export function LoadingState({ label = 'Memuat data' }: { label?: string }) {
  return (
    <output className="loading-state">
      <span className="loading-state__mark" aria-hidden="true" />
      <span>{label}…</span>
    </output>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <PackageOpen aria-hidden="true" />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  )
}

export function ErrorState({
  title = 'Data belum dapat dimuat',
  description = 'Periksa koneksi lalu coba lagi.',
  action,
}: {
  title?: string
  description?: string
  action?: ReactNode
}) {
  return <div className="error-state" role="alert"><AlertCircle aria-hidden="true" /><strong>{title}</strong><p>{description}</p>{action}</div>
}

export function OfflineState({
  title = 'Koneksi diperlukan',
  description = 'Data ini tidak disimpan untuk dibaca offline.',
}: {
  title?: string
  description?: string
}) {
  return <div className="offline-state" role="status"><CloudOff aria-hidden="true" /><strong>{title}</strong><p>{description}</p></div>
}
