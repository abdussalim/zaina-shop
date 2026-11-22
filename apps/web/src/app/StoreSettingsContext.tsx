import { createContext, useContext, type ReactNode } from 'react'

import type { StoreSettings } from '../api/types.js'

export const defaultStoreSettings: StoreSettings = {
  storeName: 'Toko Zaina',
  address: 'Jl. Patih Rumbih No. 35, Selat Tengah, Kec. Selat, Kabupaten Kapuas, Kalimantan Tengah 73516',
  phone: '088744982845',
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
