# Circuit Simulator

An interactive analog/digital circuit simulator built with React and Vite. Place components on a canvas, wire them together, and watch voltages and currents update in real time at 60 fps.

## Features

- **MNA solver** — Modified Nodal Analysis with LU decomposition and partial pivoting
- **Transient simulation** — Trapezoidal integration (2nd-order) with optional Backward Euler fallback
- **DC operating point** — Source-stepping for reliable initial conditions
- **Nonlinear devices** — Newton-Raphson iteration for diodes and BJTs
- **Component library** — Resistor, Capacitor, Inductor, Diode, NPN BJT, DC Voltage/Current Source, Ground, LED, and more
- **Oscilloscope** — Real-time voltage waveform viewer in the debug panel
- **Glassmorphism UI** — Dark-mode canvas with sidebar and properties panel

## Quickstart

```bash
npm install
npm run dev        # starts Vite dev server at http://localhost:5173
```

## Testing

```bash
npm test           # watch mode (Vitest)
npm run test:run   # single run
npm run test:ui    # browser UI
npm run test:coverage
```

26 tests across unit (solver, store) and integration (RC circuit, resistor divider).

## Browser requirements

Chrome 90+ or Firefox 90+ (uses `ResizeObserver`, `useSyncExternalStore`, ES2020).

## Project layout

```
src/
  core/
    solver/          MNA solver (TopologyBuilder, LU, Newton, Integrator, DCOperatingPoint)
    models/          Component model classes (BaseComponent + concrete types)
    ComponentDefs.js Model registry + COMPONENT_DEFINITIONS
  store/
    circuitReducer.js  Topology + UI state (undo/redo, JSON)
    simulationStore.js External voltage/current pub/sub (bypasses React)
  hooks/
    useSimulation.js   usePinVoltages, useBranchCurrent (useSyncExternalStore wrappers)
  components/          React UI: Canvas, Sidebar, ComponentNode, WireNode, DebugPanel
  App.jsx              RAF simulation loop, session lifecycle
docs/
  architecture.md      Data flow, session lifecycle, key files
  solver-internals.md  MNA stamps, companion models, Newton, LU
  model-authoring.md   How to add a new component model
  performance.md       Timing, render path, complexity table, tuning knobs
plans/               Phase implementation plans (historical)
test/
  unit/              Solver and store unit tests
  integration/       RC circuit and resistor divider end-to-end tests
```

## Contributing

See [docs/architecture.md](docs/architecture.md) for the data flow and [docs/model-authoring.md](docs/model-authoring.md) to add new component models.

## License

MIT
