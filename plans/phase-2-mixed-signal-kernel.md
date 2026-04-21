# Phase 2 — Mixed-Signal Kernel

## Goal

Today every component — including digital gates, counters, and clocks — is stamped into the analog MNA matrix every timestep. A 4-bit counter updates 40+ unknowns per step even when no input changed. This wastes CPU and obscures real digital behavior (setup/hold, propagation delay).

This phase **splits the kernel** into two cooperating solvers:

- **Analog MNA** (from Phase 1) — continuous voltages, currents, stateful reactive elements.
- **Digital event queue** — discrete logic levels with propagation delays, only recomputes on change.

The two are bridged at **interface components** (D→A output buffers and A→D input samplers).

Also adds three first-class analog components missing today: **inductor**, **current source**, and **ideal transformer**.

**Expected outcome:** digital-heavy circuits (shift registers, counters) run 5–10× faster; digital timing becomes realistic; Phase 3 UI work can surface a digital waveform view.

## Prerequisites

- Phase 1 complete. The `SolverSession` API and `BaseComponent` hooks are live.

## Impacted files

| Path | Current role | What changes |
|---|---|---|
| [src/core/solver/index.js](../src/core/solver/index.js) | Analog session (from Phase 1) | Wraps both kernels via `MixedSignalSession` |
| [src/core/models/Digital.jsx](../src/core/models/Digital.jsx) | All digital components stamped into MNA | Split: logic in new digital models, analog interface via buffer |
| [src/core/models/Reactive.jsx](../src/core/models/Reactive.jsx) | Capacitor, BJTs | Adds Inductor |
| [src/core/models/Sources.jsx](../src/core/models/Sources.jsx) | DC / AC voltage, Ground | Adds DC current source |
| [src/core/ComponentRegistry.js](../src/core/ComponentRegistry.js) | Component registration | Accepts a `domain: 'analog' \| 'digital'` tag |
| [src/App.jsx](../src/App.jsx) | Simulation loop | Calls `MixedSignalSession.step(dt)` instead of analog-only |

## Design

### 2.1 Domain tagging

Extend the registry to record each model's domain:

```js
// src/core/ComponentRegistry.js
registry.register(model, { domain: 'digital' | 'analog' | 'interface' })
```

- `analog` — stamped into MNA (resistor, capacitor, BJT, diode, source).
- `digital` — handled by the digital kernel only (AND, OR, flip-flops, counters).
- `interface` — exists in both; the component produces analog output from digital state, or digital input from sampled analog voltage.

### 2.2 Digital kernel

Create `src/core/solver/digital/`:

```
src/core/solver/digital/
├── DigitalKernel.js     — event queue, netlist, schedule()
├── DigitalNet.js        — logical net (analogous to MNA node)
├── DigitalGate.js       — base class for gates/flip-flops
└── models/              — AND, OR, NOT, XOR, D-flip-flop, counter, shift register
```

**Event-driven execution:**

```js
class DigitalKernel {
  constructor(netlist) { /* build nets, init levels to 'X' */ }

  // Called by MixedSignalSession at t.
  // Processes all events at time <= t, returns list of nets that changed.
  advance(t) -> changedNets[]

  // Called by interface components to inject a digital edge.
  schedule(netId, newLevel, time) {}

  // Read current logic level of a net (for interface components).
  levelOf(netId) -> 'H' | 'L' | 'X' | 'Z'
}
```

**Levels:** 4-valued logic — `H` (high), `L` (low), `X` (unknown), `Z` (high-impedance). `X` and `Z` propagate through gates per standard truth tables.

**Propagation delay:** each gate has `tPd` (default 10ns). Gate output change schedules at `t + tPd`. This makes waveforms realistic and prevents combinational races from looping infinitely in one timestep.

**No clock recomputation:** the clock source schedules edges at `t + 1/(2f)`, not sampled every tick. This alone cuts CPU for clock-driven circuits dramatically.

### 2.3 Interface components

Two new abstract base classes in `src/core/models/interface/`:

```js
// D→A: reads logic level from DigitalKernel, stamps analog voltage into MNA.
class DigitalOutputBuffer extends BaseComponent {
  get domain() { return 'interface' }
  applyMNA(A, Z, state, nodeMap, extraVarIndices, prevV, dt) {
    const level = kernel.levelOf(state.digitalInputNet)
    const v = { H: 5.0, L: 0.0, X: 2.5, Z: null }[level]
    if (v === null) return  // high-Z: no stamp
    // Stamp as Thevenin: Vout source with 50Ω internal resistance
    // (matches today's `R=50` digital output resistance)
  }
}

// A→D: samples node voltage at end of MNA solve, schedules digital edge if level crossed threshold.
class AnalogInputSampler extends BaseComponent {
  get domain() { return 'interface' }
  sampleAfterSolve(state, nodeVoltages, tSim) {
    const v = nodeVoltages[state.pins[0].id]
    const newLevel = v > 2.0 ? 'H' : v < 0.8 ? 'L' : 'X'
    if (newLevel !== state.lastLevel) {
      kernel.schedule(state.digitalOutputNet, newLevel, tSim)
      state.lastLevel = newLevel
    }
  }
}
```

Every existing digital component ([Digital.jsx](../src/core/models/Digital.jsx)) becomes a composition of:

1. `AnalogInputSampler` on each input pin.
2. A pure-logic `DigitalGate` subclass.
3. `DigitalOutputBuffer` on each output pin.

Drawn as a single icon on the canvas, but under the hood it's three concerns.

### 2.4 MixedSignalSession

Top-level orchestration, replacing the Phase 1 `SolverSession` as the public API:

```js
// src/core/solver/MixedSignalSession.js
class MixedSignalSession {
  constructor(components, wires, options) {
    this.analog = new AnalogSession(analogComponents, wires, options)
    this.digital = new DigitalKernel(digitalNetlist)
    this.interface = interfaceComponents
    this.tSim = 0
  }

  step(dt) {
    // 1) Let digital kernel advance to current sim time. If any digital net changed,
    //    the next MNA solve will re-stamp the D→A buffers with new voltages.
    const changed = this.digital.advance(this.tSim)

    // 2) Solve analog MNA for this dt.
    const results = this.analog.step(dt)

    // 3) Let A→D samplers check for threshold crossings and schedule digital events.
    for (const sampler of this.interface.filter(c => c.isADSampler)) {
      sampler.sampleAfterSolve(c, results.nodeVoltages, this.tSim)
    }

    this.tSim += dt
    return results
  }
}
```

The two-pass-per-step ordering (digital-first, then analog, then digital sampling) is a **deliberate simplification**: it avoids iterative mixed-signal convergence within a single timestep. Trade-off: one dt of latency across mixed-signal boundaries. At the default dt=2ms this is imperceptible. Note this explicitly in docs (Phase 4).

### 2.5 New analog components

#### Inductor

Add to [Reactive.jsx](../src/core/models/Reactive.jsx) after Capacitor:

```js
class Inductor extends BaseComponent {
  get type() { return 'INDUCTOR' }
  get defaultProperties() { return { inductance: 1e-3, iL: 0, maxCurrent: 5 } }
  getExtraVariablesCount() { return 1 }  // branch current

  applyMNA(A, Z, state, nodeMap, extraVarIndices, prevV, dt) {
    const [n1, n2] = state.pins.map(p => nodeMap.get(p.id))
    const iIdx = extraVarIndices[0]
    const { Geq, Veq } = integrator.companionInductor(state.properties.inductance, prevV[n1]-prevV[n2], state.properties.iL, dt)
    // KVL: V(n1) - V(n2) - Z_ind * i = Veq
    // Z_ind = 1/Geq (effective series impedance)
    // Standard inductor companion stamp — see any SPICE textbook
  }

  getUpdatedProperties(state, nodeVoltages, extraVars, dt) {
    return { iL: extraVars[0] }  // persist branch current for next step
  }

  isLinear() { return true }
  supportsDC() { return true }  // DC: inductor is a short
}
```

#### DC Current source

Add to [Sources.jsx](../src/core/models/Sources.jsx):

```js
class DCCurrentSource extends BaseComponent {
  get type() { return 'DC_CURRENT_SOURCE' }
  get defaultProperties() { return { current: 0.01 } }
  getExtraVariablesCount() { return 0 }  // no extra var — direct RHS injection

  applyMNA(A, Z, state, nodeMap) {
    const [n1, n2] = state.pins.map(p => nodeMap.get(p.id))
    const I = state.properties.current
    if (n1 > 0) Z[n1-1] -= I  // current leaves n1
    if (n2 > 0) Z[n2-1] += I  // enters n2
  }
}
```

#### Ideal transformer (optional, low priority)

Skip in this phase unless time remains. If added, use the standard 2-port MNA stamp with turns ratio `N`, requires 2 extra variables (primary and secondary branch currents).

## Step-by-step execution

### Step 1: Domain tagging

- Add `domain` to registry metadata in [ComponentRegistry.js](../src/core/ComponentRegistry.js).
- Tag all existing models: analog by default, digital for gates/counters/clock/shift-reg/decoder, interface for 7seg display.
- No behavior change.

### Step 2: Inductor + DC current source

- Implement both as described. They're pure analog, no digital kernel needed.
- Validate: LC tank circuit (L=1mH, C=1μF) oscillates at expected 5033 Hz (f = 1/(2π√LC)). Verify on oscilloscope.
- DC source: driving a 1kΩ resistor from 10mA current source gives 10V across it.
- Commit.

### Step 3: Digital kernel skeleton

- Create `src/core/solver/digital/DigitalKernel.js`, `DigitalNet.js`, `DigitalGate.js`.
- Unit tests: priority queue, level propagation, `X`/`Z` handling.
- Not yet wired into the simulation — pure library work.
- Commit.

### Step 4: Migrate one gate (AND) as pilot

- Create `AndGate` in `src/core/models/digital/AndGate.jsx` using the new architecture.
- Register under a new type (`AND_GATE_V2`) to avoid breaking existing circuits.
- Wire through `MixedSignalSession`.
- Validate: a circuit with `AND_GATE_V2` gives the same output as the original `AND_GATE` under all input combinations.
- Commit.

### Step 5: Migrate remaining gates, flip-flops, clock

- Port NOT, OR, XOR, NAND, NOR, D flip-flop, counter, shift register, clock source.
- Keep both old and new registered; show new ones under the "Digital v2" category in the sidebar.
- Commit per family (gates, flip-flops, sequential).

### Step 6: Switch default, deprecate old digital

- Update [exampleCircuits.js](../src/data/exampleCircuits.js) to use new digital types.
- Add a migration in `LOAD_CIRCUIT` action: remap old type IDs to new ones.
- Remove old digital models.
- Commit.

### Step 7: Propagation delay UI (optional)

- Expose `tPd` as a property editable in [PropertiesPanel.jsx](../src/components/PropertiesPanel.jsx).
- Default 10ns per gate (typical 74HC).

## Done criteria

- [ ] Every digital component in the sidebar uses the new kernel.
- [ ] A circuit of 32 chained NOT gates toggled via a clock runs at least 5× faster than the old implementation (measure `tick` duration).
- [ ] LC tank circuit oscillates at the analytic frequency within 2% over 100 cycles.
- [ ] Current source + resistor circuit shows correct DC voltage within 1mV.
- [ ] All example circuits in [exampleCircuits.js](../src/data/exampleCircuits.js) still work.
- [ ] Propagation delay is observable: clocking a D-flip-flop at 50 MHz with a 20 ns gate shows the expected 20 ns Q delay on the oscilloscope.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| Oscillations across mixed-signal boundary (A→D→A feedback loops) | Propagation delay gates enforce at least one dt between edges. Document ordering as 1 dt latency. |
| Existing circuits break when old digital models removed | Migrate stepwise via `V2` types first; keep both registered for 1–2 commits; migrate example circuits; only then delete old. |
| `X`/`Z` propagation semantics differ from user expectation | Add a "treat X as L/H" fallback mode, on by default to match current behavior. |
| Inductor stamp sign errors (common bug) | Cross-check with SPICE textbook (Vladimirescu §3.3); write unit test against analytic RL step response. |

**Rollback strategy:** steps 4–6 are gated by new type IDs. At any point, revert the example circuits to old types and keep the old models. The digital kernel can be dormant without breaking analog.

## Out of scope

- Analog behavioral models (opamps, comparators as ideal) — separate plan.
- Switching power supply models.
- Transmission lines.
- Ideal transformer (nice-to-have, include only if bandwidth allows).
- Real spice netlist import.
