import { describe, expect, it } from 'vitest'
import {
  monitorAgentEventInputSchema,
  monitorCameraInputSchema,
  monitorConfigInputSchema,
  monitorDoorInputSchema,
  monitorHeartbeatInputSchema,
  monitorModeInputSchema,
  monitorServerSpecsSchema,
} from './monitor.js'

describe('monitor shared schemas', () => {
  it('validates door, mode, and camera inputs', () => {
    expect(monitorDoorInputSchema.parse({ closed: true })).toEqual({ closed: true })
    expect(monitorModeInputSchema.parse({ mode: 'serving' })).toEqual({ mode: 'serving' })
    expect(monitorCameraInputSchema.parse({ cam: 'cam1', active: false })).toEqual({
      cam: 'cam1',
      active: false,
    })

    expect(() => monitorModeInputSchema.parse({ mode: 'invalid' })).toThrow()
    expect(() => monitorCameraInputSchema.parse({ cam: 'cam3', active: true })).toThrow()
  })

  it('validates streamBaseUrl allowing empty string or http(s) URLs', () => {
    expect(monitorConfigInputSchema.parse({ streamBaseUrl: '  ' })).toEqual({
      streamBaseUrl: '',
    })
    expect(
      monitorConfigInputSchema.parse({ streamBaseUrl: 'https://cctv.zaina.id/live' }),
    ).toEqual({
      streamBaseUrl: 'https://cctv.zaina.id/live',
    })
    expect(
      monitorConfigInputSchema.parse({ streamBaseUrl: 'http://192.168.1.50:8080' }),
    ).toEqual({
      streamBaseUrl: 'http://192.168.1.50:8080',
    })

    const bad = monitorConfigInputSchema.safeParse({ streamBaseUrl: 'ftp://example.com' })
    expect(bad.success).toBe(false)
  })

  it('validates heartbeat metrics, defaults gpu to 0, and validates serverSpecs', () => {
    const parsed = monitorHeartbeatInputSchema.parse({
      cpu: 42.5,
      mem: 68.1,
      serverSpecs: {
        os: 'Ubuntu 24.04',
        arch: 'x64',
        cpu: 'Intel N100',
        cores: 4,
        ram: '16 GB',
      },
    })
    expect(parsed.gpu).toBe(0)
    expect(parsed.serverSpecs?.cores).toBe(4)

    expect(() => monitorHeartbeatInputSchema.parse({ cpu: 120, mem: 10 })).toThrow()
    expect(() =>
      monitorServerSpecsSchema.parse({ os: 'Linux', arch: 'x64', cpu: 'x', cores: 0, ram: '8G' }),
    ).toThrow()
  })

  it('validates agent event input', () => {
    expect(
      monitorAgentEventInputSchema.parse({
        eventType: 'person_enter',
        cam: 'cam2',
        trackId: 12,
        note: 'Pengunjung masuk',
      }),
    ).toEqual({
      eventType: 'person_enter',
      cam: 'cam2',
      trackId: 12,
      note: 'Pengunjung masuk',
    })

    expect(() =>
      monitorAgentEventInputSchema.parse({ eventType: 'motion', cam: 'cam1' }),
    ).toThrow()
  })
})
