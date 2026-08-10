import { createContext, useContext, type ReactNode } from 'react'

import type { StoreSettings } from '../api/types.js'

export const defaultStoreSettings: StoreSettings = {
  storeName: 'Toko Zaina',
  address: null,
  phone: null,
  timezone: 'Asia/Jakarta',
  defaultMinimumStock: 5,
}

const StoreSettingsContext = createContext<StoreSettings>(defaultStoreSettings)

export function StoreSettingsProvider({
  settings,
  children,
}: {
  settings: StoreSettings
  children: ReactNode
}) {
  return (
    <StoreSettingsContext.Provider value={settings}>
      {children}
    </StoreSettingsContext.Provider>
  )
}

export function useStoreSettings() {
  return useContext(StoreSettingsContext)
}
