import { z } from 'zod'

export const monitorOpModeSchema = z.enum(['watch', 'serving'])

export const monitorCameraIdSchema = z.enum(['cam1', 'cam2'])

export const monitorDoorInputSchema = z.object({
  closed: z.boolean(),
})

export const monitorModeInputSchema = z.object({
  mode: monitorOpModeSchema,
})

export const monitorCameraInputSchema = z.object({
  cam: monitorCameraIdSchema,
  active: z.boolean(),
})

export const monitorConfigInputSchema = z.object({
  streamBaseUrl: z
    .string()
    .trim()
    .max(300)
    .refine(
      (v) => v === '' || /^https?:\/\//i.test(v),
      'URL stream harus diawali http:// atau https://',
    ),
})

export const monitorServerSpecsSchema = z.object({
  os: z.string().max(120),
  arch: z.string().max(40),
  cpu: z.string().max(160),
  cores: z.number().int().min(1).max(256).optional(),
  ram: z.string().max(40),
})

export const monitorHeartbeatInputSchema = z.object({
  cpu: z.number().min(0).max(100),
  mem: z.number().min(0).max(100),
  gpu: z.number().min(0).max(100).default(0),
  serverSpecs: monitorServerSpecsSchema.optional(),
})

export const monitorAgentEventInputSchema = z.object({
  eventType: z.enum(['person_enter', 'person_exit']),
  cam: monitorCameraIdSchema,
  trackId: z.union([z.string(), z.number()]).optional(),
  note: z.string().max(200).optional(),
})

export type MonitorOpMode = z.infer<typeof monitorOpModeSchema>
export type MonitorCameraId = z.infer<typeof monitorCameraIdSchema>
export type MonitorDoorInput = z.infer<typeof monitorDoorInputSchema>
export type MonitorModeInput = z.infer<typeof monitorModeInputSchema>
export type MonitorCameraInput = z.infer<typeof monitorCameraInputSchema>
export type MonitorConfigInput = z.infer<typeof monitorConfigInputSchema>
export type MonitorHeartbeatInput = z.infer<typeof monitorHeartbeatInputSchema>
export type MonitorAgentEventInput = z.infer<typeof monitorAgentEventInputSchema>

export interface MonitorServerSpecs {
  os: string
  arch: string
  cpu: string
  cores?: number | undefined
  ram: string
}

export interface MonitorHardwareMetrics {
  cpu: number
  mem: number
  gpu: number
}

export interface MonitorEvent {
  id: string
  eventType: string
  cameraId: string | null
  label: string
  message: string
  createdAt: string
}

export interface MonitorDesiredState {
  doorClosed: boolean
  opMode: MonitorOpMode
  cam1Active: boolean
  cam2Active: boolean
}

export interface MonitorSnapshot {
  opMode: MonitorOpMode
  doorClosed: boolean
  cam1Active: boolean
  cam2Active: boolean
  streamBaseUrl: string | null
  agentOnline: boolean
  lastHeartbeatAt: string | null
  hardware: MonitorHardwareMetrics
  serverSpecs: MonitorServerSpecs | null
  todayVisitors: number
  recentEvents: MonitorEvent[]
}
