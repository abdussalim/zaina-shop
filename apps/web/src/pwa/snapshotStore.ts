import { isInventorySnapshot } from './snapshotPolicy.js'
import type { SnapshotStore } from './types.js'

const DEFAULT_DB_NAME = 'zaina-offline-v1'
const STORE_NAME = 'inventory-snapshots'

function openDatabase(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'storeKey' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB tidak tersedia'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Transaksi IndexedDB gagal'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaksi IndexedDB dibatalkan'))
  })
}

export function createIndexedDbSnapshotStore(dbName = DEFAULT_DB_NAME): SnapshotStore {
  let databasePromise: Promise<IDBDatabase> | undefined
  const database = () => {
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB tidak tersedia'))
    databasePromise ??= openDatabase(dbName)
    return databasePromise
  }
  return {
    async read(storeKey) {
      const db = await database()
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const request = transaction.objectStore(STORE_NAME).get(storeKey)
      const value = await new Promise<unknown>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Snapshot tidak dapat dibaca'))
      })
      await transactionDone(transaction)
      if (!isInventorySnapshot(value)) {
        if (value !== undefined) await this.clear(storeKey)
        return null
      }
      return value
    },
    async write(snapshot) {
      if (!isInventorySnapshot(snapshot)) throw new TypeError('Snapshot tidak valid')
      const db = await database()
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(snapshot)
      await transactionDone(transaction)
    },
    async clear(storeKey) {
      const db = await database()
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).delete(storeKey)
      await transactionDone(transaction)
    },
    async clearAll() {
      const db = await database()
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).clear()
      await transactionDone(transaction)
    },
  }
}
