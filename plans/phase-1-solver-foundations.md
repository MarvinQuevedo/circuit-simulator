# Phase 1 — Solver Foundations

## Goal

Rebuild the MNA solver core to be faster, more numerically stable, and to separate concerns (linear algebra, matrix assembly, transient integration, DC operating point). This phase is **the prerequisite for every other improvement** because it defines the contracts the rest of the system will use.

**Expected outcome:** 5–20× speedup on mid-sized circuits (50–200 components), cleaner extension points for new models, stable DC startup.

## Impacted files

| Path | Current role | What changes |
|---|---|---|
| [src/core/Solver.js](../src/core/Solver.js) | Dense Gauss-Jordan + `simulateCircuit` monolith | Replaced by modular solver package |
| [src/core/models/BaseComponent.jsx](../src/core/models/BaseComponent.jsx) | Defines stamp interface (lines 19–32, 55–57) | Extended, not broken: adds `isLinear()`, `supportsDC()`, `initDC()` hooks |
| [src/core/models/Reactive.jsx](../src/core/models/Reactive.jsx) | Capacitor Backward Euler stamp | Upgraded to companion model supporting Trapezoidal |
| [src/App.jsx](../src/App.jsx) | Simulation loop, lines 171–258 | Uses new `SolverSession` handle, calls `step(dt)` instead of re-assembling |

## Baseline (current state)

- `solveLinearSystem(A, B)` ([Solver.js:3-50](../src/core/Solver.js#L3-L50)): dense Gauss-Jordan with partial pivoting, O(n³) every call. No LU caching.
- `simulateCircuit(components, wires, dt)` ([Solver.js:52-223](../src/core/Solver.js#L52-L223)):
  - Rebuilds node map and MNA matrix every call.
  - Runs 20 Newton iterations hardcoded ([line 144](../src/core/Solver.js#L144)).
  - Stops at `diff < 1e-7` (L1 norm, not relative) ([line 184](../src/core/Solver.js#L184)).
  - No DC initialization — starts from `X = 0` every simulation session.

## Design

### 1.1 New solver package layout

Create `src/core/solver/` with these modules:

```
src/core/solver/
├── index.js              — public API: createSession, stepTransient, solveDC
├── SparseMatrix.js       — CSR-backed sparse matrix with in-place stamp()
├── LUDecomposition.js    — LU with partial pivoting; reusable factor/refactor
├── TopologyBuilder.js    — pin→node mapping, extraVar allocation, sparsity pattern
├── Newton.js             — adaptive Newton-Raphson driver
├── Integrator.js         — BackwardEuler and Trapezoidal strategies
└── DCOperatingPoint.js   — damped Newton with source stepping for startup
```

### 1.2 Public API

Exposed from `src/core/solver/index.js`:

```js
// Called once per topology change. Returns a reusable session.
// Throws TopologyError if circuit is under-constrained.
export function createSession(components, wires, { integrator = 'trapezoidal' } = {}) {
  // Builds TopologyBuilder result, pre-allocates SparseMatrix sparsity,
  // returns { step, solveDC, dispose, getState }
}

// Called from App.jsx simulation loop. Returns { nodeVoltages, branchCurrents, updatedComponentProperties }.
session.step(dt)

// Called once at simulation start or when DC re-init is requested.
session.solveDC()

// Frees internal buffers.
session.dispose()
```

Contract: `createSession` is called whenever topology changes (add/remove component or wire). `step(dt)` is called in the RAF loop and must not allocate matrices on the hot path.

### 1.3 SparseMatrix (CSR + builder)

Two-phase API — build once, reuse forever:

```js
class SparseMatrixBuilder {
  add(row, col)           // reserve a nonzero slot
  build() -> SparseMatrix // returns a fixed-structure CSR
}

class SparseMatrix {
  zero()                  // reset values, keep structure
  stamp(row, col, value)  // add to existing slot (asserts slot exists)
  rowView(row)            // iterator over (col, value) in row
  data                    // Float64Array
}
```

Reasoning: MNA has a fixed sparsity pattern for a given topology. Caching structure and only mutating values eliminates malloc churn.

### 1.4 LU with reuse

```js
class LUDecomposition {
  constructor(sparseMatrix)
  factor()                // re-factor in place, updates pivots array
  solve(bVector, xOut)    // forward/back substitution into xOut
  isValid()               // false if last factor hit a zero pivot
}
```

Key win: during Newton iterations for **linear** circuits, `factor()` is called once per timestep instead of once per Newton iteration. For nonlinear circuits with only a few nonlinear devices (diodes, BJTs), implement rank-1 updates as a later optimization (not in scope for this phase).

### 1.5 Newton driver (adaptive)

```js
function runNewton(session, options = {}) {
  const {
    maxIter = 50,
    absTol = 1e-9,        // on ΔX
    relTol = 1e-4,        // on |ΔX| / (|X| + vAbs)
    vAbs   = 1e-3,
    minIter = 1,
  } = options
  // Terminates when both abs and rel tolerance pass OR maxIter hit.
  // Returns { converged, iterations, residual }.
}
```

Critical improvement: purely linear circuits (no diodes/BJTs stamped this step) converge in **1 iteration**. Detect linearity by querying `component.model.isLinear()` — when all stamped components are linear, skip the Newton outer loop entirely and do a single solve.

### 1.6 DC operating point

Add `solveDC()` distinct from `step(dt)`:

1. Treat capacitors as open circuits (stamp nothing, or stamp a huge parallel resistance `1e12 Ω`).
2. Treat inductors as short circuits (0 Ω, add 1 extra var for branch current).
3. Run damped Newton with **source stepping**: scale all independent sources by α ∈ [0, 1] and sweep α from 0 to 1 in ~5 steps, using previous solution as warm start.
4. Store result as initial X for transient.

This eliminates the "cold start" glitches where capacitor voltages take several frames to settle. The blinker hack in [exampleCircuits.js](../src/data/exampleCircuits.js) (forcing `vCap=+8/-8`) can then be removed.

### 1.7 Integrator strategies

```js
// src/core/solver/Integrator.js
export const BackwardEuler = {
  // Capacitor: G_eq = C/dt, I_eq = G_eq * vCap_prev
  companionCapacitor(C, vPrev, iPrev, dt) { return { Geq: C/dt, Ieq: (C/dt)*vPrev } },
  // Inductor: G_eq = dt/L, V_eq = -iPrev * L/dt
  companionInductor(L, vPrev, iPrev, dt) { return { Geq: dt/L, Veq: -iPrev*L/dt } },
}

export const Trapezoidal = {
  companionCapacitor(C, vPrev, iPrev, dt) {
    const Geq = 2*C/dt
    return { Geq, Ieq: Geq*vPrev + iPrev }
  },
  companionInductor(L, vPrev, iPrev, dt) {
    const Geq = dt/(2*L)
    return { Geq, Veq: -vPrev*Geq - iPrev }  // sign convention: check against textbook
  },
}
```

Default to Trapezoidal for new sessions, but keep BackwardEuler available (`createSession(..., {integrator: 'backward-euler'})`). Expose a toggle in settings later (Phase 3 UI work).

**Note on Trapezoidal ringing:** Trapezoidal can ring on stiff circuits. Add a "Gear-2" fallback as TODO comment but do not implement in this phase.

### 1.8 BaseComponent extension

Add non-breaking hooks to [BaseComponent.jsx](../src/core/models/BaseComponent.jsx):

```js
class BaseComponent {
  // ... existing ...

  // Declare nonzero locations for this component given its node mapping.
  // Called once during topology build.
  declareSparsity(builder, componentState, nodeMap, extraVarIndices) {
    // Default: assume dense mini-block over all assigned nodes+extra vars.
    // Override for efficiency in big components.
  }

  // True if stamps do NOT depend on X (linear component).
  // Used to skip Newton iteration when all components are linear.
  isLinear() { return true }

  // True if the component has a meaningful DC behavior.
  // Capacitors/inductors override to return their DC companion.
  supportsDC() { return true }

  // Optional: prime internal state (e.g., vCap) for DC start.
  // Called after DC operating point solve, before transient begins.
  initDC(componentState, nodeVoltages) {}
}
```

Default implementations keep all current components working.

### 1.9 App.jsx simulation loop

Replace the inner code of the effect starting at [App.jsx:171](../src/App.jsx#L171):

```js
useEffect(() => {
  if (!state.isSimulating) { /* reset as today */ return }

  const session = createSession(componentsRef.current, wiresRef.current, {
    integrator: state.integrator ?? 'trapezoidal',
  })
  session.solveDC()

  let frameId
  const dt = 0.002
  const subSteps = 10

  const tick = () => {
    try {
      let lastResults
      const transientPropsMap = new Map()
      for (let i = 0; i < subSteps; i++) {
        lastResults = session.step(dt)
        // damage check unchanged
      }
      // dispatch SIMULATION_TICK as today
    } catch (err) { console.error('Simulation error', err) }
    frameId = requestAnimationFrame(tick)
  }

  frameId = requestAnimationFrame(tick)
  return () => { cancelAnimationFrame(frameId); session.dispose() }
}, [state.isSimulating])
```

When topology changes during pause, the session is rebuilt on next start. Live topology edits during simulation already trigger simulation pause in the current UI (`onDrop` blocks it). No change needed there.

## Step-by-step execution

Commit after each step. Each commit must keep the example circuits working.

### Step 1: Introduce SparseMatrix + LU (no behavior change)

- Create `src/core/solver/SparseMatrix.js` and `LUDecomposition.js`.
- Keep `Solver.js` as is for now; just add the new files with unit tests (plain Node scripts in `test/unit/` — framework arrives in Phase 4).
- Validate: dense matrix from a small known system (e.g., `[[4,3],[6,3]] x = [7,9]`) gives the correct `x = [2,-1/3]`.

### Step 2: Extract TopologyBuilder

- Move lines [52–140 of Solver.js](../src/core/Solver.js#L52-L140) into `TopologyBuilder.js`. It returns `{ resolvedNodeMap, numNodes, extraVarMap, mnaSize }`.
- `simulateCircuit` now calls the builder; no behavior change.

### Step 3: Wrap in SolverSession, switch to sparse

- Create `src/core/solver/index.js` with `createSession`.
- `session.step(dt)` does today's work but with SparseMatrix + LU reuse.
- Newton still fixed at 20 iter for now.
- Update [App.jsx:171-258](../src/App.jsx#L171-L258) to use the session.
- Validate: every example circuit produces the same voltages within `1e-6` of the old solver.

### Step 4: Adaptive Newton

- Replace the fixed-20 loop with `runNewton()` from `Newton.js`.
- Query `isLinear()` on every component; if all linear, single solve.
- Validate: linear circuits (simple RC, resistor network) now show fewer iterations in a debug log; voltages unchanged. Nonlinear (blinker, diode-based) still converge.

### Step 5: DC operating point

- Implement `solveDC()` with source stepping.
- Call it once at session creation.
- Validate: blinker no longer needs the `vCap=+8/-8` hack. Remove those lines from `exampleCircuits.js` and confirm the circuit still oscillates (starting condition should now emerge from DC bias noise in the BJT model — if both BJTs are perfectly symmetric, add a tiny asymmetry to one resistor `R1 = 10000 + ε`).

### Step 6: Trapezoidal integrator

- Add `Integrator.js` with both strategies.
- Update capacitor stamp in [Reactive.jsx:52-83](../src/core/models/Reactive.jsx#L52-L83) to call `integrator.companionCapacitor(...)`.
- Default to Trapezoidal. Add `state.integrator` to the reducer (action: `SET_INTEGRATOR`).
- Validate: simple RC circuit (R=1k, C=100μF) with 5V step settles to 5V at τ=0.1s. Time to 63.2% should be within 1% of 100ms. Compare against Backward Euler — Trapezoidal should show less damping.

## Done criteria

- [ ] All files under `src/core/solver/` exist and are covered by at least one smoke test in `test/unit/`.
- [ ] `simulateCircuit` is either deleted or becomes a thin wrapper around `createSession/step`.
- [ ] All circuits in `exampleCircuits.js` run and visually behave identically (or better — fewer startup glitches).
- [ ] On a 100-component stress circuit (create one with a grid of RC pairs), mean `step(dt)` time is **at least 3× faster** than before (measure with `performance.now()` around `tick`).
- [ ] DC operating point produces stable capacitor voltages within one tick on the 555 astable example.
- [ ] Blinker's `vCap=+8/-8` hack is removed.
- [ ] The `BaseComponent` extension hooks are documented in the class JSDoc.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| Trapezoidal rings on stiff circuits | Keep Backward Euler selectable; default can be reverted. |
| DC solve fails on circuits with only current-mode sources (none today, but coming in Phase 2) | Fall back to `X = 0` if DC fails to converge; log a warning. |
| Sparse matrix sparsity declaration incorrect for a component | Builder falls back to a dense block for any component that does not override `declareSparsity`. |
| LU refactor instability when topology is nearly singular (floating nodes) | Preserve the current `Math.abs(pivot) < 1e-12` skip rule; floating nodes still resolve to 0. |

**Rollback strategy:** this phase is gated behind `createSession`. If catastrophic, revert to calling `simulateCircuit` directly in [App.jsx:202](../src/App.jsx#L202) — keep that function exported as a compatibility alias until Phase 4.

## Out of scope (explicitly)

- Rank-1 LU updates for nonlinear devices (future optimization).
- Gear-2 / BDF integrators.
- Real AC sweep (frequency response). Add as a separate future plan.
- Any UI for switching integrator (Phase 3).
- Digital event-driven kernel (Phase 2).
