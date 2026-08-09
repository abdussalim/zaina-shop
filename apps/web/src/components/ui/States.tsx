import { PackageOpen } from 'lucide-react'
import type { ReactNode } from 'react'

export function LoadingState({ label = 'Memuat data' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <span className="loading-state__mark" aria-hidden="true" />
      <span>{label}…</span>
    </div>
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
