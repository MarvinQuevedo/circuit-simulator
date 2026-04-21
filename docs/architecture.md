# Architecture Overview

## Data flow

```
User Interaction
     │
     ▼
circuitReducer (useReducer)          ← topology state: components, wires, selection
     │  SIMULATION_TICK (component properties only)
     ▼
App.jsx RAF tick loop
     │  createSession(components, wires)  — once per topology
     │  session.solveDC()                — once at sim start
     │  loop: session.step(dt)           — 10 sub-steps per frame
     │
     ├──► simulationStore.publish()      ← voltages/currents (bypasses reducer)
     │         │
     │         ▼
     │    ComponentNode  (usePinVoltages)  — re-renders only on voltage change
     │    WireNode       (useBranchCurrent)
     │
     └──► dispatch SIMULATION_TICK       ← only component state changes (vCap, count…)
              │
              ▼
         Canvas / PropertiesPanel / DebugPanel
```

## Session lifecycle

```
topology change (add/remove comp/wire)
  → simulation is stopped
  → on next Start: createSession(componentsRef.current, wiresRef.current)
  → session.solveDC()      — DC bias, primes capacitor vCap
  → loop: session.step(dt) — Trapezoidal transient
  → on Stop: session.dispose()
```

Sessions are immutable to topology changes. If the user edits a component property during simulation (not possible today — simulation blocks editing), a new session would need to be created.

## Key files

| File | Role |
|---|---|
| [src/core/solver/index.js](../src/core/solver/index.js) | Public solver API: `createSession` |
| [src/core/solver/TopologyBuilder.js](../src/core/solver/TopologyBuilder.js) | Pin→node mapping, extra-var allocation |
| [src/core/solver/LUDecomposition.js](../src/core/solver/LUDecomposition.js) | LU with partial pivoting |
| [src/core/solver/Newton.js](../src/core/solver/Newton.js) | Adaptive Newton-Raphson |
| [src/core/solver/Integrator.js](../src/core/solver/Integrator.js) | BackwardEuler + Trapezoidal companion models |
| [src/core/solver/DCOperatingPoint.js](../src/core/solver/DCOperatingPoint.js) | Source stepping for DC bias |
| [src/core/models/BaseComponent.jsx](../src/core/models/BaseComponent.jsx) | Component model interface |
| [src/core/ComponentDefs.js](../src/core/ComponentDefs.js) | All model registrations |
| [src/store/circuitReducer.js](../src/store/circuitReducer.js) | Topology + UI state (undo/redo) |
| [src/store/simulationStore.js](../src/store/simulationStore.js) | External voltage/current pub/sub |
| [src/hooks/useSimulation.js](../src/hooks/useSimulation.js) | React hooks for store subscription |
| [src/App.jsx](../src/App.jsx) | RAF loop, session management |

## State split

| State | Where | Why |
|---|---|---|
| components, wires, selection | `circuitReducer` | Topology — drives undo/redo, JSON save |
| nodeVoltages, branchCurrents | `simulationStore` | High-frequency (60 Hz) — must not re-render full tree |
| vCap, iCap, count, etc. | `circuitReducer` via SIMULATION_TICK | Component state — persisted between pause/resume |

## Component model domains

- **Analog** — stamped into MNA every step: Resistor, Capacitor, Inductor, Diode, BJT, Voltage/Current sources.
- **Digital** — co-simulated as analog today (Phase 2 TODO: event-driven kernel): Gates, Counters, Shift Registers.
- **Interface** — future: D→A output buffer, A→D input sampler.
