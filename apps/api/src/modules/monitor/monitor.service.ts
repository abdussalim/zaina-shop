import {
  monitorServerSpecsSchema,
  type MonitorAgentEventInput,
  type MonitorCameraId,
  type MonitorDesiredState,
  type MonitorEvent,
  type MonitorHeartbeatInput,
  type MonitorOpMode,
  type MonitorServerSpecs,
  type MonitorSnapshot,
} from '@zaina/shared'
import type { Database, DatabaseClient } from '../../db/database.js'
import { AppError } from '../../http/errors.js'

interface MonitorStateRow {
  id: number
  is_active: number
  op_mode: MonitorOpMode
  door_closed: number
  cam1_active: number
  cam2_active: number
  stream_base_url: string | null
  cpu_percent: number
  mem_percent: number
  gpu_percent: number
  server_specs_json: string | null
  last_heartbeat_at: string | null
  updated_at: string
}

interface MonitorEventRow {
  id: string
  event_type: string
  camera_id: string | null
  label: string
  message: string
  created_at: string
}

interface VisitorsDailyRow {
  total_count: number
}

const HEARTBEAT_ONLINE_WINDOW_MS = 30_000

const wibDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function getWibDateString(date = new Date()): string {
  const parts = wibDateFormatter.formatToParts(date)
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  return `${year}-${month}-${day}`
}

function parseServerSpecs(raw: string | null): MonitorServerSpecs | null {
  if (!raw) return null
  try {
    const parsed = monitorServerSpecsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function isAgentOnline(lastHeartbeatAt: string | null, nowMs = Date.now()): boolean {
  if (!lastHeartbeatAt) return false
  const ts = Date.parse(lastHeartbeatAt)
  if (!Number.isFinite(ts)) return false
  return Math.abs(nowMs - ts) <= HEARTBEAT_ONLINE_WINDOW_MS
}

function mapEventRow(row: MonitorEventRow): MonitorEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    cameraId: row.camera_id,
    label: row.label,
    message: row.message,
    createdAt: row.created_at,
  }
}

function mapDesiredState(row: MonitorStateRow): MonitorDesiredState {
  return {
    doorClosed: row.door_closed === 1,
    opMode: row.op_mode === 'serving' ? 'serving' : 'watch',
    cam1Active: row.cam1_active === 1,
    cam2Active: row.cam2_active === 1,
  }
}

async function ensureStateRow(db: DatabaseClient): Promise<MonitorStateRow> {
  const existing = await db.query<MonitorStateRow>(
    'SELECT * FROM monitor_state WHERE id = 1',
  )
  if (existing.rows[0]) {
    return existing.rows[0]
  }

  await db.query(
    `INSERT OR IGNORE INTO monitor_state (
      id, is_active, op_mode, door_closed, cam1_active, cam2_active
    ) VALUES (1, 1, 'watch', 0, 1, 1)`,
  )
  const created = await db.query<MonitorStateRow>(
    'SELECT * FROM monitor_state WHERE id = 1',
  )
  if (!created.rows[0]) {
    throw new AppError(500, 'MONITOR_STATE_MISSING', 'Gagal memuat status monitor')
  }
  return created.rows[0]
}

async function insertMonitorEvent(
  db: DatabaseClient,
  params: {
    eventType: string
    cameraId: string | null
    label: string
    message: string
    createdAt?: string
  },
): Promise<MonitorEvent> {
  const id = crypto.randomUUID()
  const createdAt = params.createdAt ?? new Date().toISOString()

  await db.query(
    `INSERT INTO monitor_events (
      id, event_type, camera_id, label, message, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    [id, params.eventType, params.cameraId, params.label, params.message, createdAt],
  )

  return {
    id,
    eventType: params.eventType,
    cameraId: params.cameraId,
    label: params.label,
    message: params.message,
    createdAt,
  }
}

async function readTodayVisitors(db: DatabaseClient, wibDate: string): Promise<number> {
  const result = await db.query<VisitorsDailyRow>(
    'SELECT total_count FROM monitor_visitors_daily WHERE date = ?1',
    [wibDate],
  )
  return result.rows[0]?.total_count ?? 0
}

export function createMonitorService(database: Database) {
  async function getSnapshot(): Promise<MonitorSnapshot> {
    const state = await ensureStateRow(database)
    const todayDate = getWibDateString()

    const [todayVisitors, eventsResult] = await Promise.all([
      readTodayVisitors(database, todayDate),
      database.query<MonitorEventRow>(
        `SELECT id, event_type, camera_id, label, message, created_at
         FROM monitor_events
         ORDER BY created_at DESC, rowid DESC
         LIMIT 30`,
      ),
    ])

    return {
      opMode: state.op_mode === 'serving' ? 'serving' : 'watch',
      doorClosed: state.door_closed === 1,
      cam1Active: state.cam1_active === 1,
      cam2Active: state.cam2_active === 1,
      streamBaseUrl: state.stream_base_url ?? null,
      agentOnline: isAgentOnline(state.last_heartbeat_at),
      lastHeartbeatAt: state.last_heartbeat_at ?? null,
      hardware: {
        cpu: Number(state.cpu_percent ?? 0),
        mem: Number(state.mem_percent ?? 0),
        gpu: Number(state.gpu_percent ?? 0),
      },
      serverSpecs: parseServerSpecs(state.server_specs_json),
      todayVisitors,
      recentEvents: eventsResult.rows.map(mapEventRow),
    }
  }

  return {
    getSnapshot,

    async setDoor(closed: boolean): Promise<MonitorSnapshot> {
      await ensureStateRow(database)
      const nowIso = new Date().toISOString()

      if (closed) {
        await database.query(
          `UPDATE monitor_state
           SET door_closed = 1, cam1_active = 0, cam2_active = 0, updated_at = ?1
           WHERE id = 1`,
          [nowIso],
        )
      } else {
        await database.query(
          `UPDATE monitor_state
           SET door_closed = 0, updated_at = ?1
           WHERE id = 1`,
          [nowIso],
        )
      }

      await insertMonitorEvent(database, {
        eventType: 'state_change',
        cameraId: null,
        label: closed ? 'Toko Tutup' : 'Toko Buka',
        message: closed
          ? 'Pintu toko ditutup; seluruh kamera dimatikan otomatis'
          : 'Pintu toko dibuka kembali',
        createdAt: nowIso,
      })

      return getSnapshot()
    },

    async setMode(mode: MonitorOpMode): Promise<MonitorSnapshot> {
      await ensureStateRow(database)
      const nowIso = new Date().toISOString()

      await database.query(
        `UPDATE monitor_state
         SET op_mode = ?1, updated_at = ?2
         WHERE id = 1`,
        [mode, nowIso],
      )

      await insertMonitorEvent(database, {
        eventType: 'state_change',
        cameraId: null,
        label: mode === 'serving' ? 'Mode Melayani' : 'Mode Jaga',
        message:
          mode === 'serving'
            ? 'Mode operasi diubah ke Melayani'
            : 'Mode operasi diubah ke Jaga',
        createdAt: nowIso,
      })

      return getSnapshot()
    },

    async setCamera(cam: MonitorCameraId, active: boolean): Promise<MonitorSnapshot> {
      const state = await ensureStateRow(database)
      if (state.door_closed === 1 && active) {
        throw new AppError(
          409,
          'STORE_CLOSED',
          'Kamera tidak dapat dinyalakan saat toko sedang tutup',
        )
      }

      const nowIso = new Date().toISOString()
      const column = cam === 'cam1' ? 'cam1_active' : 'cam2_active'
      await database.query(
        `UPDATE monitor_state
         SET ${column} = ?1, updated_at = ?2
         WHERE id = 1`,
        [active ? 1 : 0, nowIso],
      )

      const camLabel = cam === 'cam1' ? 'Kamera 1' : 'Kamera 2'
      await insertMonitorEvent(database, {
        eventType: 'state_change',
        cameraId: cam,
        label: camLabel,
        message: `${camLabel} ${active ? 'dinyalakan' : 'dimatikan'}`,
        createdAt: nowIso,
      })

      return getSnapshot()
    },

    async setConfig(streamBaseUrl: string): Promise<MonitorSnapshot> {
      await ensureStateRow(database)
      const nowIso = new Date().toISOString()
      const normalized = streamBaseUrl.trim()
      await database.query(
        `UPDATE monitor_state
         SET stream_base_url = ?1, updated_at = ?2
         WHERE id = 1`,
        [normalized === '' ? null : normalized, nowIso],
      )

      return getSnapshot()
    },

    async recordHeartbeat(
      input: MonitorHeartbeatInput,
    ): Promise<{ desiredState: MonitorDesiredState }> {
      await ensureStateRow(database)
      const nowIso = new Date().toISOString()

      if (input.serverSpecs !== undefined) {
        await database.query(
          `UPDATE monitor_state
           SET cpu_percent = ?1,
               mem_percent = ?2,
               gpu_percent = ?3,
               server_specs_json = ?4,
               last_heartbeat_at = ?5,
               updated_at = ?5
           WHERE id = 1`,
          [
            input.cpu,
            input.mem,
            input.gpu,
            JSON.stringify(input.serverSpecs),
            nowIso,
          ],
        )
      } else {
        await database.query(
          `UPDATE monitor_state
           SET cpu_percent = ?1,
               mem_percent = ?2,
               gpu_percent = ?3,
               last_heartbeat_at = ?4,
               updated_at = ?4
           WHERE id = 1`,
          [input.cpu, input.mem, input.gpu, nowIso],
        )
      }

      const updated = await ensureStateRow(database)
      return {
        desiredState: mapDesiredState(updated),
      }
    },

    async touchHeartbeat(): Promise<void> {
      await ensureStateRow(database)
      const nowIso = new Date().toISOString()
      await database.query(
        `UPDATE monitor_state
         SET last_heartbeat_at = ?1, updated_at = ?1
         WHERE id = 1`,
        [nowIso],
      )
    },

    async recordAgentEvent(
      input: MonitorAgentEventInput,
    ): Promise<{ todayVisitors: number; event: MonitorEvent }> {
      const now = new Date()
      const nowIso = now.toISOString()
      const todayDate = getWibDateString(now)

      const isEnter = input.eventType === 'person_enter'
      const label = isEnter ? 'Orang Masuk' : 'Orang Keluar'
      const camLabel = input.cam === 'cam1' ? 'Kamera 1' : 'Kamera 2'
      const trackSuffix = input.trackId !== undefined ? ` (#${input.trackId})` : ''
      const note = input.note?.trim()
      const message =
        note && note.length > 0
          ? note
          : `${camLabel} mendeteksi orang ${isEnter ? 'masuk' : 'keluar'}${trackSuffix}`

      const event = await insertMonitorEvent(database, {
        eventType: input.eventType,
        cameraId: input.cam,
        label,
        message,
        createdAt: nowIso,
      })

      if (input.eventType === 'person_enter' && input.cam === 'cam2') {
        await database.query(
          `INSERT INTO monitor_visitors_daily (date, total_count, updated_at)
           VALUES (?1, 1, ?2)
           ON CONFLICT(date) DO UPDATE SET
             total_count = monitor_visitors_daily.total_count + 1,
             updated_at = excluded.updated_at`,
          [todayDate, nowIso],
        )
      }

      const todayVisitors = await readTodayVisitors(database, todayDate)
      return { todayVisitors, event }
    },
  }
}
