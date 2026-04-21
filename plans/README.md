# Circuit Simulator — Improvement Plans

This directory contains execution plans to modernize the simulator. Each plan is self-contained: an agent can execute it without re-exploring the rest of the repo.

## Recommended execution order

Phases have dependencies. Follow this order unless noted otherwise:

1. **[phase-1-solver-foundations.md](phase-1-solver-foundations.md)** — Rebuild the MNA core (sparse storage, LU caching, adaptive Newton-Raphson, optional Trapezoidal integrator, proper DC operating point). Prerequisite for everything else.
2. **[phase-2-mixed-signal-kernel.md](phase-2-mixed-signal-kernel.md)** — Split the digital kernel (event-driven) from analog MNA. Add inductor, current source, transformer. Requires Phase 1.
3. **[phase-3-react-performance.md](phase-3-react-performance.md)** — Memoization, typed ring buffers, selectors, DebugPanel downsampling. Independent of Phase 2 (can run in parallel).
4. **[phase-4-tests-docs.md](phase-4-tests-docs.md)** — Vitest suite, regression tests for example circuits, architecture documentation. Run last.

## How to execute a plan

Each plan file contains:

- **Goal** — the problem being solved and why.
- **Impacted files** — paths and current line ranges.
- **Steps** — concrete technical design with proposed function signatures.
- **Done criteria** — unambiguous validation targets.
- **Risks and rollback** — what can break and how to recover.

In a new Claude Code session:

```
Execute the plan in circuit-simulator/plans/phase-1-solver-foundations.md
```

The agent should:
1. Read the entire plan.
2. Verify current state (line numbers may have drifted).
3. Implement steps in order.
4. Validate against the done criteria.
5. Commit per phase (or per sub-step if the plan specifies).

## Invariants to preserve across all phases

- Example circuits in [src/data/exampleCircuits.js](../src/data/exampleCircuits.js) must keep working (blinker, 555, counter, etc.). Verify manually after each phase.
- The `BaseComponent` public API in [src/core/models/BaseComponent.jsx](../src/core/models/BaseComponent.jsx) may be extended but **not broken** — existing models must still load.
- The reducer in [src/store/circuitReducer.js](../src/store/circuitReducer.js) may add actions; existing actions must keep their contract.
- The localStorage save schema (`circuit-backup`) must be preserved or migrated with backwards compatibility.

## Project state at plan creation (2026-04-20)

- React 19.2 + Vite 7.3, no linear algebra library.
- Solver: dense Gauss-Jordan, fixed 20-iter Newton-Raphson, Backward Euler only.
- 27 component types registered under [src/core/models/](../src/core/models/).
- No inductor, current source, AC sweep, or separate DC operating point.
- Digital components co-simulated as analog (no event-driven kernel).
- Manual tests only (`test-solver.js`, `test-capacitor.mjs`, `test-wires.js`) — no framework.
- No architecture docs; generic Vite README.

Consult each plan for the details of how to tackle each point.
