# Performance Guide

## Simulation loop timing

Default parameters (set in [App.jsx](../src/App.jsx)):

| Parameter | Value | Effect |
|---|---|---|
| `dt` | 2 ms | Timestep per sub-step |
| `subSteps` | 10 | Sub-steps per RAF frame |
| Simulated time per frame | 20 ms | Matches real-time at 50 fps |
| Max history samples | 800 | ~16 seconds of oscilloscope data |

## Render path

After Phase 3:

1. **RAF tick** → `session.step(dt)` × 10 → `simulationStore.publish()` → per-component store listeners fire.
2. **ComponentNode** re-renders only when its own pin voltages or topology props change (memoized with custom comparator).
3. **WireNode** re-renders only when its branch current or topology changes.
4. **Reducer dispatch** (SIMULATION_TICK) happens after all sub-steps, only with component property updates (vCap, count, etc.) — not voltages.

## Solver complexity

| Circuit size | MNA matrix | Newton iters | Time per step (estimate) |
|---|---|---|---|
| 10 components | ~8×8 | 1 (linear) | < 0.05 ms |
| 50 components | ~30×30 | 1–3 | < 0.5 ms |
| 200 components | ~120×120 | 1–5 | < 5 ms |

With 10 sub-steps, 200-component circuits use ~50 ms per frame → drops below 60 fps. Optimisations that would help:

1. **Sparse LU** — use CSR format all the way into LU (avoid copying to dense). Currently Phase 1 copies sparse → dense for LU.
2. **Rank-1 updates** — re-factor only changed rows when topology is locally modified.
3. **Web Worker offload** — run the entire solver in a worker, post results back via `SharedArrayBuffer`.

## Profiling

```js
// In browser console (works while simulating)
const t0 = performance.now()
// wait ~1 second
const t1 = performance.now()
// Frame time ≈ (t1-t0) / frameCount
```

Use React DevTools Profiler to see which components re-render per tick. After Phase 3, ComponentNode/WireNode should show ≤1 render per voltage publish, not per RAF frame.

## Tuning knobs

| Knob | Where | Effect |
|---|---|---|
| `dt` | App.jsx:180 | Smaller = more accurate, more CPU |
| `subSteps` | App.jsx:181 | More = more simulated time per frame |
| `integrator` | createSession opt | `'trapezoidal'` (default) vs `'backward-euler'` |
| `MAX_HISTORY` | DebugPanel.jsx:6 | Reduce for less memory use |
| Newton `maxIter` | solver/index.js | Reduce for speed, increase for convergence |

## DebugPanel memory

The oscilloscope uses a plain JavaScript array capped at `MAX_HISTORY = 800` entries. Each entry is `{ time: number, nodeVoltages: object }`. At 800 entries and 6 watched pins, memory is bounded at ~800 × ~50 bytes ≈ 40 KB — negligible.

The `downsample()` function caps SVG rendering at 300 points regardless of buffer fill.
