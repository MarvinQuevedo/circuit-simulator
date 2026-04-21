# Phase 4 — Tests & Documentation

## Goal

Establish a real automated test suite (Vitest) and a concise, well-organized documentation set so the simulator is maintainable by future contributors (and future AI agents) without re-reading the entire codebase.

**Expected outcome:** every change goes through CI-ready tests; new contributors can author a component model in under an hour using the authoring guide; the solver's behavior is specified, not just coded.

## Prerequisites

- Phases 1–3 should be complete so docs describe the final architecture.
- Can be started in parallel with Phase 3 if docs are stubbed and filled in after.

## Impacted files

| Path | Current state | What changes |
|---|---|---|
| [test-solver.js](../test-solver.js), [test-capacitor.mjs](../test-capacitor.mjs), [test-wires.js](../test-wires.js) | Manual Node scripts, no framework | Migrated into Vitest under `test/` |
| [package.json](../package.json) | No test script, no dev deps for testing | Adds `vitest`, `@vitest/ui`, `test` scripts |
| [README.md](../README.md) | Default Vite template | Replaced with project-specific quickstart |
| (new) `docs/` | Does not exist | Created with 5 core docs |
| (new) `CLAUDE.md` | Does not exist | Created with agent-oriented project primer |
| [vite.config.js](../vite.config.js) | Minimal | Adds Vitest config (or creates `vitest.config.js`) |

## Design

### 4.1 Test framework setup

Use **Vitest** — native Vite integration, Jest-compatible API, runs in jsdom or happy-dom for React components.

Add to [package.json](../package.json):

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "@vitest/ui": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "happy-dom": "^15.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.5.0"
  }
}
```

Create `vitest.config.js`:

```js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./test/setup.js'],
  },
})
```

### 4.2 Test directory layout

```
test/
├── setup.js                     — global matchers, DOM helpers
├── unit/
│   ├── solver/
│   │   ├── SparseMatrix.test.js
│   │   ├── LUDecomposition.test.js
│   │   ├── Newton.test.js
│   │   ├── Integrator.test.js
│   │   └── DCOperatingPoint.test.js
│   ├── models/
│   │   ├── Resistor.test.js
│   │   ├── Capacitor.test.js
│   │   ├── Inductor.test.js
│   │   ├── Diode.test.js
│   │   ├── NPN.test.js
│   │   └── DigitalGates.test.js
│   ├── store/
│   │   ├── circuitReducer.test.js
│   │   └── simulationStore.test.js
│   └── hooks/
│       └── usePinVoltage.test.js
├── integration/
│   ├── rcStepResponse.test.js
│   ├── lcTank.test.js
│   ├── blinker.test.js
│   ├── counter555.test.js
│   └── shiftRegister.test.js
└── fixtures/
    └── circuits/                — JSON exports of known-good circuits
```

### 4.3 Minimum coverage targets

- **Solver core:** 90%. Every stamp path, every integrator, both DC and transient.
- **Component models:** 80%. Each model's `applyMNA`, `extractCurrent`, `getUpdatedProperties`, `checkDamage`.
- **Reducer:** 95% (actions are pure, easy to cover).
- **React components:** 50%. Focus on behavioral tests (drag selects, switch toggles), not snapshot tests.

### 4.4 Key test patterns

**Analog integration test (`rcStepResponse.test.js`):**

```js
import { createSession } from '@/core/solver'
import { buildCircuit } from '@/test/fixtures/builders'

test('RC low-pass: 5V step settles to 5V at tau=0.1s', () => {
  const { components, wires } = buildCircuit({
    source: { type: 'DC_VOLTAGE_SOURCE', voltage: 5 },
    R: { type: 'RESISTOR', resistance: 1000 },
    C: { type: 'CAPACITOR', capacitance: 100e-6 },
    // ... wiring ...
  })
  const session = createSession(components, wires)
  session.solveDC()

  const samples = []
  for (let t = 0; t < 0.5; t += 0.001) {
    const r = session.step(0.001)
    samples.push({ t, vC: r.nodeVoltages[capOutPin] })
  }

  const vAtTau = samples.find(s => Math.abs(s.t - 0.1) < 0.001).vC
  expect(vAtTau).toBeCloseTo(5 * (1 - Math.exp(-1)), 2)  // ≈ 3.16V
  expect(samples[samples.length - 1].vC).toBeCloseTo(5, 2)
})
```

**Digital kernel test:**

```js
test('D flip-flop captures D on rising CLK edge after tPd', () => {
  const kernel = new DigitalKernel(/* netlist */)
  kernel.schedule('D', 'H', 0)
  kernel.schedule('CLK', 'H', 10e-9)
  kernel.advance(50e-9)  // advance past tPd (10ns default)
  expect(kernel.levelOf('Q')).toBe('H')
})
```

**Regression fixtures:** export every example circuit as JSON in `test/fixtures/circuits/` and assert key nodes reach known steady-state values. If a refactor changes physics, these tests will flag it.

### 4.5 Documentation set under `docs/`

Create five focused documents:

#### `docs/architecture.md`

High-level map: data flow from UI → reducer → session → kernels → publish → render. One diagram (ASCII is fine; prefer [mermaid](https://mermaid.js.org/) if rendering is available). Includes the 2-phase session lifecycle (topology build vs. hot-path step) and the mixed-signal ordering rule.

#### `docs/solver-internals.md`

MNA fundamentals, stamp conventions, sparse storage layout, LU reuse strategy, Newton convergence criteria, integrator formulas (Backward Euler & Trapezoidal derivations), DC operating point algorithm. Cross-references the actual code with file:line links.

#### `docs/digital-kernel.md`

Event queue design, 4-valued logic semantics, propagation delay model, the D→A / A→D interface contract, mixed-signal ordering and its 1-dt latency trade-off. Explicitly lists what the digital kernel does NOT simulate (metastability, noise margin details, race conditions within a single propagation window).

#### `docs/model-authoring.md`

Step-by-step guide: create a new component model. Covers:

1. Decide analog / digital / interface.
2. Extend `BaseComponent`, implement required hooks.
3. Declare sparsity (or rely on dense fallback).
4. Register with the registry.
5. Add to sidebar and icon rendering.
6. Write a unit test.

Includes a complete worked example (e.g., a thermistor model — simple enough to fit in one page, novel enough not to duplicate existing code).

#### `docs/performance.md`

Current benchmark numbers, how to profile (Chrome DevTools + React Profiler), known bottlenecks, tuning knobs (`subSteps`, `integrator`, `tolerance`, `debugSampleRate`). Before/after numbers from Phases 1–3.

### 4.6 Root-level docs

#### `README.md` — rewrite

Current [README.md](../README.md) is the default Vite template. Replace with:

- One-paragraph pitch.
- Screenshot.
- Quickstart (`npm install`, `npm run dev`, `npm test`).
- Link to `docs/architecture.md` for contributors.
- Browser requirements.
- License.

Keep it under 100 lines. Everything deeper goes in `docs/`.

#### `CLAUDE.md` — new

Agent-oriented primer. Distinct from human-facing README. Contents:

- Repo layout at 1000-foot view.
- Key files an agent is likely to touch, with their roles.
- The mixed-signal session lifecycle — explicitly called out because it's the least obvious part.
- Testing conventions (how to add a test, how to run just the solver tests, how to run regressions).
- The invariants from `plans/README.md` (don't break example circuits, don't break the `BaseComponent` contract).
- Where NOT to look for logic (e.g., "styling is inline; don't look for CSS modules").
- Spanish-speaking user preference, glassmorphism UI style.

### 4.7 Inline JSDoc upgrade

Sweep [BaseComponent.jsx](../src/core/models/BaseComponent.jsx), [Solver/index.js](../src/core/solver/index.js), and [simulationStore.js](../src/store/simulationStore.js) for complete JSDoc. Each public method should have `@param`, `@returns`, and one-sentence description. IDE autocomplete becomes the first-line reference.

## Step-by-step execution

### Step 1: Install Vitest and scaffold

- Run `npm install -D vitest @vitest/ui @vitest/coverage-v8 happy-dom @testing-library/react @testing-library/jest-dom`.
- Create `vitest.config.js` and `test/setup.js`.
- Add scripts to [package.json](../package.json).
- Verify: `npm test -- --run` runs (even if no tests yet).
- Commit.

### Step 2: Port existing manual tests

- Convert `test-solver.js` → `test/unit/solver/smoke.test.js`.
- Convert `test-capacitor.mjs` → `test/integration/capacitor.test.js`.
- Convert `test-wires.js` → `test/unit/topology.test.js`.
- Delete the old scripts.
- Commit.

### Step 3: Core solver tests

- Write tests for `SparseMatrix`, `LUDecomposition`, `Newton`, `Integrator`, `DCOperatingPoint`.
- Commit.

### Step 4: Model tests

- Write per-model tests for every component. Each test instantiates the model, calls `applyMNA` with a small fake matrix, and verifies stamp values.
- Commit per category (passive, semi, sources, digital).

### Step 5: Integration regression suite

- Export every circuit in [exampleCircuits.js](../src/data/exampleCircuits.js) as a JSON fixture.
- Write one integration test per circuit that runs for a defined time window and asserts a key observable (e.g., blinker LED alternates; 555 oscillates at calculated frequency).
- Commit.

### Step 6: React component tests (light)

- Test `ComponentNode` rerenders correctly with voltage changes.
- Test reducer actions (add, remove, undo, redo, damage).
- Commit.

### Step 7: Author the 5 docs

- Write `docs/architecture.md`, `docs/solver-internals.md`, `docs/digital-kernel.md`, `docs/model-authoring.md`, `docs/performance.md`.
- Each doc should include file:line references to the real code.
- Commit per doc.

### Step 8: Root README and CLAUDE.md

- Rewrite `README.md`.
- Create `CLAUDE.md`.
- Commit.

### Step 9: CI workflow (optional)

- Create `.github/workflows/ci.yml` to run `npm test -- --run` on push.
- Add a badge to README.
- Commit.

## Done criteria

- [ ] `npm test` runs and passes with > 100 tests.
- [ ] `npm run test:coverage` reports ≥ 80% line coverage on `src/core/` and `src/store/`.
- [ ] Every circuit in `exampleCircuits.js` has a regression integration test.
- [ ] `docs/` contains the 5 documents, each under 500 lines, with working code links.
- [ ] A new contributor can follow `docs/model-authoring.md` to add a component (tested by actually adding a throwaway "Potentiometer" model following only the guide, then reverting — the exercise proves the guide works).
- [ ] `README.md` no longer mentions "Vite React template".
- [ ] `CLAUDE.md` exists and references the simulator's unique concerns (mixed-signal ordering, inline styles, Spanish-speaking user).
- [ ] The three legacy test files (`test-solver.js`, `test-capacitor.mjs`, `test-wires.js`) are deleted.

## Risks and rollback

| Risk | Mitigation |
|---|---|
| Test suite becomes a maintenance burden | Keep integration tests small and focused on observable behavior, not implementation details. |
| Docs rot as code evolves | Every doc references file:line; Phase 4 includes a CLAUDE.md directive to update docs whenever affected files change. |
| Coverage target misleads ("90% but tests weak") | Prefer assertion density over line coverage; review that each core test makes ≥ 3 meaningful assertions. |
| Mermaid diagrams don't render in the IDE preview | Use ASCII art as primary and mermaid as enhancement. |

**Rollback:** tests are purely additive. Docs are pure Markdown. Either can be reverted without touching production code.

## Out of scope

- End-to-end UI tests with Playwright (future plan if complexity warrants it).
- Visual regression testing (screenshot diffs).
- A full contribution guide (`CONTRIBUTING.md`) — add when the project takes external contributions.
- Auto-generated API docs from JSDoc (not valuable at this scale).
