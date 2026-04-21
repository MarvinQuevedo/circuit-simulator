# Phase 3 — React Performance & UX

## Goal

The simulation engine (Phases 1–2) produces results many times faster than the UI can render them. Today's React tree re-renders every component node every simulation tick because `simulationResults` is a new object reference each frame. This caps usable circuit size well below what the solver can handle.

This phase fixes the render path so a 200+ component circuit stays interactive at 60 fps, and the DebugPanel scales to long simulation runs without memory bloat.

**Expected outcome:** smooth 60 fps with 200+ components; DebugPanel uses bounded memory regardless of simulation duration; UI interactions (drag, rotate) stay responsive during simulation.

## Prerequisites

- None strictly — can run in parallel with Phase 2.
- Benefits from Phase 1's faster solver (otherwise solver bottleneck hides UI wins).

## Impacted files

| Path | Current issue | What changes |
|---|---|---|
| [src/App.jsx](../src/App.jsx) | `simulationResults` dispatched as new object every tick, `state.components` mapped fully on every render | Split store, selectors, stable refs |
| [src/components/ComponentNode.jsx](../src/components/ComponentNode.jsx) | Re-renders on every tick even when its own voltages didn't change | `React.memo` with focused selector subscription |
| [src/components/WireNode.jsx](../src/components/WireNode.jsx) | Same problem | Same fix |
| [src/components/Canvas.jsx](../src/components/Canvas.jsx) | Maps all components every render | Children memoized, key stability |
| [src/components/DebugPanel.jsx](../src/components/DebugPanel.jsx) | Unbounded history, full Array push, SVG re-render of all 300 samples | `Float32Array` ring buffer + canvas-based waterfall |
| [src/store/circuitReducer.js](../src/store/circuitReducer.js) | `SIMULATION_TICK` touches entire state tree | Isolate simulation results from topology state |

## Design

### 3.1 Split simulation results from main state

**Root cause:** currently `SIMULATION_TICK` creates a new `state` object every frame. React sees `state.components` (unchanged reference) but every consumer of `state.simulationResults` re-renders, and because `App.jsx` passes `nodeVoltages={state.simulationResults.nodeVoltages}` into `Canvas`, every `ComponentNode` sees a "new" prop.

**Fix:** simulation results live outside the reducer. Use a separate publish-subscribe store (or `useSyncExternalStore`) that components subscribe to with their own pin IDs as keys.

Create `src/store/simulationStore.js`:

```js
// Plain JS, no React. Updated from the RAF tick.
class SimulationStore {
  constructor() {
    this.nodeVoltages = {}
    this.branchCurrents = {}
    this.simTime = 0
    this.listeners = new Map()  // subscriberKey -> callback
  }

  publish(results, tSim) {
    this.nodeVoltages = results.nodeVoltages
    this.branchCurrents = results.branchCurrents
    this.simTime = tSim
    for (const cb of this.listeners.values()) cb()
  }

  subscribe(key, callback) { this.listeners.set(key, callback); return () => this.listeners.delete(key) }

  getVoltage(pinId) { return this.nodeVoltages[pinId] ?? 0 }
  getCurrent(branchId) { return this.branchCurrents[branchId] ?? 0 }
}

export const simulationStore = new SimulationStore()
```

Components consume via a hook backed by `useSyncExternalStore`:

```js
export function usePinVoltage(pinId) {
  return useSyncExternalStore(
    cb => simulationStore.subscribe(pinId, cb),
    () => simulationStore.getVoltage(pinId),
  )
}
```

### 3.2 Memoize ComponentNode

In [ComponentNode.jsx](../src/components/ComponentNode.jsx):

```js
const ComponentNode = React.memo(function ComponentNode(props) {
  const { component } = props
  // Subscribe only to pin voltages this component cares about:
  const pinVoltages = usePinVoltages(component.pins.map(p => p.id))
  const current = useBranchCurrent(component.id)
  // ... existing render logic ...
}, (prev, next) => {
  // Re-render only if component identity, selection, or zoom changes.
  // Voltage changes come through the hook above.
  return prev.component === next.component
    && prev.isSelected === next.isSelected
    && prev.zoom === next.zoom
    && prev.vizMode === next.vizMode
    && prev.showProbes === next.showProbes
})
```

Same pattern for [WireNode.jsx](../src/components/WireNode.jsx) — subscribes to `branchCurrents[wire.id]`.

**Trade-off:** each component now creates its own subscription. 200 components means 200 listeners per publish. That's still cheap (a map iteration), but if it becomes hot, optimize with a per-pin-id indexed listener registry in `SimulationStore`.

### 3.3 Remove simulation results from reducer

Update [circuitReducer.js](../src/store/circuitReducer.js):

- Delete `state.simulationResults`.
- `SET_SIMULATION_RESULTS` action → no-op or removed.
- `SIMULATION_TICK` only handles `updatedComponentProperties` (damaged state, counter value, vCap, etc.), not the voltage/current maps.

Update [App.jsx](../src/App.jsx) tick loop:

```js
const tick = () => {
  const results = session.step(dt)
  // Publish to external store (doesn't trigger reducer re-render):
  simulationStore.publish(results, simTimeRef.current)
  // Only dispatch reducer when component state actually changed:
  if (Object.keys(results.updatedComponentProperties).length > 0) {
    dispatch({ type: 'SIMULATION_TICK', payload: results.updatedComponentProperties })
  }
  frameId = requestAnimationFrame(tick)
}
```

### 3.4 DebugPanel: ring buffer + canvas waterfall

Replace [DebugPanel.jsx](../src/components/DebugPanel.jsx) sample storage with a typed ring buffer:

```js
// src/components/debug/RingBuffer.js
export class FloatRingBuffer {
  constructor(capacity, channels) {
    this.capacity = capacity
    this.channels = channels
    this.buffer = new Float32Array(capacity * channels)
    this.times = new Float32Array(capacity)
    this.head = 0
    this.count = 0
  }
  push(t, values) {
    const i = this.head
    this.times[i] = t
    this.buffer.set(values, i * this.channels)
    this.head = (this.head + 1) % this.capacity
    this.count = Math.min(this.count + 1, this.capacity)
  }
  getChannel(ch, out) { /* copy ordered into out */ }
}
```

Capacity: `2048` samples (~40 seconds at 50 Hz publish rate if we downsample, or ~4 seconds at every-step).

**Downsampling:** publish to the ring buffer only every N simulation steps (N ≈ 5–10, configurable). For zoomed-out views, apply LTTB (largest-triangle-three-buckets) to the read path so the waterfall always draws ≤ 500 points regardless of total samples.

**Rendering:** move waterfall from SVG to `<canvas>`. One `ctx.beginPath + stroke` per channel is orders of magnitude faster than 300 SVG `<line>` elements.

### 3.5 Canvas children key stability

In [Canvas.jsx](../src/components/Canvas.jsx), ensure:

```js
{components.map(c => renderComponent(c, handlers, zoom))}
```

... receives a stable `key` per component (already `c.id` — verify) and that `renderComponent` is memoized with `useCallback` **once** at mount, not re-created every render.

### 3.6 Selector patterns for PropertiesPanel

[PropertiesPanel.jsx](../src/components/PropertiesPanel.jsx) should not re-render when `selectedElementId` is unchanged but `state.components` identity is new. Wrap in `React.memo` and select the specific component inside:

```js
const PropertiesPanel = React.memo(function PropertiesPanel({ elementId, dispatch }) {
  const component = useSelector(state => state.components.find(c => c.id === elementId))
  // ...
})
```

(If we don't add `useSelector`, inline the `useMemo` with `[state.components, elementId]` deps.)

## Step-by-step execution

### Step 1: Measure baseline

- Add `performance.mark` around the RAF tick in [App.jsx:181](../src/App.jsx#L181).
- Load a stress circuit (create `data/stressCircuit.js` with a 10×10 grid of RC pairs — 200 components, 300 wires).
- Record baseline: frame time, components rendered per frame (React DevTools Profiler).
- Commit the stress circuit example.

### Step 2: Extract SimulationStore

- Create `src/store/simulationStore.js` and `src/hooks/usePinVoltage.js`.
- Not wired yet. Just unit-test publish/subscribe with Node.
- Commit.

### Step 3: Wire SimulationStore alongside existing reducer

- In [App.jsx:247](../src/App.jsx#L247), also call `simulationStore.publish(finalResults, simTime)`.
- Reducer still receives `SIMULATION_TICK` with voltages/currents — no components consume the store yet.
- Validate: nothing breaks.
- Commit.

### Step 4: Migrate ComponentNode and WireNode

- Wrap both in `React.memo` with custom comparators.
- Replace prop drill of `nodeVoltages` / `simulationCurrent` with the hooks.
- Validate on stress circuit: frame time drops significantly; voltages still update visibly.
- Commit.

### Step 5: Drop simulation results from reducer

- Remove `simulationResults` from `initialState`.
- Remove `SET_SIMULATION_RESULTS` action.
- Trim `SIMULATION_TICK` to only propagate `updatedComponentProperties`.
- Update `window.simulator.getVoltages` to read from the store.
- Validate all `window.simulator` console helpers still work.
- Commit.

### Step 6: DebugPanel ring buffer + canvas

- Replace `debugHistoryRef.current` Array with `FloatRingBuffer`.
- Replace SVG waterfall with a canvas-based renderer in [DebugPanel.jsx](../src/components/DebugPanel.jsx).
- Validate: panel can run for 10 minutes at 60 fps without the main thread hitching.
- Commit.

### Step 7: Verify regressions and measure

- Re-run the stress circuit profile.
- Target: ≥ 2× improvement in frame time vs. Step 1 baseline.
- Load each example circuit and visually confirm behavior.
- Commit a PERFORMANCE.md note in `docs/` with before/after numbers (Phase 4 will expand this file).

## Done criteria

- [ ] Stress circuit (200 components) renders at ≥ 60 fps on a mid-range laptop during active simulation.
- [ ] React DevTools Profiler shows `ComponentNode` re-renders only when its own voltages/props change (not every tick).
- [ ] `state.simulationResults` is gone from the reducer; all voltage reads go through `simulationStore`.
- [ ] DebugPanel memory footprint is O(1) in simulation duration — verify with Chrome Memory profiler: no retained arrays growing over a 5-minute run.
- [ ] All example circuits render identically to Phase 2.
- [ ] `window.simulator.getVoltages()` and friends keep working (the console API is a documented contract).

## Risks and rollback

| Risk | Mitigation |
|---|---|
| `useSyncExternalStore` tearing on concurrent React features | Use the standard React 18+ hook; it guarantees consistent snapshots. |
| Per-pin subscriptions overflow listener count on large circuits | Benchmark: for 500 components, 1500 listeners × 60 publishes/sec = 90k calls/sec. Still fine. If it regresses, batch per-pin listeners into per-component listeners. |
| DebugPanel canvas doesn't match previous SVG styling | Carefully replicate the glassmorphism waterfall look; add a visual regression test (screenshot) before/after. |
| Losing `simulationResults` in reducer breaks undo/redo (it shouldn't — they were never in the undo stack, but verify) | Confirm undo/redo tests still pass (Phase 4 adds them). |

**Rollback:** each step is independently revertable. Step 5 (dropping from reducer) is the only semi-destructive one — keep a local branch checkpoint before that step.

## Out of scope

- Web Worker offloading for the solver (add as a future plan; significant architectural change).
- Virtualization of canvas children (only needed at 1000+ components).
- WebGL-based canvas renderer (only needed if we hit canvas 2D limits).
