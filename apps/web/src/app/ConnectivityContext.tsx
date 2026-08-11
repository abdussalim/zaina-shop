import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createConnectivityController, type ConnectivityController, type ConnectivityStatus } from '../pwa/connectivity.js'
import { createIndexedDbSnapshotStore } from '../pwa/snapshotStore.js'
import type { InventorySnapshot, SnapshotStore } from '../pwa/types.js'

export interface ConnectivityContextValue {
  status: ConnectivityStatus
  isOffline: boolean
  canWrite: boolean
  lastSnapshotAt: string | null
  refreshSnapshot: () => Promise<void>
  clearSnapshot: () => Promise<void>
  snapshotStore: SnapshotStore | null
  readSnapshot: () => Promise<InventorySnapshot | null>
  writeSnapshot: (snapshot: InventorySnapshot) => Promise<void>
}

const ConnectivityContext = createContext<ConnectivityContextValue | null>(null)

export function ConnectivityProvider({
  storeKey,
  children,
  snapshotStore,
  controller,
}: {
  storeKey: string
  children: ReactNode
  snapshotStore?: SnapshotStore
  controller?: ConnectivityController
}) {
  const store = useMemo(
    () => snapshotStore ?? (typeof indexedDB === 'undefined' ? null : createIndexedDbSnapshotStore()),
    [snapshotStore],
  )
  const connectivity = useMemo(() => controller ?? createConnectivityController(), [controller])
  const [status, setStatus] = useState<ConnectivityStatus>(connectivity.getStatus())
  const [lastSnapshotAt, setLastSnapshotAt] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = connectivity.subscribe(setStatus)
    let active = true
    if (store) {
      void store.read(storeKey).then((snapshot) => {
        if (active) setLastSnapshotAt(snapshot?.updatedAt ?? null)
      })
    }
    return () => {
      active = false
      unsubscribe()
      if (!controller) connectivity.dispose()
    }
  }, [connectivity, controller, store, storeKey])

  const readSnapshot = useCallback(
    async () => {
      const snapshot = store ? await store.read(storeKey) : null
      setLastSnapshotAt(snapshot?.updatedAt ?? null)
      return snapshot
    },
    [store, storeKey],
  )
  const writeSnapshot = useCallback(
    async (snapshot: InventorySnapshot) => {
      if (!store) return
      await store.write(snapshot)
      setLastSnapshotAt(snapshot.updatedAt)
    },
    [store],
  )
  const refreshSnapshot = useCallback(async () => {
    await connectivity.refresh()
    await readSnapshot()
  }, [connectivity, readSnapshot])
  const clearSnapshot = useCallback(async () => {
    if (!store) return
    await store.clear(storeKey)
    setLastSnapshotAt(null)
  }, [store, storeKey])

  const value = useMemo<ConnectivityContextValue>(
    () => ({
      status,
      isOffline: status === 'offline',
      canWrite: status === 'online',
      lastSnapshotAt,
      refreshSnapshot,
      clearSnapshot,
      snapshotStore: store,
      readSnapshot,
      writeSnapshot,
    }),
    [clearSnapshot, lastSnapshotAt, readSnapshot, refreshSnapshot, status, store, writeSnapshot],
  )
  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>
}

export function useConnectivity() {
  const value = useContext(ConnectivityContext)
  if (!value) throw new Error('useConnectivity harus dipakai di dalam ConnectivityProvider')
  return value
}
