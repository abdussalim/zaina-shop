import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  Camera,
  Cpu,
  DoorClosed,
  DoorOpen,
  Link2,
  Radio,
  Save,
  Server,
  Users,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import {
  monitorConfigInputSchema,
  type MonitorCameraId,
  type MonitorEvent,
  type MonitorHardwareMetrics,
  type MonitorOpMode,
  type MonitorServerSpecs,
  type MonitorSnapshot,
} from '@zaina/shared'

import { apiRequest, ApiClientError, assertOnlineWrite, jsonBody } from '../../api/client.js'
import { useConnectivity } from '../../app/ConnectivityContext.js'
import { useStoreSettings } from '../../app/StoreSettingsContext.js'
import { Button } from '../../components/ui/Button.js'
import { PageHeader } from '../../components/ui/PageHeader.js'
import { ErrorState, LoadingState, OfflineState } from '../../components/ui/States.js'
import { StatusBadge } from '../../components/ui/StatusBadge.js'
import { formatDateTime, formatQuantity } from '../../lib/format.js'

type AudioRole = 'monitor' | 'seller' | 'buyer'

const CAMERA_META: Array<{ id: MonitorCameraId; title: string; subtitle: string }> = [
  { id: 'cam1', title: 'Kamera 1 (DALAM)', subtitle: 'Area rak & meja kasir' },
  { id: 'cam2', title: 'Kamera 2 (LUAR)', subtitle: 'Pintu masuk & penghitung pengunjung' },
]

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  const win = window as Window & { webkitAudioContext?: typeof AudioContext }
  return window.AudioContext ?? win.webkitAudioContext
}

function getEventTone(eventType: string): 'success' | 'warning' | 'info' | 'neutral' {
  if (eventType === 'person_enter') return 'success'
  if (eventType === 'person_exit') return 'info'
  if (eventType === 'state_change') return 'warning'
  return 'neutral'
}

function getCameraLabel(cameraId: string | null): string | null {
  if (cameraId === 'cam1') return 'Kamera 1'
  if (cameraId === 'cam2') return 'Kamera 2'
  return null
}

function formatHeartbeatStatus(lastHeartbeatAt: string | null, timezone: string): string {
  if (!lastHeartbeatAt) return 'Belum ada sinyal dari PC toko'
  const ts = Date.parse(lastHeartbeatAt)
  if (!Number.isFinite(ts)) return 'Sinyal tidak terbaca'
  const diffSeconds = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (diffSeconds < 15) return 'Baru saja aktif'
  if (diffSeconds < 60) return `${diffSeconds} detik lalu`
  return formatDateTime(lastHeartbeatAt, timezone)
}

export function MonitorPage() {
  const { isOffline, canWrite } = useConnectivity()
  const storeSettings = useStoreSettings()
  const queryClient = useQueryClient()

  const [audioRole, setAudioRole] = useState<AudioRole>('monitor')
  const [muted, setMuted] = useState(true)
  const [frameTick, setFrameTick] = useState(0)
  const [frameErrors, setFrameErrors] = useState<Record<MonitorCameraId, boolean>>({
    cam1: false,
    cam2: false,
  })
  const [tunnelUrlInput, setTunnelUrlInput] = useState('')
  const [tunnelUrlError, setTunnelUrlError] = useState<string | null>(null)
  const [isEditingTunnelUrl, setIsEditingTunnelUrl] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const lastSeenEventIdRef = useRef<string | null>(null)

  const monitorQuery = useQuery<MonitorSnapshot>({
    queryKey: ['monitor', 'state'],
    queryFn: () => apiRequest<MonitorSnapshot>('/api/v1/monitor/state'),
    enabled: !isOffline,
    refetchInterval: 2500,
    refetchIntervalInBackground: false,
  })

  const snapshot = monitorQuery.data

  useEffect(() => {
    if (!snapshot || isEditingTunnelUrl) return
    setTunnelUrlInput(snapshot.streamBaseUrl ?? '')
  }, [snapshot?.streamBaseUrl, isEditingTunnelUrl, snapshot])

  const shouldPollFrames = Boolean(
    snapshot &&
      !snapshot.doorClosed &&
      (snapshot.cam1Active || snapshot.cam2Active) &&
      !snapshot.streamBaseUrl &&
      snapshot.agentOnline,
  )

  useEffect(() => {
    if (!shouldPollFrames) return
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      setFrameTick((tick) => tick + 1)
    }, 1500)
    return () => window.clearInterval(timer)
  }, [shouldPollFrames])

  useEffect(() => {
    setFrameErrors({ cam1: false, cam2: false })
  }, [
    frameTick,
    snapshot?.streamBaseUrl,
    snapshot?.doorClosed,
    snapshot?.cam1Active,
    snapshot?.cam2Active,
    snapshot?.agentOnline,
  ])

  useEffect(() => {
    if (!snapshot) return
    const latestEvent = snapshot.recentEvents[0]
    if (lastSeenEventIdRef.current === null) {
      lastSeenEventIdRef.current = latestEvent?.id ?? ''
      return
    }
    if (!latestEvent || latestEvent.id === lastSeenEventIdRef.current) return

    lastSeenEventIdRef.current = latestEvent.id
    const isVisitorMovement =
      (latestEvent.eventType === 'person_enter' || latestEvent.eventType === 'person_exit') &&
      latestEvent.cameraId === 'cam2'

    if (isVisitorMovement && !muted && snapshot.opMode === 'watch' && audioRole !== 'monitor') {
      playChime(latestEvent.eventType === 'person_enter' ? 600 : 400)
    }
  }, [snapshot, muted, audioRole])

  function ensureAudioContext(): AudioContext | null {
    const AudioCtx = getAudioContextConstructor()
    if (!AudioCtx) return null
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx()
      }
      if (audioContextRef.current.state === 'suspended') {
        void audioContextRef.current.resume()
      }
      return audioContextRef.current
    } catch {
      return null
    }
  }

  function playChime(frequency: number) {
    const ctx = ensureAudioContext()
    if (!ctx) return
    try {
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(frequency, now)
      gain.gain.setValueAtTime(0.001, now)
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.36)
    } catch {
      // Ignore browser Web Audio errors cleanly
    }
  }

  function toggleMute() {
    if (muted) {
      ensureAudioContext()
      setMuted(false)
      toast.success('Peringatan suara diaktifkan')
    } else {
      setMuted(true)
      toast.info('Peringatan suara dibisukan')
    }
  }

  const doorMutation = useMutation({
    mutationFn: (closed: boolean) => {
      assertOnlineWrite(canWrite)
      return apiRequest<MonitorSnapshot>('/api/v1/monitor/door', {
        method: 'PATCH',
        ...jsonBody({ closed }),
      })
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['monitor', 'state'], updated)
      toast.success(
        updated.doorClosed ? 'Toko ditandai tutup — kamera otomatis dimatikan' : 'Toko dibuka',
      )
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Status pintu toko belum dapat diubah.',
      )
    },
  })

  const modeMutation = useMutation({
    mutationFn: (mode: MonitorOpMode) => {
      assertOnlineWrite(canWrite)
      return apiRequest<MonitorSnapshot>('/api/v1/monitor/mode', {
        method: 'PATCH',
        ...jsonBody({ mode }),
      })
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['monitor', 'state'], updated)
      toast.success(
        updated.opMode === 'watch'
          ? 'Mode diubah ke Pantau Berjaga'
          : 'Mode diubah ke Kasir Layani',
      )
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Mode operasi belum dapat diubah.',
      )
    },
  })

  const cameraMutation = useMutation({
    mutationFn: ({ cam, active }: { cam: MonitorCameraId; active: boolean }) => {
      assertOnlineWrite(canWrite)
      return apiRequest<MonitorSnapshot>('/api/v1/monitor/camera', {
        method: 'PATCH',
        ...jsonBody({ cam, active }),
      })
    },
    onSuccess: (updated, variables) => {
      queryClient.setQueryData(['monitor', 'state'], updated)
      const camLabel = variables.cam === 'cam1' ? 'Kamera 1 (DALAM)' : 'Kamera 2 (LUAR)'
      toast.success(variables.active ? `${camLabel} diaktifkan` : `${camLabel} dimatikan`)
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Daya kamera belum dapat diubah.',
      )
    },
  })

  const configMutation = useMutation({
    mutationFn: (streamBaseUrl: string) => {
      assertOnlineWrite(canWrite)
      return apiRequest<MonitorSnapshot>('/api/v1/monitor/config', {
        method: 'PATCH',
        ...jsonBody({ streamBaseUrl }),
      })
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['monitor', 'state'], updated)
      setIsEditingTunnelUrl(false)
      setTunnelUrlInput(updated.streamBaseUrl ?? '')
      setTunnelUrlError(null)
      toast.success(
        updated.streamBaseUrl
          ? 'URL stream tunnel disimpan'
          : 'URL stream tunnel dihapus — memakai umpan frame cloud',
      )
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiClientError ? error.message : 'URL stream tunnel belum dapat disimpan.',
      )
    },
  })

  function handleSaveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = monitorConfigInputSchema.safeParse({ streamBaseUrl: tunnelUrlInput })
    if (!parsed.success) {
      setTunnelUrlError(parsed.error.issues[0]?.message ?? 'URL stream tidak valid')
      return
    }
    setTunnelUrlError(null)
    configMutation.mutate(parsed.data.streamBaseUrl)
  }

  if (isOffline) {
    return (
      <OfflineState
        title="Pantau toko membutuhkan koneksi"
        description="Umpan kamera, status pintu, dan telemetri PC toko tidak tersedia saat offline."
      />
    )
  }

  if (monitorQuery.isPending) {
    return <LoadingState label="Menghubungkan pantauan toko" />
  }

  if (monitorQuery.isError) {
    return (
      <ErrorState
        title="Pantauan toko belum dapat dimuat"
        description={
          monitorQuery.error instanceof ApiClientError
            ? monitorQuery.error.message
            : 'Periksa koneksi server lalu coba muat ulang.'
        }
        action={
          <Button variant="secondary" onClick={() => void monitorQuery.refetch()}>
            Muat ulang
          </Button>
        }
      />
    )
  }

  const data = monitorQuery.data
  const activeCamerasCount = data.doorClosed
    ? 0
    : (data.cam1Active ? 1 : 0) + (data.cam2Active ? 1 : 0)

  return (
    <div className="page-stack monitor-page">
      <PageHeader
        eyebrow="Pengawasan"
        title="Pantau toko & CCTV"
        description="Pantau kamera lokal, kontrol daya kamera, dan hitung pengunjung harian dari mana saja."
        actions={
          <Button
            type="button"
            variant={data.doorClosed ? 'danger' : 'primary'}
            className={`monitor-door-toggle ${
              data.doorClosed ? 'monitor-door-toggle--closed' : 'monitor-door-toggle--open'
            }`}
            icon={
              data.doorClosed ? (
                <DoorClosed aria-hidden="true" />
              ) : (
                <DoorOpen aria-hidden="true" />
              )
            }
            pending={doorMutation.isPending}
            disabled={!canWrite}
            disabledReason="Sambungkan koneksi untuk mengubah status pintu toko"
            aria-pressed={data.doorClosed}
            onClick={() => doorMutation.mutate(!data.doorClosed)}
          >
            {data.doorClosed ? 'Toko Tutup' : 'Toko Buka'}
          </Button>
        }
      />

      <section className="compact-metrics monitor-metrics" aria-label="Ringkasan status pemantauan">
        <article className="monitor-metric-card">
          <span>Status Agen Toko</span>
          <div className="monitor-metric-card__badge-row">
            <StatusBadge tone={data.agentOnline ? 'success' : 'warning'}>
              {data.agentOnline ? 'Agen Online' : 'Agen Offline'}
            </StatusBadge>
          </div>
          <small>{formatHeartbeatStatus(data.lastHeartbeatAt, storeSettings.timezone)}</small>
        </article>

        <article className="monitor-metric-card">
          <span>Pengunjung Hari Ini</span>
          <strong className="data-number">{formatQuantity(data.todayVisitors)}</strong>
          <small>Deteksi Kamera 2 (LUAR)</small>
        </article>

        <article className="monitor-metric-card">
          <span>Mode Operasi</span>
          <strong>{data.opMode === 'watch' ? 'Pantau Berjaga' : 'Kasir Layani'}</strong>
          <small>
            {data.opMode === 'watch' ? 'Peringatan audio aktif' : 'Mode pelayanan kasir'}
          </small>
        </article>

        <article className="monitor-metric-card">
          <span>Kamera Aktif</span>
          <strong className="data-number">{activeCamerasCount} / 2 aktif</strong>
          <small>{data.doorClosed ? 'Terkunci saat toko tutup' : 'Daya kamera dapat diatur'}</small>
        </article>
      </section>

      <section className="monitor-cameras" aria-label="Umpan kamera toko">
        {CAMERA_META.map((cam) => {
          const camActive = cam.id === 'cam1' ? data.cam1Active : data.cam2Active
          const effectiveActive = !data.doorClosed && camActive
          return (
            <CameraCard
              key={cam.id}
              camId={cam.id}
              title={cam.title}
              subtitle={cam.subtitle}
              doorClosed={data.doorClosed}
              camActive={camActive}
              effectiveActive={effectiveActive}
              agentOnline={data.agentOnline}
              streamBaseUrl={data.streamBaseUrl}
              frameTick={frameTick}
              hasFrameError={frameErrors[cam.id]}
              onFrameError={() =>
                setFrameErrors((prev) => (prev[cam.id] ? prev : { ...prev, [cam.id]: true }))
              }
              onFrameLoad={() =>
                setFrameErrors((prev) => (prev[cam.id] ? { ...prev, [cam.id]: false } : prev))
              }
              canWrite={canWrite}
              isMutating={cameraMutation.isPending}
              onTogglePower={() =>
                cameraMutation.mutate({ cam: cam.id, active: !camActive })
              }
            />
          )
        })}
      </section>

      <div className="monitor-panels-grid">
        <ControlsPanel
          opMode={data.opMode}
          audioRole={audioRole}
          muted={muted}
          canWrite={canWrite}
          isModePending={modeMutation.isPending}
          onChangeMode={(mode) => {
            if (mode !== data.opMode) modeMutation.mutate(mode)
          }}
          onChangeAudioRole={setAudioRole}
          onToggleMute={toggleMute}
        />

        <HardwareAndConfigPanel
          hardware={data.hardware}
          serverSpecs={data.serverSpecs}
          tunnelUrlInput={tunnelUrlInput}
          tunnelUrlError={tunnelUrlError}
          canWrite={canWrite}
          isSavingConfig={configMutation.isPending}
          onChangeTunnelUrl={(nextValue) => {
            setIsEditingTunnelUrl(true)
            setTunnelUrlInput(nextValue)
            if (tunnelUrlError) setTunnelUrlError(null)
          }}
          onSubmitConfig={handleSaveConfig}
        />
      </div>

      <ActivityLogPanel events={data.recentEvents} timezone={storeSettings.timezone} />
    </div>
  )
}

function CameraCard({
  camId,
  title,
  subtitle,
  doorClosed,
  camActive,
  effectiveActive,
  agentOnline,
  streamBaseUrl,
  frameTick,
  hasFrameError,
  onFrameError,
  onFrameLoad,
  canWrite,
  isMutating,
  onTogglePower,
}: {
  camId: MonitorCameraId
  title: string
  subtitle: string
  doorClosed: boolean
  camActive: boolean
  effectiveActive: boolean
  agentOnline: boolean
  streamBaseUrl: string | null
  frameTick: number
  hasFrameError: boolean
  onFrameError: () => void
  onFrameLoad: () => void
  canWrite: boolean
  isMutating: boolean
  onTogglePower: () => void
}) {
  const cleanTunnelBase = streamBaseUrl?.trim().replace(/\/$/, '') ?? ''
  const useTunnel = effectiveActive && cleanTunnelBase.length > 0
  const useCloudFrames = effectiveActive && cleanTunnelBase.length === 0

  return (
    <article className="data-card monitor-camera-card">
      <header className="monitor-camera-card__header">
        <div className="monitor-camera-card__title">
          <span className="monitor-camera-card__icon" aria-hidden="true">
            <Camera />
          </span>
          <div>
            <h2>{title}</h2>
            <small>{subtitle}</small>
          </div>
        </div>

        <div className="monitor-camera-card__controls">
          <StatusBadge
            tone={doorClosed ? 'neutral' : camActive ? 'success' : 'warning'}
          >
            {doorClosed ? 'Terkunci' : camActive ? 'Aktif' : 'Mati'}
          </StatusBadge>
          <button
            type="button"
            role="switch"
            aria-checked={effectiveActive}
            aria-label={`Daya ${title}`}
            className={`monitor-switch ${effectiveActive ? 'monitor-switch--on' : ''}`}
            disabled={!canWrite || doorClosed || isMutating}
            onClick={onTogglePower}
          >
            <span className="monitor-switch__track" aria-hidden="true">
              <span className="monitor-switch__thumb" />
            </span>
          </button>
        </div>
      </header>

      <div className="monitor-feed-stage">
        {!effectiveActive ? (
          <div className="monitor-feed-fallback">
            <VideoOff aria-hidden="true" />
            <strong>{doorClosed ? 'Toko sedang tutup' : 'Kamera dimatikan untuk hemat CPU'}</strong>
            <small>
              {doorClosed
                ? 'Buka status pintu toko untuk mengaktifkan kamera.'
                : 'Nyalakan sakelar daya di atas untuk memantau kembali.'}
            </small>
          </div>
        ) : useTunnel ? (
          <>
            <span className="monitor-live-badge">
              <Radio aria-hidden="true" /> LIVE · Tunnel
            </span>
            {!hasFrameError ? (
              <img
                src={`${cleanTunnelBase}/stream/${camId}`}
                alt={`Umpan langsung ${title}`}
                className="monitor-feed-img"
                onLoad={onFrameLoad}
                onError={onFrameError}
              />
            ) : (
              <div className="monitor-feed-fallback">
                <VideoOff aria-hidden="true" />
                <strong>Menunggu aliran stream tunnel...</strong>
                <small>Periksa layanan Cloudflare Tunnel pada PC Intel toko.</small>
              </div>
            )}
          </>
        ) : useCloudFrames ? (
          <>
            {agentOnline && !hasFrameError ? (
              <span className="monitor-live-badge monitor-live-badge--cloud">
                <Camera aria-hidden="true" /> LIVE · Cloud
              </span>
            ) : null}
            {agentOnline ? (
              <>
                <img
                  src={`/api/v1/monitor/frames/${camId}?t=${frameTick}`}
                  alt={`Umpan frame ${title}`}
                  className={`monitor-feed-img ${hasFrameError ? 'monitor-feed-img--hidden' : ''}`}
                  onLoad={onFrameLoad}
                  onError={onFrameError}
                />
                {hasFrameError ? (
                  <div className="monitor-feed-fallback">
                    <Camera aria-hidden="true" />
                    <strong>Menunggu umpan dari PC Intel toko...</strong>
                    <small>Frame JPEG terbaru akan tampil otomatis setiap 1,5 detik.</small>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="monitor-feed-fallback">
                <Camera aria-hidden="true" />
                <strong>Menunggu umpan dari PC Intel toko...</strong>
                <small>Agen monitor toko belum mengirim sinyal online.</small>
              </div>
            )}
          </>
        ) : null}
      </div>
    </article>
  )
}

function ControlsPanel({
  opMode,
  audioRole,
  muted,
  canWrite,
  isModePending,
  onChangeMode,
  onChangeAudioRole,
  onToggleMute,
}: {
  opMode: MonitorOpMode
  audioRole: AudioRole
  muted: boolean
  canWrite: boolean
  isModePending: boolean
  onChangeMode: (mode: MonitorOpMode) => void
  onChangeAudioRole: (role: AudioRole) => void
  onToggleMute: () => void
}) {
  const audioRoleId = useId()

  return (
    <section className="settings-panel monitor-panel" aria-label="Kontrol sistem & peringatan suara">
      <div className="settings-panel__heading">
        <Users aria-hidden="true" />
        <div>
          <h2>Kontrol operasi &amp; suara</h2>
          <p>Atur mode pemantauan kamera luar dan peran peringatan suara pada perangkat ini.</p>
        </div>
      </div>

      <div className="form-stack">
        <div className="form-field">
          <span>Mode operasi</span>
          <div className="segmented-control monitor-mode-control" role="tablist" aria-label="Mode operasi">
            <button
              type="button"
              role="tab"
              aria-selected={opMode === 'watch'}
              disabled={!canWrite || isModePending}
              onClick={() => onChangeMode('watch')}
            >
              Mode Pantau Berjaga
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={opMode === 'serving'}
              disabled={!canWrite || isModePending}
              onClick={() => onChangeMode('serving')}
            >
              Mode Kasir Layani
            </button>
          </div>
          <small>
            {opMode === 'watch'
              ? 'Kamera luar membunyikan notifikasi saat ada pengunjung masuk/keluar.'
              : 'Mode tenang saat kasir sedang melayani pembeli di toko.'}
          </small>
        </div>

        <div className="monitor-audio-row">
          <label className="form-field" htmlFor={audioRoleId}>
            <span>Peran audio perangkat</span>
            <select
              id={audioRoleId}
              value={audioRole}
              onChange={(event) => onChangeAudioRole(event.target.value as AudioRole)}
            >
              <option value="monitor">Monitor Hening (Dashboard)</option>
              <option value="seller">Penjual (Peringatan Suara Rumah)</option>
              <option value="buyer">Pembeli (Sapaan Suara Toko)</option>
            </select>
          </label>

          <div className="monitor-mute-wrap">
            <span className="monitor-mute-wrap__label">Status audio</span>
            <Button
              type="button"
              variant={muted ? 'secondary' : 'primary'}
              icon={muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
              aria-pressed={!muted}
              onClick={onToggleMute}
            >
              {muted ? 'Suara Bisu' : 'Suara Aktif'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function HardwareAndConfigPanel({
  hardware,
  serverSpecs,
  tunnelUrlInput,
  tunnelUrlError,
  canWrite,
  isSavingConfig,
  onChangeTunnelUrl,
  onSubmitConfig,
}: {
  hardware: MonitorHardwareMetrics
  serverSpecs: MonitorServerSpecs | null
  tunnelUrlInput: string
  tunnelUrlError: string | null
  canWrite: boolean
  isSavingConfig: boolean
  onChangeTunnelUrl: (value: string) => void
  onSubmitConfig: (event: FormEvent<HTMLFormElement>) => void
}) {
  const tunnelInputId = useId()
  const meters = [
    { label: 'Intel CPU', value: clampPercent(hardware.cpu) },
    { label: 'Memori RAM', value: clampPercent(hardware.mem) },
    { label: 'Intel iGPU (Render/3D)', value: clampPercent(hardware.gpu) },
  ]

  return (
    <section className="settings-panel monitor-panel" aria-label="Telemetri perangkat keras dan stream">
      <div className="settings-panel__heading">
        <Cpu aria-hidden="true" />
        <div>
          <h2>Telemetri PC Intel &amp; stream</h2>
          <p>Pantau beban komputasi agen lokal serta konfigurasi URL stream opsional.</p>
        </div>
      </div>

      <div className="monitor-meters">
        {meters.map((meter) => {
          const level =
            meter.value >= 90 ? 'danger' : meter.value >= 75 ? 'warn' : 'ok'
          return (
            <div className="monitor-meter" key={meter.label}>
              <div className="monitor-meter__head">
                <span>{meter.label}</span>
                <strong className="data-number">{meter.value}%</strong>
              </div>
              <div
                className="monitor-meter__track"
                role="progressbar"
                aria-label={meter.label}
                aria-valuenow={meter.value}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`monitor-meter__fill monitor-meter__fill--${level}`}
                  style={{ width: `${meter.value}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="monitor-specs-block">
        <div className="monitor-specs-block__title">
          <Server aria-hidden="true" />
          <span>Spesifikasi server lokal</span>
        </div>
        {serverSpecs ? (
          <dl className="monitor-specs-grid">
            <div>
              <dt>CPU Model</dt>
              <dd>{serverSpecs.cpu}</dd>
            </div>
            <div>
              <dt>Cores / Threads</dt>
              <dd>{serverSpecs.cores ? `${serverSpecs.cores} core (${serverSpecs.arch})` : serverSpecs.arch}</dd>
            </div>
            <div>
              <dt>RAM</dt>
              <dd>{serverSpecs.ram}</dd>
            </div>
            <div>
              <dt>Sistem Operasi</dt>
              <dd>{serverSpecs.os}</dd>
            </div>
          </dl>
        ) : (
          <p className="monitor-specs-hint">Menunggu laporan spesifikasi dari PC Intel toko</p>
        )}
      </div>

      <form className="monitor-tunnel-form" noValidate onSubmit={onSubmitConfig}>
        <label className="form-field" htmlFor={tunnelInputId}>
          <span>URL Stream Tunnel (Opsional)</span>
          <div className="monitor-tunnel-form__row">
            <div className="monitor-tunnel-input-wrap">
              <Link2 aria-hidden="true" />
              <input
                id={tunnelInputId}
                type="url"
                value={tunnelUrlInput}
                placeholder="https://cam.abdussalim.my.id"
                disabled={!canWrite}
                onChange={(event) => onChangeTunnelUrl(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              icon={<Save aria-hidden="true" />}
              pending={isSavingConfig}
              disabled={!canWrite}
            >
              Simpan URL
            </Button>
          </div>
          {tunnelUrlError ? (
            <small className="field__message--error">{tunnelUrlError}</small>
          ) : (
            <small>Kosongkan untuk menggunakan umpan gambar otomatis via Cloudflare R2.</small>
          )}
        </label>
      </form>
    </section>
  )
}

function ActivityLogPanel({
  events,
  timezone,
}: {
  events: MonitorEvent[]
  timezone: string
}) {
  return (
    <section className="ledger-section monitor-events-panel" aria-label="Riwayat aktivitas pemantauan">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Log terbaru</p>
          <h2>Aktivitas kamera &amp; toko</h2>
        </div>
        <StatusBadge tone="neutral">{events.length} catatan</StatusBadge>
      </div>

      {events.length > 0 ? (
        <ul className="monitor-event-list">
          {events.map((event) => {
            const camLabel = getCameraLabel(event.cameraId)
            return (
              <li className="monitor-event-item" key={event.id}>
                <div className="monitor-event-item__main">
                  <div className="monitor-event-item__badges">
                    <StatusBadge tone={getEventTone(event.eventType)}>
                      {event.label}
                    </StatusBadge>
                    {camLabel ? <span className="monitor-event-item__cam">{camLabel}</span> : null}
                  </div>
                  <p>{event.message}</p>
                </div>
                <time className="monitor-event-item__time" dateTime={event.createdAt}>
                  <Activity aria-hidden="true" />
                  <span>{formatDateTime(event.createdAt, timezone)}</span>
                </time>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="inline-empty">
          <Camera aria-hidden="true" /> Belum ada aktivitas pemantauan tercatat hari ini.
        </div>
      )}
    </section>
  )
}
