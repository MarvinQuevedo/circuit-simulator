# CLAUDE.md — Agent Primer

This file orients an AI agent to the circuit simulator codebase. Read it before touching any solver or component code.

## User

Marvin speaks Spanish; replies in Spanish are welcome. Prefers concise, direct responses. Glassmorphism dark-mode UI is intentional — do not simplify or flatten it.

## Repo layout (1000-foot view)

```
src/core/solver/       ← MNA math: LU, Newton, Integrator, DCOperatingPoint, TopologyBuilder
src/core/models/       ← Component model classes (Resistor, Capacitor, Inductor, Diode, BJT, Sources…)
src/core/ComponentDefs.js  ← registry.register() calls + COMPONENT_DEFINITIONS for sidebar
src/store/             ← Two stores: circuitReducer (topology/UI) and simulationStore (voltages)
src/hooks/useSimulation.js ← usePinVoltages, useBranchCurrent — the only React-safe way to read voltages
src/components/        ← React UI only; no solver logic here
src/App.jsx            ← RAF loop, createSession, solveDC, publish
docs/                  ← Human-facing documentation
plans/                 ← Historical phase plans (do not edit)
test/                  ← Vitest unit + integration tests
```

## Key files an agent is likely to touch

| Task | File(s) |
|---|---|
| Add a component model | `src/core/models/*.jsx`, `src/core/ComponentDefs.js` |
| Fix solver math | `src/core/solver/Newton.js`, `Integrator.js`, `LUDecomposition.js` |
| Change topology build | `src/core/solver/TopologyBuilder.js` |
| Add DC OP behavior | `src/core/solver/DCOperatingPoint.js` |
| Change simulation loop timing | `src/App.jsx` (dt, subSteps constants near top) |
| Add a new React UI panel | `src/components/`, subscribe via `usePinVoltages` |
| Write a test | `test/unit/` or `test/integration/` |

## Mixed-signal session lifecycle

```
topology change
  → stop simulation
  → createSession(components, wires, { integrator: 'trapezoidal' })
  → session.solveDC()        ← DC bias, primes vCap/iL
  → RAF loop: session.step(dt) × subSteps
  → simulationStore.publish(results, tSim)
  → dispatch SIMULATION_TICK (component state: vCap, count…)
  → session.dispose()        ← on stop
```

Sessions are **immutable to topology changes**. Any add/remove of component or wire must stop and recreate the session.

## Two stores — never confuse them

- **`circuitReducer`** — React `useReducer`. Holds components, wires, selection. Drives undo/redo and JSON export. Dispatches are synchronous React state updates. Use for topology and UI.
- **`simulationStore`** — Plain JS class, zero React coupling. Holds node voltages and branch currents. Published 60 Hz via `simulationStore.publish()`. Components subscribe via `usePinVoltages` / `useBranchCurrent`. **Never dispatch SIMULATION_TICK for voltages** — that would re-render the entire tree at 60 Hz.

## Component model invariants

Every model must:
1. Extend `BaseComponent` from `src/core/models/BaseComponent.jsx`
2. Guard every MNA stamp with `if (n > 0)` — node 0 is ground (eliminated)
3. Return `null` (not `{}`) from `getUpdatedProperties` for stateless components
4. Set `get domain() { return 'analog' }` (or `'digital'`) for future mixed-signal kernel
5. Return `isLinear() { return true }` for resistors/caps/inductors; `false` for diodes/BJTs

## MNA dense matrix convention

Models receive `A` as `Array<Float64Array>` (array of rows). Stamp as:
```js
A[n1-1][n1-1] += G
A[n2-1][n2-1] += G
A[n1-1][n2-1] -= G
A[n2-1][n1-1] -= G
```
Index is `n-1` because node 0 (ground) is eliminated. Always guard `if (n > 0)`.

## Integrator singleton

`src/core/solver/Integrator.js` exports a module-level singleton set by `createSession`:
```js
setSessionIntegrator(integrator)   // called in createSession
getSessionIntegrator()             // called in CapacitorModel.applyMNA
```
Do not import the integrator directly in model files — always use `getSessionIntegrator()` to avoid circular imports.

## Testing conventions

- Framework: **Vitest** with `happy-dom` environment
- Run: `npm run test:run` for CI, `npm test` for watch
- Unit tests go in `test/unit/<subsystem>/`
- Integration tests go in `test/integration/`
- Do **not** call `session.solveDC()` in step-response tests — it primes capacitors to DC steady-state, which defeats the purpose of testing the transient charging curve
- Import `'../../src/core/ComponentDefs.js'` at the top of integration tests to register all models

## Where NOT to look for logic

- `plans/` — historical plans, not current spec; the code is the spec
- `src/components/` — pure React rendering, no physics
- `node_modules/` — obviously

## Do not

- Do not prop-drill voltages through React component trees — use `usePinVoltages`
- Do not dispatch `SIMULATION_TICK` for voltage/current updates — use `simulationStore.publish()`
- Do not use `Math.abs(resistance)` — negative resistance is valid (tunnel diode, negative-impedance converters)
- Do not skip `if (n > 0)` guards in MNA stamps
- Do not call `solveDC()` inside the RAF loop — it is a one-time initializer
