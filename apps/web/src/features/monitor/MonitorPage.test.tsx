import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MonitorSnapshot } from '@zaina/shared'
import { Toaster } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as apiClient from '../../api/client.js'
import { ConnectivityProvider } from '../../app/ConnectivityContext.js'
import type { ConnectivityController } from '../../pwa/connectivity.js'
import { MonitorPage } from './MonitorPage.js'

function createSnapshot(overrides: Partial<MonitorSnapshot> = {}): MonitorSnapshot {
  return {
    opMode: 'watch',
    doorClosed: false,
    cam1Active: true,
    cam2Active: true,
    streamBaseUrl: null,
    agentOnline: true,
    lastHeartbeatAt: new Date().toISOString(),
    hardware: {
      cpu: 42,
      mem: 68,
      gpu: 29,
    },
    serverSpecs: {
      os: 'Ubuntu 24.04 LTS',
      arch: 'x64',
      cpu: 'Intel Core i5-8250U',
      cores: 8,
      ram: '16 GB',
    },
    todayVisitors: 27,
    recentEvents: [
      {
        id: 'evt-1',
        eventType: 'person_enter',
        cameraId: 'cam2',
        label: 'Pengunjung Masuk',
        message: 'Terdeteksi 1 pengunjung memasuki toko',
        createdAt: '2026-11-24T04:00:00.000Z',
      },
    ],
    ...overrides,
  }
}

function renderMonitorPage(options: { controller?: ConnectivityController } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      {options.controller ? (
        <ConnectivityProvider storeKey="user-1" controller={options.controller}>
          <MonitorPage />
        </ConnectivityProvider>
      ) : (
        <MonitorPage />
      )}
      <Toaster />
    </QueryClientProvider>,
  )
}

describe('MonitorPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders store status, visitor count, Intel telemetry, specs, camera switches, and recent events', async () => {
    const initial = createSnapshot()
    const apiSpy = vi.spyOn(apiClient, 'apiRequest').mockImplementation(async (path) => {
      if (path === '/api/v1/monitor/state') return initial
      throw new Error(`Unexpected path: ${path}`)
    })

    renderMonitorPage()

    expect(await screen.findByText('Pantau toko & CCTV')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Toko Buka/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Agen Online')).toBeInTheDocument()
    expect(screen.getByText('27')).toBeInTheDocument()
    expect(screen.getByText('2 / 2 aktif')).toBeInTheDocument()

    // Intel hardware telemetry & server specs
    expect(screen.getByRole('progressbar', { name: 'Intel CPU' })).toHaveAttribute('aria-valuenow', '42')
    expect(screen.getByRole('progressbar', { name: 'Memori RAM' })).toHaveAttribute('aria-valuenow', '68')
    expect(screen.getByRole('progressbar', { name: 'Intel iGPU (Render/3D)' })).toHaveAttribute('aria-valuenow', '29')
    expect(screen.getByText('Intel Core i5-8250U')).toBeInTheDocument()
    expect(screen.getByText('16 GB')).toBeInTheDocument()

    // Camera switches and cloud frame polling fallback URLs
    const cam1Switch = screen.getByRole('switch', { name: 'Daya Kamera 1 (DALAM)' })
    const cam2Switch = screen.getByRole('switch', { name: 'Daya Kamera 2 (LUAR)' })
    expect(cam1Switch).toHaveAttribute('aria-checked', 'true')
    expect(cam2Switch).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByAltText('Umpan frame Kamera 1 (DALAM)')).toHaveAttribute(
      'src',
      '/api/v1/monitor/frames/cam1?t=0',
    )

    // Recent event log
    expect(screen.getByText('Pengunjung Masuk')).toBeInTheDocument()
    expect(screen.getByText('Terdeteksi 1 pengunjung memasuki toko')).toBeInTheDocument()
    expect(apiSpy).toHaveBeenCalledWith('/api/v1/monitor/state')
  })

  it('toggles store door closed and locks both camera switches', async () => {
    const initial = createSnapshot()
    const closedSnapshot = createSnapshot({
      doorClosed: true,
      cam1Active: false,
      cam2Active: false,
    })

    const apiSpy = vi.spyOn(apiClient, 'apiRequest').mockImplementation(async (path, init) => {
      if (path === '/api/v1/monitor/state') return initial
      if (path === '/api/v1/monitor/door' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ closed: true })
        return closedSnapshot
      }
      throw new Error(`Unexpected call: ${path}`)
    })

    renderMonitorPage()

    const doorButton = await screen.findByRole('button', { name: /Toko Buka/i })
    fireEvent.click(doorButton)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Toko Tutup/i })).toHaveAttribute('aria-pressed', 'true')
    })

    expect(screen.getByRole('switch', { name: 'Daya Kamera 1 (DALAM)' })).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Daya Kamera 2 (LUAR)' })).toBeDisabled()
    expect(screen.getAllByText('Toko sedang tutup')).toHaveLength(2)
    expect(screen.getByText('0 / 2 aktif')).toBeInTheDocument()
    expect(apiSpy).toHaveBeenCalledWith(
      '/api/v1/monitor/door',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('toggles individual camera power switch via PATCH /api/v1/monitor/camera', async () => {
    const initial = createSnapshot()
    const cam1Off = createSnapshot({ cam1Active: false })

    const apiSpy = vi.spyOn(apiClient, 'apiRequest').mockImplementation(async (path, init) => {
      if (path === '/api/v1/monitor/state') return initial
      if (path === '/api/v1/monitor/camera' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ cam: 'cam1', active: false })
        return cam1Off
      }
      throw new Error(`Unexpected call: ${path}`)
    })

    renderMonitorPage()

    const cam1Switch = await screen.findByRole('switch', { name: 'Daya Kamera 1 (DALAM)' })
    fireEvent.click(cam1Switch)

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Daya Kamera 1 (DALAM)' })).toHaveAttribute(
        'aria-checked',
        'false',
      )
    })
    expect(screen.getByText('Kamera dimatikan untuk hemat CPU')).toBeInTheDocument()
    expect(screen.getByText('1 / 2 aktif')).toBeInTheDocument()
    expect(apiSpy).toHaveBeenCalledWith(
      '/api/v1/monitor/camera',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('switches operation mode and saves streamBaseUrl tunnel config', async () => {
    const initial = createSnapshot()
    const servingSnapshot = createSnapshot({ opMode: 'serving' })
    const tunnelSnapshot = createSnapshot({
      opMode: 'serving',
      streamBaseUrl: 'https://cam.abdussalim.my.id',
    })

    const apiSpy = vi.spyOn(apiClient, 'apiRequest').mockImplementation(async (path, init) => {
      if (path === '/api/v1/monitor/state') return initial
      if (path === '/api/v1/monitor/mode' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ mode: 'serving' })
        return servingSnapshot
      }
      if (path === '/api/v1/monitor/config' && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({
          streamBaseUrl: 'https://cam.abdussalim.my.id',
        })
        return tunnelSnapshot
      }
      throw new Error(`Unexpected call: ${path}`)
    })

    renderMonitorPage()

    const servingTab = await screen.findByRole('tab', { name: 'Mode Kasir Layani' })
    fireEvent.click(servingTab)

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Mode Kasir Layani' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })

    const urlInput = screen.getByLabelText(/URL Stream Tunnel/i)
    fireEvent.change(urlInput, { target: { value: 'https://cam.abdussalim.my.id/' } })
    // Verify validation rejects non-http URL cleanly first or save valid URL
    fireEvent.change(urlInput, { target: { value: 'https://cam.abdussalim.my.id' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan URL' }))

    await waitFor(() => {
      expect(screen.getByAltText('Umpan langsung Kamera 1 (DALAM)')).toHaveAttribute(
        'src',
        'https://cam.abdussalim.my.id/stream/cam1',
      )
    })
    expect(screen.getAllByText('LIVE · Tunnel')).toHaveLength(2)
    expect(apiSpy).toHaveBeenCalledWith(
      '/api/v1/monitor/mode',
      expect.objectContaining({ method: 'PATCH' }),
    )
    expect(apiSpy).toHaveBeenCalledWith(
      '/api/v1/monitor/config',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('supports audio role selection, mute toggle, and offline guard', async () => {
    const initial = createSnapshot({ serverSpecs: null, agentOnline: false })
    vi.spyOn(apiClient, 'apiRequest').mockResolvedValue(initial)

    const { unmount } = renderMonitorPage()

    expect(
      await screen.findByText('Menunggu laporan spesifikasi dari PC Intel toko'),
    ).toBeInTheDocument()

    const roleSelect = screen.getByLabelText('Peran audio perangkat')
    fireEvent.change(roleSelect, { target: { value: 'seller' } })
    expect(roleSelect).toHaveValue('seller')

    const muteButton = screen.getByRole('button', { name: 'Suara Bisu' })
    fireEvent.click(muteButton)
    expect(screen.getByRole('button', { name: 'Suara Aktif' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    unmount()

    const offlineController: ConnectivityController = {
      getStatus: () => 'offline',
      getLastCheckedAt: () => null,
      subscribe: () => () => undefined,
      refresh: async () => false,
      dispose: () => undefined,
    }
    renderMonitorPage({ controller: offlineController })
    expect(screen.getByText('Pantau toko membutuhkan koneksi')).toBeInTheDocument()
  })
})
