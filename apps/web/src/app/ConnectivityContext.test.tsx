import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ConnectivityController, ConnectivityStatus } from '../pwa/connectivity.js'
import type { InventorySnapshot, SnapshotStore } from '../pwa/types.js'
import { ConnectivityProvider, useConnectivity } from './ConnectivityContext.js'

function Harness() {
  const { status, canWrite, lastSnapshotAt, clearSnapshot } = useConnectivity()
  return <button onClick={() => void clearSnapshot()}>{status}:{canWrite ? 'write' : 'read'}:{lastSnapshotAt ?? 'none'}</button>
}

function controller(initial: ConnectivityStatus): ConnectivityController {
  const listeners = new Set<(status: ConnectivityStatus) => void>()
  return {
    getStatus: () => initial,
    getLastCheckedAt: () => null,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    refresh: async () => true,
    dispose: () => listeners.clear(),
  }
}

function store(): SnapshotStore {
  const snapshot: InventorySnapshot = { version: 1, storeKey: 'store-a', updatedAt: '2026-08-11T00:00:00.000Z', products: [] }
  return {
    read: async () => snapshot,
    write: async () => undefined,
    clear: async () => undefined,
    clearAll: async () => undefined,
  }
}

describe('ConnectivityProvider', () => {
  it('exposes offline read-only state and snapshot timestamp', async () => {
    render(
      <ConnectivityProvider storeKey="store-a" controller={controller('offline')} snapshotStore={store()}>
        <Harness />
      </ConnectivityProvider>,
    )
    expect(await screen.findByRole('button')).toHaveTextContent('offline:read:2026-08-11')
  })
})
