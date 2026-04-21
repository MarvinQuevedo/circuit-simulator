import { describe, it, expect, vi } from 'vitest'
import { SimulationStore } from '../../../src/store/simulationStore.js'

// Test the class directly (not the singleton) so tests are isolated.
describe('SimulationStore', () => {
  it('publishes nodeVoltages and calls listeners', () => {
    const store = new SimulationStore()
    const cb = vi.fn()
    store.subscribe('test', cb)

    store.publish({ nodeVoltages: { pinA: 5.0 }, branchCurrents: {} }, 1.0)
    expect(cb).toHaveBeenCalledOnce()
    expect(store.getVoltage('pinA')).toBe(5.0)
  })

  it('unsubscribe removes listener', () => {
    const store = new SimulationStore()
    const cb = vi.fn()
    const unsub = store.subscribe('k', cb)
    unsub()
    store.publish({ nodeVoltages: {}, branchCurrents: {} }, 0)
    expect(cb).not.toHaveBeenCalled()
  })

  it('getVoltage returns 0 for unknown pins', () => {
    const store = new SimulationStore()
    expect(store.getVoltage('unknownPin')).toBe(0)
  })

  it('getCurrent returns 0 for unknown branches', () => {
    const store = new SimulationStore()
    expect(store.getCurrent('r1')).toBe(0)
  })

  it('multiple listeners all fire on publish', () => {
    const store = new SimulationStore()
    const a = vi.fn(), b = vi.fn()
    store.subscribe('a', a)
    store.subscribe('b', b)
    store.publish({ nodeVoltages: {}, branchCurrents: {} }, 0)
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
  })
})
