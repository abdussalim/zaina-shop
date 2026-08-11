import { createConnectivityController, type ConnectivityEventTarget } from './connectivity.js'
import { describe, expect, it } from 'vitest'

function target(initialOnline = true) {
  const listeners = new Map<string, Set<() => void>>()
  const eventTarget: ConnectivityEventTarget & { setOnline(value: boolean): void } = {
    navigator: { onLine: initialOnline },
    addEventListener(type, listener) {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener)
    },
    setOnline(value) {
      this.navigator = { onLine: value }
      for (const listener of listeners.get(value ? 'online' : 'offline') ?? []) listener()
    },
  }
  return eventTarget
}

describe('connectivity controller', () => {
  it('tracks offline, online probe, failed reconnect, and unsubscribe', async () => {
    const eventTarget = target(false)
    let reachable = false
    const controller = createConnectivityController(eventTarget, async () => reachable)
    const statuses: string[] = []
    const unsubscribe = controller.subscribe((status) => statuses.push(status))
    expect(controller.getStatus()).toBe('offline')
    eventTarget.setOnline(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(controller.getStatus()).toBe('offline')
    reachable = true
    expect(await controller.refresh()).toBe(true)
    expect(controller.getStatus()).toBe('online')
    expect(controller.getLastCheckedAt()).toMatch(/T/)
    unsubscribe()
    eventTarget.setOnline(false)
    expect(statuses).toContain('checking')
    controller.dispose()
  })
})
