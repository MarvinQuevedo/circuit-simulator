// Plain JS, no React. Updated from the RAF tick.
// Keeps simulation results outside the reducer so a publish does not
// trigger a reducer re-render of the whole tree.
export class SimulationStore {
  constructor() {
    this.nodeVoltages = {}
    this.branchCurrents = {}
    this.simTime = 0
    this._listeners = new Map() // subscriberKey -> callback
  }

  publish(results, tSim) {
    this.nodeVoltages = results.nodeVoltages
    this.branchCurrents = results.branchCurrents
    this.simTime = tSim
    for (const cb of this._listeners.values()) cb()
  }

  subscribe(key, callback) {
    this._listeners.set(key, callback)
    return () => this._listeners.delete(key)
  }

  getVoltage(pinId) { return this.nodeVoltages[pinId] ?? 0 }
  getCurrent(branchId) { return this.branchCurrents[branchId] ?? 0 }
  getSnapshot() { return { nodeVoltages: this.nodeVoltages, branchCurrents: this.branchCurrents } }
}

export const simulationStore = new SimulationStore()
