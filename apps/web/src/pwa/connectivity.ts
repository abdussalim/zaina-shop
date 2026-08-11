export type ConnectivityStatus = 'online' | 'offline' | 'checking'

export interface ConnectivityEventTarget {
  navigator?: { onLine?: boolean }
  addEventListener(type: 'online' | 'offline', listener: () => void): void
  removeEventListener(type: 'online' | 'offline', listener: () => void): void
}

export interface ConnectivityController {
  getStatus(): ConnectivityStatus
  getLastCheckedAt(): string | null
  subscribe(listener: (status: ConnectivityStatus) => void): () => void
  refresh(): Promise<boolean>
  dispose(): void
}

export function createConnectivityController(
  target: ConnectivityEventTarget = window,
  probe: () => Promise<boolean> = async () => {
    const response = await fetch('/api/v1/health', { credentials: 'include' })
    return response.ok
  },
): ConnectivityController {
  let status: ConnectivityStatus = target.navigator?.onLine === false ? 'offline' : 'online'
  let lastCheckedAt: string | null = null
  const listeners = new Set<(next: ConnectivityStatus) => void>()
  const emit = (next: ConnectivityStatus) => {
    status = next
    for (const listener of listeners) listener(status)
  }
  const onOffline = () => emit('offline')
  const onOnline = () => void controller.refresh()
  const controller: ConnectivityController = {
    getStatus: () => status,
    getLastCheckedAt: () => lastCheckedAt,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async refresh() {
      emit('checking')
      try {
        const reachable = await probe()
        lastCheckedAt = new Date().toISOString()
        emit(reachable ? 'online' : 'offline')
        return reachable
      } catch {
        lastCheckedAt = new Date().toISOString()
        emit('offline')
        return false
      }
    },
    dispose() {
      target.removeEventListener('online', onOnline)
      target.removeEventListener('offline', onOffline)
      listeners.clear()
    },
  }
  target.addEventListener('online', onOnline)
  target.addEventListener('offline', onOffline)
  return controller
}
