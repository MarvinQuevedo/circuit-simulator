import { useSyncExternalStore } from 'react'
import { simulationStore } from '../store/simulationStore'

/**
 * Subscribe to a single pin voltage. Re-renders only when the store publishes.
 * The memo comparator in ComponentNode/WireNode ensures stable identity props
 * don't cause re-renders; voltage updates come through here.
 */
export function usePinVoltage(pinId) {
  return useSyncExternalStore(
    cb => simulationStore.subscribe(pinId, cb),
    () => simulationStore.getVoltage(pinId),
    () => 0
  )
}

/**
 * Subscribe to multiple pin voltages at once (one subscription key per call site).
 * Returns a plain object { [pinId]: voltage }.
 */
export function usePinVoltages(pinIds) {
  return useSyncExternalStore(
    cb => {
      const key = pinIds.join(',')
      return simulationStore.subscribe(key, cb)
    },
    () => {
      const out = {}
      for (const id of pinIds) out[id] = simulationStore.getVoltage(id)
      return out
    },
    () => ({})
  )
}

/**
 * Subscribe to a branch current (component or wire).
 */
export function useBranchCurrent(branchId) {
  return useSyncExternalStore(
    cb => simulationStore.subscribe(`bc_${branchId}`, cb),
    () => simulationStore.getCurrent(branchId),
    () => 0
  )
}
